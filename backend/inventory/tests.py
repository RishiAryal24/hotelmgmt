from decimal import Decimal

from django_tenants.test.cases import TenantTestCase

from accounting.models import JournalEntry, JournalLine
from inventory.models import InventoryItem, PurchaseOrder, PurchaseOrderLine, StockMovement, Vendor
from inventory.services import pay_purchase_order, receive_inventory_stock, receive_purchase_order, submit_purchase_order
from notifications.models import NotificationEvent


class InventoryReceivingTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_inventory'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-inventory.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Inventory'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        suffix = str(abs(hash(self._testMethodName)) % 100000)
        self.vendor = Vendor.objects.create(name=f'Vendor {suffix}')
        self.item = InventoryItem.objects.create(
            sku=f'INV-{suffix}',
            name=f'Ingredient {suffix}',
            category='Kitchen',
            unit='kg',
            cost_price=Decimal('5.00'),
            reorder_level=Decimal('10.00'),
        )

    def test_receive_inventory_stock_updates_stock_cost_and_accounting(self):
        movement = receive_inventory_stock(
            item=self.item,
            vendor=self.vendor,
            quantity=Decimal('12.500'),
            unit_cost=Decimal('7.25'),
            reference='INV-LOCAL-1',
            notes='Local test purchase',
            payment_account='2000',
        )

        self.item.refresh_from_db()
        self.assertEqual(movement.movement_type, 'purchase')
        self.assertEqual(movement.source_module, 'inventory_purchase')
        self.assertEqual(movement.source_id, str(movement.id))
        self.assertEqual(self.item.current_stock, Decimal('12.500'))
        self.assertEqual(self.item.cost_price, Decimal('7.25'))
        self.assertFalse(self.item.is_low_stock)

        journal = JournalEntry.objects.get(source_module='inventory_purchase', source_id=str(movement.id))
        debit = JournalLine.objects.get(journal_entry=journal, account__code='1200')
        credit = JournalLine.objects.get(journal_entry=journal, account__code='2000')
        self.assertEqual(debit.account.code, '1200')
        self.assertEqual(credit.account.code, '2000')
        self.assertEqual(debit.debit, credit.credit)

    def test_low_stock_flag_uses_current_stock_and_reorder_level(self):
        self.assertTrue(self.item.is_low_stock)

        receive_inventory_stock(
            item=self.item,
            quantity=Decimal('10.000'),
            unit_cost=Decimal('6.00'),
            payment_account='1000',
        )

        self.item.refresh_from_db()
        self.assertTrue(self.item.is_low_stock)
        self.assertTrue(NotificationEvent.objects.filter(event_type='inventory.low_stock', module='inventory').exists())

        receive_inventory_stock(
            item=self.item,
            quantity=Decimal('0.001'),
            unit_cost=Decimal('6.00'),
            payment_account='1000',
        )

        self.item.refresh_from_db()
        self.assertFalse(self.item.is_low_stock)

    def test_purchase_order_receive_and_pay_posts_inventory_and_vendor_payment(self):
        purchase_order = PurchaseOrder.objects.create(vendor=self.vendor, reference='PO-LOCAL-1')
        PurchaseOrderLine.objects.create(
            purchase_order=purchase_order,
            item=self.item,
            quantity=Decimal('4.000'),
            unit_cost=Decimal('8.00'),
        )

        submit_purchase_order(purchase_order)
        purchase_order.refresh_from_db()
        self.assertEqual(purchase_order.status, 'ordered')

        receive_purchase_order(purchase_order)
        purchase_order.refresh_from_db()
        self.item.refresh_from_db()

        self.assertEqual(purchase_order.status, 'received')
        self.assertEqual(self.item.current_stock, Decimal('4.000'))
        self.assertTrue(StockMovement.objects.filter(source_module='purchase_order', source_id=str(purchase_order.id)).exists())
        self.assertTrue(JournalEntry.objects.filter(source_module='inventory_purchase').exists())

        pay_purchase_order(purchase_order, payment_method='bank')
        purchase_order.refresh_from_db()

        self.assertEqual(purchase_order.payment_status, 'paid')
        self.assertEqual(purchase_order.payment_method, 'bank')
        payment_journal = JournalEntry.objects.get(source_module='purchase_order_payment', source_id=str(purchase_order.id))
        debit = JournalLine.objects.get(journal_entry=payment_journal, account__code='2000')
        credit = JournalLine.objects.get(journal_entry=payment_journal, account__code='1010')
        self.assertEqual(debit.debit, Decimal('32.00'))
        self.assertEqual(credit.credit, Decimal('32.00'))
