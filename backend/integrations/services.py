from datetime import timedelta
import base64
import json
from decimal import Decimal
from urllib import error, parse, request

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from bookings.models import Booking, Guest, RatePlan, Room
from bookings.services import modify_confirmed_booking
from integrations.models import OTAChannelRatePlanMapping, OTAChannelRoomTypeMapping, OTAReservationImport, OTAWebhookEvent, OTASyncJob
from notifications.services import create_ota_reservation_review_notification, create_ota_reservation_reviewed_notification


class OTASyncError(Exception):
    pass


ZODOMUS_DEFAULT_BASE_URL = 'https://api.zodomus.com'


def _audit(action, instance, *, actor=None, changes=None, metadata=None):
    try:
        from audit.services import log_audit_event

        log_audit_event(action=action, instance=instance, actor=actor, changes=changes or {}, metadata=metadata or {})
    except Exception:
        pass


def _notify_review_needed(reservation_import):
    if reservation_import.status in ['pending', 'conflict']:
        create_ota_reservation_review_notification(reservation_import)


def _date_range(date_from, date_to):
    current = date_from
    while current < date_to:
        yield current
        current += timedelta(days=1)


def room_type_availability(room_type, stay_date):
    total_rooms = Room.objects.filter(room_type=room_type).exclude(status='maintenance').count()
    occupied = Booking.objects.filter(
        room__room_type=room_type,
        check_in_date__lte=stay_date,
        check_out_date__gt=stay_date,
    ).exclude(status__in=['cancelled', 'no_show']).count()
    return max(total_rooms - occupied, 0)


def build_availability_payload(channel, *, date_from, date_to):
    rows = []
    mappings = channel.room_type_mappings.select_related('room_type').filter(is_active=True, room_type__is_active=True)
    for mapping in mappings:
        for stay_date in _date_range(date_from, date_to):
            rows.append({
                'date': stay_date.isoformat(),
                'room_type_id': str(mapping.room_type_id),
                'room_type_code': mapping.room_type.code,
                'external_room_type_id': mapping.external_room_type_id,
                'available': room_type_availability(mapping.room_type, stay_date),
            })
    return rows


def build_rate_payload(channel, *, date_from, date_to):
    rows = []
    mappings = channel.rate_plan_mappings.select_related('rate_plan', 'rate_plan__room_type').filter(is_active=True, rate_plan__is_active=True)
    for mapping in mappings:
        rate_plan = mapping.rate_plan
        for stay_date in _date_range(date_from, date_to):
            if rate_plan.valid_from <= stay_date <= rate_plan.valid_to:
                rows.append({
                    'date': stay_date.isoformat(),
                    'rate_plan_id': str(rate_plan.id),
                    'rate_plan_name': rate_plan.name,
                    'room_type_code': rate_plan.room_type.code,
                    'external_rate_plan_id': mapping.external_rate_plan_id,
                    'rate': str(rate_plan.base_rate),
                })
    return rows


def _zodomus_base_url(channel):
    return (channel.base_url or ZODOMUS_DEFAULT_BASE_URL).rstrip('/')


def _zodomus_channel_id(channel):
    return (channel.settings or {}).get('channel_id')


def _zodomus_property_id(channel):
    settings = channel.settings or {}
    return settings.get('property_id') or settings.get('hotel_id') or settings.get('external_property_id')


def _zodomus_credentials(channel):
    if (channel.settings or {}).get('test_mode'):
        return channel.api_key or 'local-test-user', channel.api_secret or 'local-test-password'
    if not channel.api_key or not channel.api_secret:
        raise OTASyncError('Zodomus API user and password are required.')
    return channel.api_key, channel.api_secret


def _zodomus_test_response(channel, method, path, payload=None, query=None):
    if path == '/channels':
        return {
            'mode': 'local_test',
            'channels': [
                {
                    'id': (channel.settings or {}).get('channel_code') or channel.code,
                    'name': channel.name,
                    'property_id': (channel.settings or {}).get('property_id') or 'LOCAL-ZODOMUS',
                }
            ],
        }
    if path == '/availability':
        return {
            'mode': 'local_test',
            'status': 'accepted',
            'records': len((payload or {}).get('availability') or (payload or {}).get('records') or []),
        }
    if path == '/rates':
        return {
            'mode': 'local_test',
            'status': 'accepted',
            'records': len((payload or {}).get('rates') or (payload or {}).get('records') or []),
        }
    if path == '/reservations-createtest':
        return {
            'mode': 'local_test',
            'status': 'created',
            'reservation_id': f"LOCAL-{timezone.now().strftime('%Y%m%d%H%M%S')}",
            'payload': payload or {},
        }
    return {'mode': 'local_test', 'status': 'ok', 'path': path}


