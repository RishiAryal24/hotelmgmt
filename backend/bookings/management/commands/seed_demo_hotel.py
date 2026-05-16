from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context

from accounting.services import seed_default_accounts
from bookings.models import Booking, Guest, Room, RoomType
from inventory.models import InventoryItem, Vendor
from hrms.models import Attendance, Employee, Shift
from restaurant.models import MenuCategory, MenuItem, RestaurantTable
from tenants.models import Domain


class Command(BaseCommand):
    help = 'Seed local demo rooms, guest, and an in-house booking for manual testing'

    def add_arguments(self, parser):
        parser.add_argument('--domain', default='local.hotel.test', help='Tenant domain to seed')

    def handle(self, *args, **options):
        domain = Domain.objects.select_related('tenant').get(domain=options['domain'])

        with tenant_context(domain.tenant):
            seed_default_accounts()

            standard, _ = RoomType.objects.update_or_create(
                code='STD',
                defaults={
                    'name': 'Standard Room',
                    'base_occupancy': 1,
                    'max_occupancy': 2,
                    'base_rate': '100.00',
                    'description': 'Local demo standard room',
                    'is_active': True,
                },
            )
            deluxe, _ = RoomType.objects.update_or_create(
                code='DLX',
                defaults={
                    'name': 'Deluxe Room',
                    'base_occupancy': 2,
                    'max_occupancy': 3,
                    'base_rate': '150.00',
                    'description': 'Local demo deluxe room',
                    'is_active': True,
                },
            )

            room_101, _ = Room.objects.update_or_create(
                room_number='101',
                defaults={
                    'room_type': standard,
                    'capacity': 2,
                    'price_per_night': '100.00',
                    'status': 'occupied',
                    'description': 'Demo in-house room',
                },
            )
            Room.objects.update_or_create(
                room_number='102',
                defaults={
                    'room_type': standard,
                    'capacity': 2,
                    'price_per_night': '100.00',
                    'status': 'available',
                    'description': 'Demo available room',
                },
            )
            Room.objects.update_or_create(
                room_number='201',
                defaults={
                    'room_type': deluxe,
                    'capacity': 3,
                    'price_per_night': '150.00',
                    'status': 'available',
                    'description': 'Demo deluxe room',
                },
            )

            guest, _ = Guest.objects.update_or_create(
                email='demo.guest@local.test',
                defaults={
                    'first_name': 'Demo',
                    'last_name': 'Guest',
                    'phone': '9800000000',
                    'address': 'Local test address',
                    'id_type': 'Passport',
                    'id_number': 'LOCAL-DEMO',
                },
            )

            active_booking = Booking.objects.filter(room=room_101, status='checked_in').first()
            if active_booking is None:
                Booking.objects.create(
                    room=room_101,
                    guest=guest,
                    check_in_date=date.today(),
                    check_out_date=date.today() + timedelta(days=1),
                    number_of_guests=1,
                    status='checked_in',
                    special_requests='Local demo checkout flow',
                )

            category, _ = MenuCategory.objects.update_or_create(
                code='demo-food',
                defaults={
                    'name': 'Demo Food',
                    'description': 'Local demo restaurant items',
                    'display_order': 1,
                    'is_active': True,
                },
            )
            MenuItem.objects.update_or_create(
                sku='DEMO-BREAKFAST',
                defaults={
                    'category': category,
                    'name': 'Demo Breakfast',
                    'description': 'Breakfast item for local POS testing',
                    'price': '18.00',
                    'preparation_station': 'kitchen',
                    'preparation_time_minutes': 10,
                    'is_available': True,
                    'is_active': True,
                },
            )
            MenuItem.objects.update_or_create(
                sku='DEMO-COFFEE',
                defaults={
                    'category': category,
                    'name': 'Demo Coffee',
                    'description': 'Coffee item for local POS testing',
                    'price': '5.00',
                    'preparation_station': 'bar',
                    'preparation_time_minutes': 5,
                    'is_available': True,
                    'is_active': True,
                },
            )
            RestaurantTable.objects.update_or_create(
                table_number='A1',
                defaults={
                    'section': 'Main',
                    'capacity': 2,
                    'status': 'available',
                    'is_active': True,
                },
            )
            vendor, _ = Vendor.objects.update_or_create(
                name='Demo Produce Vendor',
                defaults={
                    'email': 'produce@local.test',
                    'phone': '9800001111',
                    'address': 'Local market',
                    'tax_number': 'DEMO-PAN',
                    'is_active': True,
                },
            )
            InventoryItem.objects.update_or_create(
                sku='DEMO-COFFEE-BEANS',
                defaults={
                    'name': 'Demo Coffee Beans',
                    'category': 'Beverage',
                    'unit': 'kg',
                    'cost_price': '12.00',
                    'reorder_level': '5.00',
                    'is_active': True,
                },
            )
            InventoryItem.objects.update_or_create(
                sku='DEMO-EGGS',
                defaults={
                    'name': 'Demo Eggs',
                    'category': 'Kitchen',
                    'unit': 'pcs',
                    'cost_price': '0.30',
                    'reorder_level': '30.00',
                    'is_active': True,
                },
            )
            morning_shift, _ = Shift.objects.update_or_create(
                name='Morning Shift',
                defaults={
                    'start_time': '08:00',
                    'end_time': '16:00',
                    'break_minutes': 30,
                    'grace_minutes': 10,
                    'is_active': True,
                    'notes': 'Default front office and housekeeping morning shift',
                },
            )
            maya, _ = Employee.objects.update_or_create(
                employee_id='EMP-001',
                defaults={
                    'first_name': 'Maya',
                    'last_name': 'Shrestha',
                    'email': 'maya.hr@local.test',
                    'phone': '9800002222',
                    'department': 'Front Office',
                    'designation': 'Receptionist',
                    'employment_type': 'full_time',
                    'status': 'active',
                    'hire_date': '2026-05-01',
                    'salary': '45000.00',
                    'emergency_contact_name': 'Ramesh Shrestha',
                    'emergency_contact_phone': '9800003333',
                },
            )
            suman, _ = Employee.objects.update_or_create(
                employee_id='EMP-002',
                defaults={
                    'first_name': 'Suman',
                    'last_name': 'Rai',
                    'email': 'suman.hk@local.test',
                    'phone': '9800004444',
                    'department': 'Housekeeping',
                    'designation': 'Room Attendant',
                    'employment_type': 'full_time',
                    'status': 'active',
                    'hire_date': '2026-05-03',
                    'salary': '32000.00',
                },
            )
            for employee in [maya, suman]:
                Attendance.objects.update_or_create(
                    employee=employee,
                    attendance_date=date.today(),
                    defaults={
                        'shift': morning_shift,
                        'status': 'scheduled',
                    },
                )
            self.stdout.write(f'Demo vendor ready: {vendor.name}')

        self.stdout.write(self.style.SUCCESS(f'Demo hotel data is ready for {options["domain"]}.'))
