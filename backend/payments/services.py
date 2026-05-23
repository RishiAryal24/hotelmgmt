from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from payments.models import PaymentIntent


class PaymentIntentError(ValueError):
    pass


TERMINAL_STATUSES = {'succeeded', 'failed', 'canceled'}


def create_payment_intent(*, source_module, source_id, amount, currency='NPR', provider='manual', idempotency_key, description='', metadata=None, created_by=None):
    amount = Decimal(str(amount))
    if amount <= 0:
        raise PaymentIntentError('Payment amount must be greater than zero.')
    if source_module not in dict(PaymentIntent.SOURCE_CHOICES):
        raise PaymentIntentError('Invalid payment source.')
    if provider not in dict(PaymentIntent.PROVIDER_CHOICES):
        raise PaymentIntentError('Invalid payment provider.')

    defaults = {
        'source_module': source_module,
        'source_id': str(source_id),
        'amount': amount,
        'currency': currency or 'NPR',
        'provider': provider,
        'description': description,
        'metadata': metadata or {},
        'created_by': created_by,
    }
    intent, created = PaymentIntent.objects.get_or_create(idempotency_key=idempotency_key, defaults=defaults)
    if not created:
        mismatches = [
            intent.source_module != source_module,
            intent.source_id != str(source_id),
            intent.amount != amount,
            intent.currency != (currency or 'NPR'),
            intent.provider != provider,
        ]
        if any(mismatches):
            raise PaymentIntentError('Idempotency key is already used for a different payment intent.')
    return intent


def update_provider_payload(intent, *, provider_reference='', payload=None, status='requires_action'):
    intent.provider_payload = payload or {}
    if provider_reference:
        intent.provider_reference = provider_reference
    if intent.status not in TERMINAL_STATUSES:
        intent.status = status
    intent.save(update_fields=['provider_payload', 'provider_reference', 'status', 'updated_at'])
    return intent


def _provider_payment_method(intent):
    if intent.provider in ['khalti', 'esewa']:
        return 'wallet'
    if intent.provider == 'stripe':
        return 'card'
    return 'cash' if intent.provider == 'manual' else 'wallet'


def get_settled_payment_reference(*, source_module, source_id):
    intent = (
        PaymentIntent.objects.filter(
            source_module=source_module,
            source_id=str(source_id),
            status='succeeded',
        )
        .exclude(provider_reference='')
        .order_by('-settled_at', '-succeeded_at', '-created_at')
        .first()
    )
    if not intent:
        return None
    return {
        'id': str(intent.id),
        'provider': intent.provider,
        'provider_reference': intent.provider_reference,
        'idempotency_key': intent.idempotency_key,
        'status': intent.status,
        'settlement_status': intent.settlement_status,
        'settled_at': intent.settled_at,
    }


def _mark_settlement(intent, status, message=''):
    intent.settlement_status = status
    intent.settlement_message = message
    if status in ['failed', 'skipped'] and intent.follow_up_status == 'none':
        intent.follow_up_status = 'open'
    if status == 'settled' and intent.follow_up_status in ['none', 'open', 'in_review']:
        intent.follow_up_status = 'resolved'
    if status == 'settled':
        intent.settled_at = timezone.now()
    intent.save(update_fields=['settlement_status', 'settlement_message', 'follow_up_status', 'settled_at', 'updated_at'])
    return intent