def _zodomus_request(channel, method, path, payload=None, query=None):
    if (channel.settings or {}).get('test_mode'):
        return _zodomus_test_response(channel, method, path, payload=payload, query=query)

    api_user, api_password = _zodomus_credentials(channel)
    url = f'{_zodomus_base_url(channel)}{path}'
    if query:
        url = f'{url}?{parse.urlencode(query)}'
    auth = base64.b64encode(f'{api_user}:{api_password}'.encode()).decode()
    body = json.dumps(payload or {}).encode() if payload is not None else None
    req = request.Request(
        url,
        data=body,
        headers={
            'Accept': 'application/json',
            'Authorization': f'Basic {auth}',
            'Content-Type': 'application/json; charset=UTF-8',
        },
        method=method,
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            response_body = response.read().decode()
            return json.loads(response_body) if response_body else {}
    except error.HTTPError as exc:
        detail = exc.read().decode()
        raise OTASyncError(f'Zodomus request failed: {detail}') from exc
    except error.URLError as exc:
        raise OTASyncError(f'Zodomus request failed: {exc.reason}') from exc
    except json.JSONDecodeError as exc:
        raise OTASyncError('Zodomus returned an invalid JSON response.') from exc


def zodomus_payload(channel, rows, *, payload_type):
    property_id = _zodomus_property_id(channel)
    channel_id = _zodomus_channel_id(channel)
    payload = {
        'property_id': property_id,
        'propertyId': property_id,
        'channel': (channel.settings or {}).get('channel_code') or channel.code,
        'channelId': channel_id,
        'records': rows,
    }
    if payload_type == 'availability':
        payload['availability'] = rows
    if payload_type == 'rates':
        payload['rates'] = rows
    return payload


def push_zodomus_availability(channel, rows):
    channel_id = _zodomus_channel_id(channel)
    property_id = _zodomus_property_id(channel)
    responses = []
    for row in rows:
        stay_date = parse_date(row['date'])
        if not stay_date:
            continue
        responses.append(
            _zodomus_request(
                channel,
                'POST',
                '/availability',
                {
                    'channelId': channel_id,
                    'propertyId': property_id,
                    'roomId': row['external_room_type_id'],
                    'dateFrom': stay_date.isoformat(),
                    'dateTo': (stay_date + timedelta(days=1)).isoformat(),
                    'availability': row['available'],
                },
            )
        )
    return {'requests': len(responses), 'responses': responses}


def push_zodomus_rates(channel, rows):
    channel_id = _zodomus_channel_id(channel)
    property_id = _zodomus_property_id(channel)
    currency_code = (channel.settings or {}).get('currency_code') or 'NPR'
    responses = []
    for row in rows:
        stay_date = parse_date(row['date'])
        if not stay_date:
            continue
        room_mapping = OTAChannelRoomTypeMapping.objects.filter(
            channel=channel,
            room_type__code=row['room_type_code'],
            is_active=True,
        ).select_related('room_type').first()
        if not room_mapping:
            continue
        responses.append(
            _zodomus_request(
                channel,
                'POST',
                '/rates',
                {
                    'channelId': channel_id,
                    'propertyId': property_id,
                    'roomId': room_mapping.external_room_type_id,
                    'rateId': row['external_rate_plan_id'],
                    'dateFrom': stay_date.isoformat(),
                    'dateTo': (stay_date + timedelta(days=1)).isoformat(),
                    'currencyCode': currency_code,
                    'prices': {
                        'price': row['rate'],
                    },
                },
            )
        )
    return {'requests': len(responses), 'responses': responses}


def check_zodomus_connection(channel):
    return _zodomus_request(channel, 'GET', '/channels')


def fetch_zodomus_room_rates(channel):
    settings = channel.settings or {}
    query = {}
    if settings.get('property_id'):
        query['propertyId'] = settings['property_id']
    if settings.get('channel_id'):
        query['channelId'] = settings['channel_id']
    return _zodomus_request(channel, 'GET', '/room-rates', query=query or None)


def activate_zodomus_rooms(channel):
    channel_id = _zodomus_channel_id(channel)
    property_id = _zodomus_property_id(channel)
    room_mappings = list(
        channel.room_type_mappings.select_related('room_type')
        .filter(is_active=True, room_type__is_active=True)
        .order_by('external_room_type_id')
    )
    if not room_mappings:
        raise OTASyncError('No active room type mappings exist for this channel.')

    rate_ids = list(
        channel.rate_plan_mappings.filter(is_active=True)
        .order_by('external_rate_plan_id')
        .values_list('external_rate_plan_id', flat=True)
    )
    if not rate_ids:
        raise OTASyncError('No active rate plan mappings exist for this channel.')

    payload = {
        'channelId': channel_id,
        'propertyId': property_id,
        'rooms': [],
    }
    for mapping in room_mappings:
        quantity = Room.objects.filter(room_type=mapping.room_type).exclude(status='maintenance').count()
        payload['rooms'].append(
            {
                'roomId': mapping.external_room_type_id,
                'roomName': mapping.external_room_type_name or mapping.room_type.name,
                'quantity': max(quantity, 1),
                'status': 1,
                'rates': rate_ids,
            }
        )
    return _zodomus_request(channel, 'POST', '/rooms-activation', payload=payload)


def fetch_zodomus_reservations_queue(channel):
    return _zodomus_request(
        channel,
        'GET',
        '/reservations-queue',
        query={
            'channelId': _zodomus_channel_id(channel),
            'propertyId': _zodomus_property_id(channel),
        },
    )


def fetch_zodomus_reservation(channel, reservation_id):
    return _zodomus_request(
        channel,
        'GET',
        '/reservations',
        query={
            'channelId': _zodomus_channel_id(channel),
            'propertyId': _zodomus_property_id(channel),
            'reservationId': reservation_id,
        },
    )


def extract_zodomus_property_id(provider_response):
    if not isinstance(provider_response, dict):
        return ''
    for key in ['property_id', 'propertyId', 'hotel_id', 'hotelId', 'account_id', 'accountId']:
        if provider_response.get(key):
            return str(provider_response[key])
    for collection_key in ['properties', 'hotels', 'accounts', 'data', 'results']:
        values = provider_response.get(collection_key)
        if isinstance(values, list) and values:
            first = values[0] if isinstance(values[0], dict) else {}
            for key in ['property_id', 'propertyId', 'hotel_id', 'hotelId', 'account_id', 'accountId', 'id']:
                if first.get(key):
                    return str(first[key])
    return ''


def create_zodomus_test_reservation(channel, payload):
    reservation_payload = dict(payload)
    reservation_payload.setdefault('status', 'new')
    reservation_payload.setdefault('reservationId', f"TEST-{timezone.now().strftime('%Y%m%d%H%M%S')}")
    reservation_payload = {
        'channelId': _zodomus_channel_id(channel),
        'propertyId': _zodomus_property_id(channel),
        **reservation_payload,
    }
    return _zodomus_request(channel, 'POST', '/reservations-createtest', reservation_payload)


def _zodomus_queue_status_to_event_type(status_value):
    status_map = {
        1: 'reservation.created',
        '1': 'reservation.created',
        2: 'reservation.modified',
        '2': 'reservation.modified',
        3: 'reservation.canceled',
        '3': 'reservation.canceled',
    }
    return status_map.get(status_value, 'reservation.created')


def _flatten_zodomus_reservation_detail(detail_response, *, queue_item=None):
    reservation_data = ((detail_response or {}).get('reservations') or {})
    reservation = reservation_data.get('reservation') if isinstance(reservation_data, dict) else {}
    customer = reservation_data.get('customer') if isinstance(reservation_data, dict) else {}
    rooms = reservation_data.get('rooms') if isinstance(reservation_data, dict) else []
    primary_room = rooms[0] if rooms else {}
    primary_price = (primary_room.get('prices') or [{}])[0] if isinstance(primary_room, dict) else {}

    arrival_dates = [parse_date(str(room.get('arrivalDate') or '')) for room in rooms if isinstance(room, dict)]
    departure_dates = [parse_date(str(room.get('departureDate') or '')) for room in rooms if isinstance(room, dict)]
    arrival_dates = [value for value in arrival_dates if value]
    departure_dates = [value for value in departure_dates if value]

    return {
        'reservation_id': reservation.get('id') or (queue_item or {}).get('id') or '',
        'event_type': _zodomus_queue_status_to_event_type((queue_item or {}).get('status') or reservation.get('status')),
        'external_room_type_id': primary_room.get('id') or '',
        'external_rate_plan_id': primary_price.get('rateId') or '',
        'guest_first_name': customer.get('firstName') or '',
        'guest_last_name': customer.get('lastName') or '',
        'guest_email': customer.get('email') or '',
        'guest_phone': customer.get('phone') or '',
        'check_in_date': min(arrival_dates).isoformat() if arrival_dates else '',
        'check_out_date': max(departure_dates).isoformat() if departure_dates else '',
        'number_of_guests': primary_room.get('numberOfGuests') or len(rooms) or 1,
        'total_amount': reservation.get('totalPrice') or '',
        'currency': reservation.get('currencyCode') or '',
        'raw_detail': detail_response,
    }


def pull_zodomus_reservations(channel):
    if channel.provider != 'zodomus':
        raise OTASyncError('Reservation pull is currently implemented for Zodomus channels.')
    if not channel.is_active:
        raise OTASyncError('OTA channel is inactive.')
    job = OTASyncJob.objects.create(channel=channel, sync_type='booking_pull')
    job.mark_running()
    try:
        queue_response = fetch_zodomus_reservations_queue(channel)
        queue_items = queue_response.get('reservations') or []
        processed = []
        imports_created = 0
        imports_updated = 0
        for queue_item in queue_items:
            reservation_id = queue_item.get('id') if isinstance(queue_item, dict) else ''
            if not reservation_id:
                continue
            detail_response = fetch_zodomus_reservation(channel, reservation_id)
            flattened = _flatten_zodomus_reservation_detail(detail_response, queue_item=queue_item)
            event_type = flattened.get('event_type')
            if event_type == 'reservation.canceled':
                reservation_import = mark_reservation_cancellation_for_review(channel, flattened)
            elif event_type == 'reservation.modified':
                reservation_import = mark_reservation_modification_for_review(channel, flattened)
            else:
                reservation_import = create_or_update_reservation_import(channel, flattened)
            processed.append(
                {
                    'reservation_id': reservation_id,
                    'event_type': event_type,
                    'status': reservation_import.status,
                    'conflict_type': reservation_import.conflict_type,
                }
            )
            if reservation_import.created_at == reservation_import.updated_at:
                imports_created += 1
            else:
                imports_updated += 1
        job.mark_succeeded(
            {
                'records': len(processed),
                'imports_created': imports_created,
                'imports_updated': imports_updated,
                'queue_size': len(queue_items),
                'processed': processed,
                'provider_response': {'queue': queue_response},
            }
        )
        return job
    except Exception as exc:
        job.mark_failed(exc)
        raise


def run_zodomus_test_reservation(channel, payload):
    if channel.provider != 'zodomus':
        raise OTASyncError('Test reservations are currently implemented for Zodomus channels.')
    if not channel.is_active:
        raise OTASyncError('OTA channel is inactive.')
    job = OTASyncJob.objects.create(channel=channel, sync_type='booking_pull')
    job.mark_running()
    try:
        provider_response = create_zodomus_test_reservation(channel, payload)
        if (channel.settings or {}).get('test_mode'):
            test_payload = {
                **payload,
                'reservation_id': provider_response.get('reservation_id'),
                'event_type': 'reservation.created',
            }
            create_or_update_reservation_import(channel, test_payload)
        job.mark_succeeded({'provider_response': provider_response, 'request_payload': payload})
        return job
    except Exception as exc:
        job.mark_failed(exc)
        raise


def _first_value(payload, *keys, default=''):
    for key in keys:
        value = payload.get(key)
        if value not in [None, '']:
            return value
    return default


def normalize_zodomus_reservation_payload(payload):
    guest = payload.get('guest') if isinstance(payload.get('guest'), dict) else {}
    stay = payload.get('stay') if isinstance(payload.get('stay'), dict) else {}
    room = payload.get('room') if isinstance(payload.get('room'), dict) else {}
    rate = payload.get('rate') if isinstance(payload.get('rate'), dict) else {}
    amount = _first_value(payload, 'total_amount', 'amount', 'price', default=None)
    return {
        'external_reservation_id': str(_first_value(payload, 'reservation_id', 'external_reservation_id', 'id', 'booking_id')),
        'external_room_type_id': str(_first_value(payload, 'external_room_type_id', 'room_type_id', default=room.get('id') or room.get('room_type_id') or '')),
        'external_rate_plan_id': str(_first_value(payload, 'external_rate_plan_id', 'rate_plan_id', default=rate.get('id') or rate.get('rate_plan_id') or '')),
        'guest_first_name': str(_first_value(payload, 'guest_first_name', 'first_name', default=guest.get('first_name') or guest.get('firstName') or '')),
        'guest_last_name': str(_first_value(payload, 'guest_last_name', 'last_name', default=guest.get('last_name') or guest.get('lastName') or '')),
        'guest_email': str(_first_value(payload, 'guest_email', 'email', default=guest.get('email') or '')),
        'guest_phone': str(_first_value(payload, 'guest_phone', 'phone', default=guest.get('phone') or '')),
        'check_in_date': _first_value(payload, 'check_in_date', 'checkin', 'arrival_date', default=stay.get('check_in') or stay.get('arrival')),
        'check_out_date': _first_value(payload, 'check_out_date', 'checkout', 'departure_date', default=stay.get('check_out') or stay.get('departure')),
        'number_of_guests': int(_first_value(payload, 'number_of_guests', 'guests', 'occupancy', default=1) or 1),
        'total_amount': str(amount) if amount not in [None, ''] else '',
        'currency': str(_first_value(payload, 'currency', default='')),
    }


def _decimal_or_none(value):
    if value in [None, '']:
        return None
    return Decimal(str(value))


def _reservation_conflict(channel, normalized):
    check_in_date = parse_date(str(normalized.get('check_in_date') or ''))
    check_out_date = parse_date(str(normalized.get('check_out_date') or ''))
    if not check_in_date or not check_out_date or check_out_date <= check_in_date:
        return 'invalid_dates', 'Reservation dates are missing or invalid.'

    room_mapping = OTAChannelRoomTypeMapping.objects.filter(
        channel=channel,
        external_room_type_id=normalized.get('external_room_type_id') or '',
        is_active=True,
    ).select_related('room_type').first()
    if not room_mapping:
        return 'missing_mapping', 'No local room type mapping exists for this OTA room type.'

    room = find_available_room(room_mapping.room_type, check_in_date=check_in_date, check_out_date=check_out_date)
    if not room:
        return 'no_room_available', 'No local room is available for the requested stay dates.'

    guest_email = normalized.get('guest_email') or ''
    if guest_email and Guest.objects.filter(email=guest_email, vip_level='blacklist').exists():
        return 'guest_blacklisted', 'Guest is marked do not book.'

    return 'none', ''


def find_available_room(room_type, *, check_in_date, check_out_date):
    rooms = Room.objects.filter(room_type=room_type).exclude(status='maintenance').order_by('room_number')
    for room in rooms:
        has_conflict = Booking.objects.filter(
            room=room,
            check_in_date__lt=check_out_date,
            check_out_date__gt=check_in_date,
            status__in=['confirmed', 'checked_in'],
        ).exists()
        if not has_conflict:
            return room
    return None


def create_or_update_reservation_import(channel, payload, *, webhook_event=None):
    normalized = normalize_zodomus_reservation_payload(payload)
    external_reservation_id = normalized.get('external_reservation_id')
    if not external_reservation_id:
        raise OTASyncError('Reservation payload does not include an external reservation id.')

    conflict_type, conflict_message = _reservation_conflict(channel, normalized)
    status = 'pending' if conflict_type == 'none' else 'conflict'
    defaults = {
        'webhook_event': webhook_event,
        'external_room_type_id': normalized.get('external_room_type_id', ''),
        'external_rate_plan_id': normalized.get('external_rate_plan_id', ''),
        'status': status,
        'conflict_type': conflict_type,
        'conflict_message': conflict_message,
        'guest_first_name': normalized.get('guest_first_name', ''),
        'guest_last_name': normalized.get('guest_last_name', ''),
        'guest_email': normalized.get('guest_email', ''),
        'guest_phone': normalized.get('guest_phone', ''),
        'check_in_date': parse_date(str(normalized.get('check_in_date') or '')),
        'check_out_date': parse_date(str(normalized.get('check_out_date') or '')),
        'number_of_guests': normalized.get('number_of_guests') or 1,
        'total_amount': _decimal_or_none(normalized.get('total_amount')),
        'currency': normalized.get('currency', ''),
        'raw_payload': payload,
        'normalized_payload': normalized,
    }
    reservation_import, created = OTAReservationImport.objects.update_or_create(
        channel=channel,
        external_reservation_id=external_reservation_id,
        defaults=defaults,
    )
    if not created and reservation_import.booking_id:
        reservation_import.status = 'accepted'
        reservation_import.conflict_type = 'duplicate'
        reservation_import.conflict_message = 'Reservation has already been accepted into a local booking.'
        reservation_import.save(update_fields=['status', 'conflict_type', 'conflict_message', 'updated_at'])
    _notify_review_needed(reservation_import)
    _audit(
        'update' if not created else 'create',
        reservation_import,
        changes={'status': reservation_import.status, 'conflict_type': reservation_import.conflict_type},
        metadata={'source': 'ota_webhook', 'webhook_event_id': webhook_event.id if webhook_event else None},
    )
    return reservation_import


def mark_reservation_modification_for_review(channel, payload, *, webhook_event=None):
    normalized = normalize_zodomus_reservation_payload(payload)
    external_reservation_id = normalized.get('external_reservation_id')
    if not external_reservation_id:
        raise OTASyncError('Reservation payload does not include an external reservation id.')
    reservation_import = OTAReservationImport.objects.filter(channel=channel, external_reservation_id=external_reservation_id).first()
    if not reservation_import:
        return create_or_update_reservation_import(channel, payload, webhook_event=webhook_event)

    reservation_import.webhook_event = webhook_event
    reservation_import.external_room_type_id = normalized.get('external_room_type_id', reservation_import.external_room_type_id)
    reservation_import.external_rate_plan_id = normalized.get('external_rate_plan_id', reservation_import.external_rate_plan_id)
    reservation_import.guest_first_name = normalized.get('guest_first_name', reservation_import.guest_first_name)
    reservation_import.guest_last_name = normalized.get('guest_last_name', reservation_import.guest_last_name)
    reservation_import.guest_email = normalized.get('guest_email', reservation_import.guest_email)
    reservation_import.guest_phone = normalized.get('guest_phone', reservation_import.guest_phone)
    reservation_import.check_in_date = parse_date(str(normalized.get('check_in_date') or '')) or reservation_import.check_in_date
    reservation_import.check_out_date = parse_date(str(normalized.get('check_out_date') or '')) or reservation_import.check_out_date
    reservation_import.number_of_guests = normalized.get('number_of_guests') or reservation_import.number_of_guests
    reservation_import.total_amount = _decimal_or_none(normalized.get('total_amount')) or reservation_import.total_amount
    reservation_import.currency = normalized.get('currency', reservation_import.currency)
    reservation_import.raw_payload = payload
    reservation_import.normalized_payload = normalized
    reservation_import.status = 'conflict'
    reservation_import.conflict_type = 'modification_review'
    reservation_import.conflict_message = 'OTA reservation modification requires operator review.'
    reservation_import.save()
    _notify_review_needed(reservation_import)
    _audit(
        'update',
        reservation_import,
        changes={'status': reservation_import.status, 'conflict_type': reservation_import.conflict_type},
        metadata={'source': 'ota_modification', 'webhook_event_id': webhook_event.id if webhook_event else None},
    )
    return reservation_import


def mark_reservation_cancellation_for_review(channel, payload, *, webhook_event=None):
    normalized = normalize_zodomus_reservation_payload(payload)
    external_reservation_id = normalized.get('external_reservation_id')
    if not external_reservation_id:
        raise OTASyncError('Reservation payload does not include an external reservation id.')
    reservation_import = OTAReservationImport.objects.filter(channel=channel, external_reservation_id=external_reservation_id).first()
    if not reservation_import:
        reservation_import = OTAReservationImport.objects.create(
            channel=channel,
            webhook_event=webhook_event,
            external_reservation_id=external_reservation_id,
            raw_payload=payload,
            normalized_payload=normalized,
        )
    reservation_import.webhook_event = webhook_event
    reservation_import.status = 'conflict'
    reservation_import.conflict_type = 'cancellation_review'
    reservation_import.conflict_message = 'OTA cancellation requires operator review.'
    reservation_import.raw_payload = payload
    reservation_import.normalized_payload = normalized
    reservation_import.save(update_fields=['webhook_event', 'status', 'conflict_type', 'conflict_message', 'raw_payload', 'normalized_payload', 'updated_at'])
    _notify_review_needed(reservation_import)
    _audit(
        'update',
        reservation_import,
        changes={'status': reservation_import.status, 'conflict_type': reservation_import.conflict_type},
        metadata={'source': 'ota_cancellation', 'webhook_event_id': webhook_event.id if webhook_event else None},
    )
    return reservation_import


@transaction.atomic
def accept_reservation_import(reservation_import, *, user=None, notes=''):
    if reservation_import.status == 'accepted' and reservation_import.booking_id:
        return reservation_import.booking
    if reservation_import.status not in ['pending', 'conflict']:
        raise OTASyncError('Only pending or conflict imports can be accepted.')
    if not reservation_import.check_in_date or not reservation_import.check_out_date or reservation_import.check_out_date <= reservation_import.check_in_date:
        raise OTASyncError('Reservation dates are invalid.')

    room_mapping = OTAChannelRoomTypeMapping.objects.filter(
        channel=reservation_import.channel,
        external_room_type_id=reservation_import.external_room_type_id,
        is_active=True,
    ).select_related('room_type').first()
    if not room_mapping:
        raise OTASyncError('No local room type mapping exists for this reservation.')
    room = find_available_room(room_mapping.room_type, check_in_date=reservation_import.check_in_date, check_out_date=reservation_import.check_out_date)
    if not room:
        raise OTASyncError('No local room is available for this reservation.')

    guest_email = reservation_import.guest_email or f'ota-{reservation_import.channel_id}-{reservation_import.external_reservation_id}@ota.local'
    guest, _ = Guest.objects.get_or_create(
        email=guest_email,
        defaults={
            'first_name': reservation_import.guest_first_name or 'OTA',
            'last_name': reservation_import.guest_last_name or 'Guest',
            'phone': reservation_import.guest_phone,
        },
    )
    if guest.vip_level == 'blacklist':
        raise OTASyncError('Guest is marked do not book.')

    rate_mapping = OTAChannelRatePlanMapping.objects.filter(
        channel=reservation_import.channel,
        external_rate_plan_id=reservation_import.external_rate_plan_id,
        is_active=True,
    ).select_related('rate_plan').first()
    booking = Booking.objects.create(
        room=room,
        guest=guest,
        rate_plan=rate_mapping.rate_plan if rate_mapping else None,
        check_in_date=reservation_import.check_in_date,
        check_out_date=reservation_import.check_out_date,
        number_of_guests=reservation_import.number_of_guests,
        status='confirmed',
        special_requests=f'Imported from {reservation_import.channel.name}: {reservation_import.external_reservation_id}',
    )
    reservation_import.booking = booking
    reservation_import.status = 'accepted'
    reservation_import.conflict_type = 'none'
    reservation_import.conflict_message = ''
    reservation_import.reviewed_by = user
    reservation_import.reviewed_at = timezone.now()
    if notes:
        reservation_import.review_notes = notes
    reservation_import.save(update_fields=['booking', 'status', 'conflict_type', 'conflict_message', 'reviewed_by', 'reviewed_at', 'review_notes', 'updated_at'])
    create_ota_reservation_reviewed_notification(reservation_import, action='accepted', created_by=user)
    _audit(
        'update',
        reservation_import,
        actor=user,
        changes={'status': 'accepted', 'booking_id': str(booking.id)},
        metadata={'action': 'accept_ota_reservation', 'notes': notes},
    )
    return booking


@transaction.atomic
def apply_reservation_modification(reservation_import, *, user=None, notes=''):
    if reservation_import.conflict_type != 'modification_review':
        raise OTASyncError('Only modification review imports can be applied as modifications.')
    if not reservation_import.booking_id:
        raise OTASyncError('Reservation import has no local booking to modify.')
    booking = reservation_import.booking
    if booking.status != 'confirmed':
        raise OTASyncError('Only confirmed bookings can be modified from OTA updates.')

    room_mapping = OTAChannelRoomTypeMapping.objects.filter(
        channel=reservation_import.channel,
        external_room_type_id=reservation_import.external_room_type_id,
        is_active=True,
    ).select_related('room_type').first()
    if not room_mapping:
        raise OTASyncError('No local room type mapping exists for this reservation.')
    room = find_available_room(room_mapping.room_type, check_in_date=reservation_import.check_in_date, check_out_date=reservation_import.check_out_date)
    if room is None and booking.room.room_type_id == room_mapping.room_type_id:
        room = booking.room
    if room is None:
        raise OTASyncError('No local room is available for the modified reservation dates.')

    modify_confirmed_booking(
        booking,
        room=room,
        check_in_date=reservation_import.check_in_date,
        check_out_date=reservation_import.check_out_date,
        number_of_guests=reservation_import.number_of_guests,
        special_requests=f'OTA modification applied from {reservation_import.channel.name}: {reservation_import.external_reservation_id}',
    )
    reservation_import.status = 'accepted'
    reservation_import.conflict_type = 'none'
    reservation_import.conflict_message = ''
    reservation_import.reviewed_by = user
    reservation_import.reviewed_at = timezone.now()
    if notes:
        reservation_import.review_notes = notes
    reservation_import.save(update_fields=['status', 'conflict_type', 'conflict_message', 'reviewed_by', 'reviewed_at', 'review_notes', 'updated_at'])
    create_ota_reservation_reviewed_notification(reservation_import, action='modified', created_by=user)
    _audit(
        'update',
        reservation_import,
        actor=user,
        changes={'status': 'accepted', 'conflict_type': 'none', 'booking_id': str(booking.id)},
        metadata={'action': 'apply_ota_modification', 'notes': notes},
    )
    return booking


@transaction.atomic
def apply_reservation_cancellation(reservation_import, *, user=None, notes=''):
    if reservation_import.conflict_type != 'cancellation_review':
        raise OTASyncError('Only cancellation review imports can be applied as cancellations.')
    if not reservation_import.booking_id:
        reservation_import.mark_reviewed(status='canceled', user=user, notes=notes)
        create_ota_reservation_reviewed_notification(reservation_import, action='canceled', created_by=user)
        _audit(
            'update',
            reservation_import,
            actor=user,
            changes={'status': 'canceled'},
            metadata={'action': 'apply_ota_cancellation', 'notes': notes},
        )
        return None
    booking = reservation_import.booking
    if booking.status not in ['confirmed']:
        raise OTASyncError('Only confirmed bookings can be canceled from OTA updates.')
    booking.status = 'cancelled'
    booking.save(update_fields=['status', 'updated_at'])
    reservation_import.status = 'canceled'
    reservation_import.reviewed_by = user
    reservation_import.reviewed_at = timezone.now()
    if notes:
        reservation_import.review_notes = notes
    reservation_import.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_notes', 'updated_at'])
    create_ota_reservation_reviewed_notification(reservation_import, action='canceled', created_by=user)
    _audit(
        'update',
        reservation_import,
        actor=user,
        changes={'status': 'canceled', 'booking_status': booking.status, 'booking_id': str(booking.id)},
        metadata={'action': 'apply_ota_cancellation', 'notes': notes},
    )
    return booking


def run_availability_sync(channel, *, date_from, date_to):
    if not channel.is_active:
        raise OTASyncError('OTA channel is inactive.')
    job = OTASyncJob.objects.create(channel=channel, sync_type='availability_push', date_from=date_from, date_to=date_to)
    job.mark_running()
    try:
        payload = build_availability_payload(channel, date_from=date_from, date_to=date_to)
        provider_response = None
        if channel.provider == 'zodomus':
            provider_response = push_zodomus_availability(channel, payload)
        job.mark_succeeded({'records': len(payload), 'payload': payload, 'provider_response': provider_response})
        return job
    except Exception as exc:
        job.mark_failed(exc)
        raise


def run_rate_sync(channel, *, date_from, date_to):
    if not channel.is_active:
        raise OTASyncError('OTA channel is inactive.')
    job = OTASyncJob.objects.create(channel=channel, sync_type='rate_push', date_from=date_from, date_to=date_to)
    job.mark_running()
    try:
        payload = build_rate_payload(channel, date_from=date_from, date_to=date_to)
        provider_response = None
        if channel.provider == 'zodomus':
            provider_response = push_zodomus_rates(channel, payload)
        job.mark_succeeded({'records': len(payload), 'payload': payload, 'provider_response': provider_response})
        return job
    except Exception as exc:
        job.mark_failed(exc)
        raise


def record_webhook_event(channel, *, external_event_id, event_type='', payload=None):
    if not external_event_id:
        raise OTASyncError('Webhook event requires an external event id.')
    return OTAWebhookEvent.objects.get_or_create(
        channel=channel,
        external_event_id=external_event_id,
        defaults={
            'event_type': event_type,
            'payload': payload or {},
        },
    )


def process_webhook_event(event):
    job = OTASyncJob.objects.create(
        channel=event.channel,
        sync_type='webhook',
        status='running',
        started_at=timezone.now(),
        summary={'event_id': event.external_event_id, 'event_type': event.event_type},
    )
    try:
        reservation_import = None
        if event.event_type in ['reservation.canceled', 'reservation.cancelled', 'booking.canceled', 'booking.cancelled']:
            reservation_import = mark_reservation_cancellation_for_review(event.channel, event.payload, webhook_event=event)
        elif event.event_type in ['reservation.modified', 'booking.modified']:
            reservation_import = mark_reservation_modification_for_review(event.channel, event.payload, webhook_event=event)
        elif event.event_type in ['reservation.created', 'booking.created', 'reservation']:
            reservation_import = create_or_update_reservation_import(event.channel, event.payload, webhook_event=event)
        event.mark_processed()
        summary = {'event_id': event.external_event_id, 'event_type': event.event_type}
        if reservation_import:
            summary['reservation_import_id'] = reservation_import.id
            summary['reservation_import_status'] = reservation_import.status
            summary['conflict_type'] = reservation_import.conflict_type
        job.mark_succeeded(summary)
        return job
    except Exception as exc:
        event.mark_failed(exc)
        job.mark_failed(exc)
        raise
