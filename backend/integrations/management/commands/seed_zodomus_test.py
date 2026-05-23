from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context

from bookings.models import RatePlan, Room, RoomType
from integrations.models import OTAChannel, OTAChannelRatePlanMapping, OTAChannelRoomTypeMapping
from integrations.services import create_or_update_reservation_import, run_availability_sync, run_rate_sync
from tenants.models import Domain


class Command(BaseCommand):
    help = 'Seed a local Zodomus test-mode channel, mappings, sync jobs, and pending reservation import'

    def add_arguments(self, parser):
        parser.add_argument('--domain', default='local.hotel.test', help='Tenant domain to seed')

    def handle(self, *args, **options):
        domain = Domain.objects.select_related('tenant').get(domain=options['domain'])

        with tenant_context(domain.tenant):
            room_type, _ = RoomType.objects.update_or_create(
                code='ZOD-TEST',
                defaults={
                    'name': 'Zodomus Test Room',
                    'base_occupancy': 1,
                    'max_occupancy': 2,
                    'base_rate': '100.00',
                    'description': 'Local OTA verification room type',
                    'is_active': True,
                },
            )
            Room.objects.update_or_create(
                room_number='Z101',
                defaults={
                    'room_type': room_type,
                    'capacity': 2,
                    'price_per_night': '100.00',
                    'status': 'available',
                    'description': 'Local OTA verification room',
                },
            )
            rate_plan, _ = RatePlan.objects.update_or_create(
                name='Zodomus Test BAR',
                room_type=room_type,
                defaults={
                    'base_rate': '100.00',
                    'is_active': True,
                    'valid_from': date.today(),
                    'valid_to': date.today() + timedelta(days=365),
                    'conditions': {'source': 'zodomus_test_seed'},
                },
            )
            channel, _ = OTAChannel.objects.update_or_create(
                code='zodomus-local-test',
                defaults={
                    'name': 'Zodomus Local Test',
                    'provider': 'zodomus',
                    'api_key': 'local-test-user',
                    'api_secret': 'local-test-password',
                    'base_url': 'https://api.zodomus.com',
                    'is_active': True,
                    'sync_direction': 'both',
                    'settings': {
                        'property_id': 'LOCAL-ZODOMUS',
                        'channel_code': 'zodomus-local-test',
                        'test_mode': True,
                    },
                },
            )
            OTAChannelRoomTypeMapping.objects.update_or_create(
                channel=channel,
                room_type=room_type,
                defaults={
                    'external_room_type_id': 'ZOD-ROOM-1',
                    'external_room_type_name': 'Zodomus Test Room',
                    'is_active': True,
                },
            )
            OTAChannelRatePlanMapping.objects.update_or_create(
                channel=channel,
                rate_plan=rate_plan,
                defaults={
                    'external_rate_plan_id': 'ZOD-RATE-1',
                    'external_rate_plan_name': 'Zodomus Test BAR',
                    'is_active': True,
                },
            )
            date_from = date.today() + timedelta(days=1)
            date_to = date_from + timedelta(days=2)
            availability_job = run_availability_sync(channel, date_from=date_from, date_to=date_to)
            rate_job = run_rate_sync(channel, date_from=date_from, date_to=date_to)
            reservation_import = create_or_update_reservation_import(
                channel,
                {
                    'reservation_id': f'LOCAL-ZOD-RES-{date.today().isoformat()}',
                    'external_room_type_id': 'ZOD-ROOM-1',
                    'external_rate_plan_id': 'ZOD-RATE-1',
                    'check_in_date': date_from.isoformat(),
                    'check_out_date': date_to.isoformat(),
                    'guest_first_name': 'Local',
                    'guest_last_name': 'Zodomus',
                    'guest_email': 'local.zodomus@example.com',
                    'number_of_guests': 1,
                    'total_amount': '200.00',
                    'currency': 'NPR',
                },
            )

            self.stdout.write(self.style.SUCCESS('Seeded Zodomus local test setup.'))
            self.stdout.write(f'Channel: {channel.name} ({channel.code})')
            self.stdout.write('Room mapping: ZOD-ROOM-1')
            self.stdout.write('Rate mapping: ZOD-RATE-1')
            self.stdout.write(f'Availability sync job: {availability_job.id}')
            self.stdout.write(f'Rate sync job: {rate_job.id}')
            self.stdout.write(f'Reservation import: {reservation_import.external_reservation_id} [{reservation_import.status}]')