@transaction.atomic
def reconcile_payment_intent(intent, *, posted_by=None):
    locked = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
    if locked.status != 'succeeded':
        raise PaymentIntentError('Only succeeded payment intents can be reconciled.')
    if locked.settlement_status == 'settled':
        return locked

    payment_method = _provider_payment_method(locked)
    try:
        if locked.source_module == 'guest_folio':
            from accounting.services import post_room_payment
            from bookings.models import GuestFolio
            from bookings.services import ensure_room_charge_line

            folio = GuestFolio.objects.select_for_update().get(id=locked.source_id)
            ensure_room_charge_line(folio)
            if folio.status == 'paid':
                return _mark_settlement(locked, 'settled', 'Guest folio was already settled.')
            if folio.status != 'open':
                raise PaymentIntentError('Only open guest folios can be reconciled.')
            if locked.amount != folio.grand_total:
                raise PaymentIntentError('Payment intent amount must equal the guest folio total.')
            folio.settle(payment_method=payment_method, paid_amount=locked.amount)
            post_room_payment(folio, posted_by=posted_by or locked.created_by)
            return _mark_settlement(locked, 'settled', f'Guest folio {folio.folio_number} settled.')

        if locked.source_module == 'restaurant_order':
            from restaurant.models import RestaurantOrder
            from restaurant.services import RestaurantSettlementError, settle_restaurant_order

            order = RestaurantOrder.objects.select_for_update().get(id=locked.source_id)
            if order.status == 'paid':
                return _mark_settlement(locked, 'settled', 'Restaurant order was already settled.')
            if order.status != 'served':
                raise PaymentIntentError('Only served restaurant orders can be reconciled.')
            if locked.amount != order.grand_total:
                raise PaymentIntentError('Payment intent amount must equal the restaurant order total.')
            try:
                settle_restaurant_order(
                    order,
                    payment_method=payment_method,
                    paid_amount=locked.amount,
                    posted_by=posted_by or locked.created_by,
                )
            except RestaurantSettlementError as exc:
                raise PaymentIntentError(str(exc)) from exc
            return _mark_settlement(locked, 'settled', f'Restaurant order {order.order_number} settled.')

        return _mark_settlement(locked, 'skipped', f'No automatic reconciliation for {locked.source_module}.')
    except PaymentIntentError as exc:
        _mark_settlement(locked, 'failed', str(exc))
        raise


@transaction.atomic
def mark_payment_processing(intent, *, provider_reference='', payload=None):
    locked = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
    if locked.status in TERMINAL_STATUSES:
        return locked
    locked.mark_processing(provider_reference=provider_reference, payload=payload)
    return locked


@transaction.atomic
def mark_payment_succeeded(intent, *, provider_reference='', payload=None):
    locked = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
    if locked.status == 'canceled':
        raise PaymentIntentError('Canceled payment intents cannot be marked succeeded.')
    locked.mark_succeeded(provider_reference=provider_reference, payload=payload)
    return locked


@transaction.atomic
def mark_payment_failed(intent, *, message='', payload=None):
    locked = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
    if locked.status in ['succeeded', 'canceled']:
        return locked
    locked.mark_failed(message, payload=payload)
    return locked


@transaction.atomic
def cancel_payment_intent(intent, *, message='Canceled by user'):
    locked = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
    locked.cancel(message=message)
    return locked


@transaction.atomic
def handle_provider_callback(*, provider, provider_reference='', status, payload=None, idempotency_key=''):
    if provider not in dict(PaymentIntent.PROVIDER_CHOICES):
        raise PaymentIntentError('Invalid payment provider.')

    queryset = PaymentIntent.objects.select_for_update().filter(provider=provider)
    if idempotency_key:
        queryset = queryset.filter(idempotency_key=idempotency_key)
    elif provider_reference:
        queryset = queryset.filter(provider_reference=provider_reference)
    else:
        raise PaymentIntentError('Provider reference or idempotency key is required.')

    intent = queryset.first()
    if not intent:
        raise PaymentIntentError('Payment intent was not found for this callback.')

    if status in ['succeeded', 'success', 'paid', 'completed']:
        intent.mark_succeeded(provider_reference=provider_reference, payload=payload or {})
    elif status in ['processing', 'pending']:
        if intent.status not in TERMINAL_STATUSES:
            intent.mark_processing(provider_reference=provider_reference, payload=payload or {})
    elif status in ['failed', 'failure', 'declined', 'expired']:
        intent.mark_failed((payload or {}).get('message', 'Provider marked payment failed.'), payload=payload or {})
    elif status in ['canceled', 'cancelled']:
        intent.cancel(message=(payload or {}).get('message', 'Provider marked payment canceled.'))
    else:
        raise PaymentIntentError('Unsupported provider callback status.')
    return intent
