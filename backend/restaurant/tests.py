from datetime import date
from decimal import Decimal

from django_tenants.test.cases import TenantTestCase

from accounting.models import JournalEntry, JournalLine
from bookings.models import Booking, Guest, GuestFolioLine, Room, RoomType
from inventory.models import InventoryItem, StockMovement
from restaurant.models import CashierCounter, CashierShift, MenuCategory, MenuItem, MenuModifier, MenuModifierGroup, MenuRecipeIngredient, RestaurantOrder, RestaurantOrderApproval, RestaurantOrderLine, RestaurantTable
from restaurant.serializers import RestaurantOrderLineSerializer
from restaurant.services import (
    CashierShiftError,
    RestaurantOrderActionError,
    RestaurantSettlementError,
    apply_order_discount,
    approve_order_approval,
    close_cashier_shift,
    merge_order_table,
    open_cashier_shift,
    reject_order_approval,
    request_order_approval,
    settle_restaurant_order,
    split_order_bill,
    transfer_order_table,
    void_order_line,
)
from users.models import PlatformUser


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
        self.cashier = PlatformUser.objects.create_user(email=f'cashier-{suffix}@example.com', password='testpass123')
        self.counter = CashierCounter.objects.create(
            name=f'Restaurant Counter {suffix}',
            code=f'REST-{suffix}',
            outlet_type='restaurant',
        )

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

    def test_dine_in_order_can_transfer_to_available_table(self):
        target_table = RestaurantTable.objects.create(table_number=f'TR-{abs(hash(self._testMethodName)) % 1000}')
        self.table.status = 'occupied'
        self.table.save(update_fields=['status', 'updated_at'])

        transfer_order_table(self.order, target_table)

        self.order.refresh_from_db()
        self.table.refresh_from_db()
        target_table.refresh_from_db()
        self.assertEqual(self.order.table_id, target_table.id)
        self.assertEqual(target_table.status, 'occupied')
        self.assertEqual(self.table.status, 'available')

    def test_table_transfer_requires_available_target(self):
        target_table = RestaurantTable.objects.create(
            table_number=f'BUSY-{abs(hash(self._testMethodName)) % 1000}',
            status='occupied',
        )

        with self.assertRaises(RestaurantOrderActionError):
            transfer_order_table(self.order, target_table)

    def test_dine_in_orders_can_merge_into_one_bill(self):
        target_table = RestaurantTable.objects.create(table_number=f'MG-{abs(hash(self._testMethodName)) % 1000}', status='occupied')
        target_order = RestaurantOrder.objects.create(table=target_table, order_type='dine_in', status='served')
        RestaurantOrderLine.objects.create(order=target_order, menu_item=self.item, quantity=1, unit_price=Decimal('25.00'))
        self.table.status = 'occupied'
        self.table.save(update_fields=['status', 'updated_at'])

        merged_order = merge_order_table(self.order, target_order)

        self.order.refresh_from_db()
        target_order.refresh_from_db()
        self.table.refresh_from_db()
        self.assertEqual(merged_order.id, target_order.id)
        self.assertEqual(self.order.status, 'cancelled')
        self.assertEqual(self.table.status, 'available')
        self.assertEqual(target_order.lines.exclude(status='cancelled').count(), 2)
        self.assertEqual(target_order.grand_total, Decimal('75.00'))
        self.assertIn(self.order.order_number, target_order.notes)

    def test_served_order_can_split_selected_quantities_to_new_bill(self):
        second_item = MenuItem.objects.create(
            category=self.category,
            name=f'Dessert {abs(hash(self._testMethodName)) % 1000}',
            sku=f'DESSERT-{abs(hash(self._testMethodName)) % 1000}',
            price='10.00',
        )
        second_line = RestaurantOrderLine.objects.create(
            order=self.order,
            menu_item=second_item,
            quantity=3,
            unit_price=Decimal('10.00'),
        )
        self.order.refresh_from_db()

        split_order = split_order_bill(
            self.order,
            [
                {'line': str(second_line.id), 'quantity': 1},
            ],
        )

        self.order.refresh_from_db()
        second_line.refresh_from_db()
        split_line = split_order.lines.get()

        self.assertEqual(split_order.status, 'served')
        self.assertEqual(split_order.table_id, self.order.table_id)
        self.assertEqual(split_order.grand_total, Decimal('10.00'))
        self.assertEqual(second_line.quantity, 2)
        self.assertEqual(self.order.grand_total, Decimal('70.00'))
        self.assertEqual(split_line.menu_item_id, second_item.id)
        self.assertEqual(split_line.quantity, 1)

    def test_split_bill_must_leave_item_on_original_order(self):
        only_line = self.order.lines.get()

        with self.assertRaises(RestaurantOrderActionError):
            split_order_bill(
                self.order,
                [
                    {'line': str(only_line.id), 'quantity': only_line.quantity},
                ],
            )

    def test_order_line_can_be_voided_and_removed_from_total(self):
        line = self.order.lines.get()

        void_order_line(self.order, line, reason='Guest changed mind')

        self.order.refresh_from_db()
        line.refresh_from_db()
        self.assertEqual(line.status, 'cancelled')
        self.assertIn('Guest changed mind', line.notes)
        self.assertEqual(self.order.subtotal, Decimal('0.00'))
        self.assertEqual(self.order.grand_total, Decimal('0.00'))

    def test_void_line_requires_order_ownership(self):
        other_order = RestaurantOrder.objects.create(table=self.table, order_type='dine_in', status='served')
        line = self.order.lines.get()

        with self.assertRaises(RestaurantOrderActionError):
            void_order_line(other_order, line)

    def test_order_discount_reduces_grand_total(self):
        apply_order_discount(self.order, discount_amount=Decimal('5.00'), reason='Service recovery')

        self.order.refresh_from_db()
        self.assertEqual(self.order.discount_total, Decimal('5.00'))
        self.assertEqual(self.order.grand_total, Decimal('45.00'))
        self.assertIn('Service recovery', self.order.notes)

    def test_order_discount_cannot_exceed_order_total(self):
        with self.assertRaises(RestaurantOrderActionError):
            apply_order_discount(self.order, discount_amount=Decimal('55.00'))

    def test_order_line_modifiers_increase_line_and_order_total(self):
        group = MenuModifierGroup.objects.create(
            name=f'Add-ons {self._testMethodName}',
            code=f'ADD-{abs(hash(self._testMethodName)) % 100000}',
            selection_type='multiple',
        )
        group.menu_items.add(self.item)
        modifier = MenuModifier.objects.create(
            group=group,
            name='Extra Sauce',
            code='EXTRA-SAUCE',
            price_delta=Decimal('3.00'),
        )

        line = RestaurantOrderLine.objects.create(order=self.order, menu_item=self.item, quantity=2, unit_price=Decimal('25.00'))
        line.modifiers.set([modifier])
        line.save(update_fields=['line_total', 'updated_at'])

        self.order.refresh_from_db()
        self.assertEqual(line.line_total, Decimal('56.00'))
        self.assertEqual(self.order.grand_total, Decimal('106.00'))

    def test_required_single_modifier_is_validated_on_order_line_serializer(self):
        group = MenuModifierGroup.objects.create(
            name=f'Temperature {self._testMethodName}',
            code=f'TEMP-{abs(hash(self._testMethodName)) % 100000}',
            selection_type='single',
            is_required=True,
        )
        group.menu_items.add(self.item)

        serializer = RestaurantOrderLineSerializer(data={
            'order': str(self.order.id),
            'menu_item': str(self.item.id),
            'quantity': 1,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('Select a modifier', str(serializer.errors))

    def test_menu_recipe_cost_and_margin_use_ingredient_costs(self):
        suffix = abs(hash(self._testMethodName)) % 100000
        rice = InventoryItem.objects.create(sku=f'RICE-{suffix}', name='Rice', unit='kg', cost_price=Decimal('4.00'))
        spice = InventoryItem.objects.create(sku=f'SPICE-{suffix}', name='Spice', unit='g', cost_price=Decimal('0.05'))
        MenuRecipeIngredient.objects.create(menu_item=self.item, item=rice, quantity=Decimal('0.200'))
        MenuRecipeIngredient.objects.create(menu_item=self.item, item=spice, quantity=Decimal('10.000'))

        self.assertEqual(self.item.recipe_cost, Decimal('1.30000'))
        self.assertEqual(self.item.gross_margin, Decimal('23.70000'))

    def test_restaurant_settlement_deducts_recipe_ingredients(self):
        suffix = abs(hash(self._testMethodName)) % 100000
        rice = InventoryItem.objects.create(sku=f'RICES-{suffix}', name='Rice Sale', unit='kg', cost_price=Decimal('4.00'))
        spice = InventoryItem.objects.create(sku=f'SPICES-{suffix}', name='Spice Sale', unit='g', cost_price=Decimal('0.05'))
        MenuRecipeIngredient.objects.create(menu_item=self.item, item=rice, quantity=Decimal('0.200'))
        MenuRecipeIngredient.objects.create(menu_item=self.item, item=spice, quantity=Decimal('10.000'))

        settle_restaurant_order(self.order, payment_method='cash', paid_amount=Decimal('50.00'))

        rice_movement = StockMovement.objects.get(item=rice, source_module='restaurant_recipe_ingredient')
        spice_movement = StockMovement.objects.get(item=spice, source_module='restaurant_recipe_ingredient')
        self.assertEqual(rice_movement.quantity, Decimal('0.400'))
        self.assertEqual(spice_movement.quantity, Decimal('20.000'))

    def test_void_line_approval_applies_only_after_approval(self):
        line = self.order.lines.get()

        approval = request_order_approval(
            self.order,
            action_type='void_line',
            line=line,
            reason='Wrong item',
            requested_by=self.cashier,
        )

        self.order.refresh_from_db()
        line.refresh_from_db()
        self.assertEqual(approval.status, 'pending')
        self.assertEqual(line.status, 'ordered')
        self.assertEqual(self.order.grand_total, Decimal('50.00'))

        approve_order_approval(approval, decided_by=self.cashier, decision_notes='Approved by supervisor')

        self.order.refresh_from_db()
        line.refresh_from_db()
        approval.refresh_from_db()
        self.assertEqual(approval.status, 'approved')
        self.assertEqual(approval.decided_by_id, self.cashier.id)
        self.assertEqual(line.status, 'cancelled')
        self.assertEqual(self.order.grand_total, Decimal('0.00'))

    def test_discount_approval_can_be_rejected_without_changing_order(self):
        approval = request_order_approval(
            self.order,
            action_type='discount',
            discount_amount=Decimal('10.00'),
            reason='Service delay',
            requested_by=self.cashier,
        )

        reject_order_approval(approval, decided_by=self.cashier, decision_notes='Not eligible')

        self.order.refresh_from_db()
        approval.refresh_from_db()
        self.assertEqual(approval.status, 'rejected')
        self.assertEqual(self.order.discount_total, Decimal('0.00'))
        self.assertEqual(self.order.grand_total, Decimal('50.00'))

    def test_complimentary_approval_discounts_full_bill(self):
        approval = request_order_approval(
            self.order,
            action_type='complimentary',
            reason='Manager comp',
            requested_by=self.cashier,
        )

        approve_order_approval(approval, decided_by=self.cashier)

        self.order.refresh_from_db()
        approval.refresh_from_db()
        self.assertEqual(approval.status, 'approved')
        self.assertEqual(self.order.discount_total, Decimal('50.00'))
        self.assertEqual(self.order.grand_total, Decimal('0.00'))

    def test_cashier_shift_closing_totals_restaurant_payments(self):
        shift = open_cashier_shift(cashier=self.cashier, counter=self.counter, opening_cash=Decimal('100.00'))
        settle_restaurant_order(self.order, payment_method='cash', paid_amount=Decimal('50.00'), cashier_shift=shift)

        card_order = RestaurantOrder.objects.create(table=self.table, order_type='dine_in', status='served')
        RestaurantOrderLine.objects.create(order=card_order, menu_item=self.item, quantity=1, unit_price=Decimal('25.00'))
        card_order.refresh_from_db()
        settle_restaurant_order(card_order, payment_method='card', paid_amount=Decimal('25.00'), cashier_shift=shift)

        close_cashier_shift(shift, actual_cash=Decimal('150.00'), notes='Balanced')

        shift.refresh_from_db()
        self.assertEqual(shift.status, 'closed')
        self.assertEqual(shift.expected_cash, Decimal('150.00'))
        self.assertEqual(shift.expected_card, Decimal('25.00'))
        self.assertEqual(shift.expected_total, Decimal('175.00'))
        self.assertEqual(shift.cash_variance, Decimal('0.00'))
        self.assertIn('Balanced', shift.notes)

    def test_cashier_shift_prevents_duplicate_open_shift(self):
        open_cashier_shift(cashier=self.cashier, counter=self.counter, opening_cash=Decimal('25.00'))

        with self.assertRaises(CashierShiftError):
            open_cashier_shift(cashier=self.cashier, counter=self.counter, opening_cash=Decimal('10.00'))

        self.assertEqual(CashierShift.objects.filter(cashier=self.cashier, status='open').count(), 1)

    def test_cashier_shift_prevents_duplicate_open_counter(self):
        other_cashier = PlatformUser.objects.create_user(email=f'other-{self.cashier.email}', password='testpass123')
        open_cashier_shift(cashier=self.cashier, counter=self.counter, opening_cash=Decimal('25.00'))

        with self.assertRaises(CashierShiftError):
            open_cashier_shift(cashier=other_cashier, counter=self.counter, opening_cash=Decimal('10.00'))

        self.assertEqual(CashierShift.objects.filter(counter=self.counter, status='open').count(), 1)
