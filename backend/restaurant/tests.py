from datetime import date
from decimal import Decimal

from django_tenants.test.cases import TenantTestCase

from accounting.models import JournalEntry, JournalLine
from bookings.models import Booking, Guest, GuestFolioLine, Room, RoomType
from restaurant.models import MenuCategory, MenuItem, RestaurantOrder, RestaurantOrderLine, RestaurantTable
from restaurant.services import RestaurantSettlementError, settle_restaurant_order


class RestaurantRoomPostingTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_restaurant'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-restaurant.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Restaurant'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        suffix = str(abs(hash(self._testMethodName)) % 100000)
        self.room_type = RoomType.objects.create(
            name=f'Standard {suffix}',
            code=f'STD-{suffix}',
            base_rate='100.00',
        )
        self.room = Room.objects.create(
            room_number=f'2{int(suffix) % 1000:03d}',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
            status='occupied',
        )
        self.guest = Guest.objects.create(
            first_name='Restaurant',
            last_name='Guest',
            email=f'{self._testMethodName}@example.com',
        )
        self.booking = Booking.objects.create(
            room=self.room,
            guest=self.guest,
            check_in_date=date(2026, 5, 12),
            check_out_date=date(2026, 5, 13),
            number_of_guests=1,
            status='checked_in',
        )
        self.table = RestaurantTable.objects.create(table_number=f'T{abs(hash(self._testMethodName)) % 1000}')
        self.category = MenuCategory.objects.create(
            name=f'Food {suffix}',
            code=f'food-{suffix}',
        )
        self.item = MenuItem.objects.create(
            category=self.category,
            name=f'Demo Meal {suffix}',
            sku=f'MEAL-{suffix}',
            price='25.00',
        )
        self.order = RestaurantOrder.objects.create(table=self.table, order_type='dine_in', status='served')
        RestaurantOrderLine.objects.create(order=self.order, menu_item=self.item, quantity=2, unit_price=Decimal('25.00'))
        self.order.refresh_from_db()

    def test_room_posting_creates_folio_line_and_ar_journal(self):
        settled_order = settle_restaurant_order(
            self.order,
            payment_method='room_posting',
            booking_id=self.booking.id,
        )

        settled_order.refresh_from_db()
        self.table.refresh_from_db()
        folio_line = GuestFolioLine.objects.get(source_module='restaurant_order', source_id=str(self.order.id))

        self.assertEqual(settled_order.status, 'paid')
        self.assertEqual(settled_order.payment_method, 'room_posting')
        self.assertEqual(settled_order.room_booking_id, self.booking.id)
        self.assertEqual(self.table.status, 'cleaning')
        self.assertEqual(folio_line.folio.booking_id, self.booking.id)
        self.assertEqual(folio_line.amount, settled_order.grand_total)
        self.assertEqual(folio_line.folio.grand_total, Decimal(str(self.booking.total_amount)) + settled_order.grand_total)

        journal = JournalEntry.objects.get(source_module='restaurant_order', source_id=str(self.order.id))
        debit = JournalLine.objects.get(journal_entry=journal, debit=settled_order.grand_total)
        credit = JournalLine.objects.get(journal_entry=journal, credit=settled_order.grand_total)
        self.assertEqual(debit.account.code, '1100')
        self.assertEqual(credit.account.code, '4100')

    def test_room_posting_requires_checked_in_booking(self):
        self.booking.status = 'checked_out'
        self.booking.save(update_fields=['status', 'updated_at'])

        with self.assertRaises(RestaurantSettlementError):
            settle_restaurant_order(
                self.order,
                payment_method='room_posting',
                booking_id=self.booking.id,
            )

    def test_room_posting_requires_booking_selection(self):
        with self.assertRaises(RestaurantSettlementError):
            settle_restaurant_order(
                self.order,
                payment_method='room_posting',
            )
