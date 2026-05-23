from decimal import Decimal
from datetime import date
from unittest.mock import patch

from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from payments.providers import _esewa_signature, confirm_stripe_test_payment, initiate_esewa_payment, initiate_khalti_payment, initiate_stripe_payment, lookup_khalti_payment, verify_esewa_callback
from payments.models import PaymentIntent
from accounting.models import JournalEntry
from bookings.models import Booking, Guest, GuestFolio, Room, RoomType
from payments.services import PaymentIntentError, cancel_payment_intent, create_payment_intent, handle_provider_callback, mark_payment_succeeded, reconcile_payment_intent
from payments.views import PaymentIntentViewSet
from bookings.pdf import guest_folio_pdf
from bookings.serializers import GuestFolioSerializer
from restaurant.services import calculate_cashier_shift_totals
from restaurant.serializers import RestaurantOrderSerializer
from restaurant.models import MenuCategory, MenuItem, RestaurantOrder, RestaurantOrderLine, RestaurantOrderPayment, RestaurantTable
from users.models import PlatformUser


class PaymentIntentFoundationTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_payments'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-payments.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Payments'
        tenant.created_by = 'test'

    def test_create_payment_intent_is_idempotent(self):
        first = create_payment_intent(
            source_module='guest_folio',
            source_id='folio-1',
            amount='1200.00',
            provider='khalti',
            idempotency_key='folio-1-deposit',
        )
        second = create_payment_intent(
            source_module='guest_folio',
            source_id='folio-1',
            amount='1200.00',
            provider='khalti',
            idempotency_key='folio-1-deposit',
        )

        self.assertEqual(first.id, second.id)
        self.assertEqual(PaymentIntent.objects.count(), 1)

    def test_idempotency_key_rejects_different_payment(self):
        create_payment_intent(
            source_module='guest_folio',
            source_id='folio-1',
            amount='1200.00',
            provider='khalti',
            idempotency_key='same-key',
        )

        with self.assertRaises(PaymentIntentError):
            create_payment_intent(
                source_module='guest_folio',
                source_id='folio-2',
                amount='1500.00',
                provider='khalti',
                idempotency_key='same-key',
            )

    def test_success_transition_is_idempotent(self):
        intent = create_payment_intent(
            source_module='restaurant_order',
            source_id='order-1',
            amount=Decimal('500.00'),
            provider='esewa',
            idempotency_key='order-1-pay',
        )

        succeeded = mark_payment_succeeded(intent, provider_reference='ESEWA-100', payload={'status': 'COMPLETE'})
        repeated = mark_payment_succeeded(intent, provider_reference='ESEWA-100', payload={'status': 'COMPLETE'})

        self.assertEqual(succeeded.id, repeated.id)
        self.assertEqual(repeated.status, 'succeeded')
        self.assertEqual(repeated.provider_reference, 'ESEWA-100')
        self.assertIsNotNone(repeated.succeeded_at)

    def test_provider_callback_updates_matching_intent_once(self):
        intent = create_payment_intent(
            source_module='restaurant_order',
            source_id='order-2',
            amount='750.00',
            provider='khalti',
            idempotency_key='order-2-pay',
        )
        intent.mark_processing(provider_reference='KHALTI-200')

        updated = handle_provider_callback(
            provider='khalti',
            provider_reference='KHALTI-200',
            status='succeeded',
            payload={'idx': 'KHALTI-200'},
        )
        repeated = handle_provider_callback(
            provider='khalti',
            provider_reference='KHALTI-200',
            status='succeeded',
            payload={'idx': 'KHALTI-200'},
        )

        self.assertEqual(updated.id, intent.id)
        self.assertEqual(repeated.status, 'succeeded')
        self.assertEqual(repeated.callback_payload['idx'], 'KHALTI-200')

    def test_canceled_intent_cannot_succeed(self):
        intent = create_payment_intent(
            source_module='manual',
            source_id='adjustment-1',
            amount='100.00',
            provider='manual',
            idempotency_key='manual-cancel',
        )

        canceled = cancel_payment_intent(intent)
        self.assertEqual(canceled.status, 'canceled')

        with self.assertRaises(PaymentIntentError):
            mark_payment_succeeded(intent)

    def test_khalti_initiation_records_hosted_payment_payload(self):
        tenant = connection.tenant
        tenant.payment_settings = {
            'khalti': {
                'enabled': True,
                'secret_key': 'test-secret',
                'base_url': 'https://dev.khalti.com/api/v2',
                'website_url': 'http://localhost:5173',
                'return_url': 'http://localhost:5173/payments',
            }
        }
        tenant.save(update_fields=['payment_settings'])
        intent = create_payment_intent(
            source_module='guest_folio',
            source_id='folio-khalti',
            amount='100.00',
            provider='khalti',
            idempotency_key='folio-khalti-pay',
        )

        with patch('payments.providers._post_json', return_value={'pidx': 'KHALTI-PIDX', 'payment_url': 'https://pay.test/khalti'}):
            initiated = initiate_khalti_payment(intent)

        self.assertEqual(initiated.status, 'requires_action')
        self.assertEqual(initiated.provider_reference, 'KHALTI-PIDX')
        self.assertEqual(initiated.provider_payload['payment_url'], 'https://pay.test/khalti')

    def test_khalti_lookup_marks_completed_payment_succeeded(self):
        tenant = connection.tenant
        tenant.payment_settings = {'khalti': {'enabled': True, 'secret_key': 'test-secret'}}
        tenant.save(update_fields=['payment_settings'])
        intent = create_payment_intent(
            source_module='manual',
            source_id='folio-khalti-lookup',
            amount='100.00',
            provider='khalti',
            idempotency_key='folio-khalti-lookup',
        )
        intent.provider_reference = 'KHALTI-PIDX'
        intent.save(update_fields=['provider_reference'])

        with patch('payments.providers._post_json', return_value={'pidx': 'KHALTI-PIDX', 'status': 'Completed'}):
            updated = lookup_khalti_payment(intent)

        self.assertEqual(updated.status, 'succeeded')
        self.assertEqual(updated.settlement_status, 'skipped')

    def test_esewa_initiation_returns_signed_form_payload(self):
        tenant = connection.tenant
        tenant.payment_settings = {'esewa': {'enabled': True, 'secret_key': 'sandbox-secret', 'product_code': 'EPAYTEST'}}
        tenant.save(update_fields=['payment_settings'])
        intent = create_payment_intent(
            source_module='restaurant_order',
            source_id='order-esewa',
            amount='250.00',
            provider='esewa',
            idempotency_key='order-esewa-pay',
        )

        initiated = initiate_esewa_payment(intent)
        fields = initiated.provider_payload['form_fields']

        self.assertEqual(initiated.status, 'requires_action')
        self.assertEqual(fields['transaction_uuid'], 'order-esewa-pay')
        self.assertTrue(fields['signature'])

    def test_esewa_callback_signature_marks_complete_payment_succeeded(self):
        tenant = connection.tenant
        tenant.payment_settings = {'esewa': {'enabled': True, 'secret_key': 'sandbox-secret', 'product_code': 'EPAYTEST'}}
        tenant.save(update_fields=['payment_settings'])
        intent = create_payment_intent(
            source_module='manual',
            source_id='order-esewa-callback',
            amount='250.00',
            provider='esewa',
            idempotency_key='order-esewa-callback',
        )
        payload = {
            'transaction_code': 'ESEWA-100',
            'status': 'COMPLETE',
            'total_amount': '250.00',
            'transaction_uuid': 'order-esewa-callback',
            'product_code': 'EPAYTEST',
            'signed_field_names': 'total_amount,transaction_uuid,product_code,status',
        }
        payload['signature'] = _esewa_signature(payload, payload['signed_field_names'], 'sandbox-secret')

        updated = verify_esewa_callback(intent, payload=payload)

        self.assertEqual(updated.status, 'succeeded')
        self.assertEqual(updated.provider_reference, 'ESEWA-100')
        self.assertEqual(updated.settlement_status, 'skipped')

    def test_stripe_initiation_returns_client_secret_payload(self):
        tenant = connection.tenant
        tenant.payment_settings = {
            'stripe': {
                'enabled': True,
                'secret_key': 'sk_test_123',
                'publishable_key': 'pk_test_123',
            }
        }
        tenant.save(update_fields=['payment_settings'])
        intent = create_payment_intent(
            source_module='manual',
            source_id='stripe-init',
            amount='150.00',
            currency='USD',
            provider='stripe',
            idempotency_key='stripe-init-key',
        )

        with patch('payments.providers._stripe_request', return_value={'id': 'pi_test_123', 'client_secret': 'pi_test_secret', 'status': 'requires_payment_method'}):
            initiated = initiate_stripe_payment(intent)

        self.assertEqual(initiated.provider_reference, 'pi_test_123')
        self.assertEqual(initiated.provider_payload['client_secret'], 'pi_test_secret')
        self.assertEqual(initiated.status, 'requires_action')

    def test_stripe_confirm_marks_payment_succeeded(self):
        tenant = connection.tenant
        tenant.payment_settings = {
            'stripe': {
                'enabled': True,
                'secret_key': 'sk_test_123',
                'publishable_key': 'pk_test_123',
            }
        }
        tenant.save(update_fields=['payment_settings'])
        intent = create_payment_intent(
            source_module='manual',
            source_id='stripe-confirm',
            amount='150.00',
            currency='USD',
            provider='stripe',
            idempotency_key='stripe-confirm-key',
        )
        intent.provider_reference = 'pi_test_123'
        intent.save(update_fields=['provider_reference'])

        with patch('payments.providers._stripe_request', return_value={'id': 'pi_test_123', 'status': 'succeeded'}):
            updated = confirm_stripe_test_payment(intent)

        self.assertEqual(updated.status, 'succeeded')
        self.assertEqual(updated.settlement_status, 'skipped')

    def test_reconcile_succeeded_guest_folio_payment_settles_and_posts_once(self):
        suffix = str(abs(hash(self._testMethodName)) % 100000)
        room_type = RoomType.objects.create(name=f'Payment Deluxe {suffix}', code=f'PAY-{suffix}', base_rate='1000.00')
        room = Room.objects.create(room_number=f'P{suffix[-3:]}', room_type=room_type, price_per_night='1000.00')
        guest = Guest.objects.create(first_name='Payment', last_name='Guest', email=f'payment-{suffix}@example.com')
        booking = Booking.objects.create(
            room=room,
            guest=guest,
            check_in_date=date(2026, 5, 22),
            check_out_date=date(2026, 5, 23),
            number_of_guests=1,
            total_amount='1000.00',
            status='checked_in',
        )
        folio = GuestFolio.objects.create(booking=booking)
        intent = create_payment_intent(
            source_module='guest_folio',
            source_id=str(folio.id),
            amount=folio.grand_total,
            provider='khalti',
            idempotency_key=f'folio-reconcile-{suffix}',
        )
        mark_payment_succeeded(intent, provider_reference='KHALTI-SETTLED')

        settled = reconcile_payment_intent(intent)
        repeated = reconcile_payment_intent(intent)
        folio.refresh_from_db()

        self.assertEqual(settled.settlement_status, 'settled')
        self.assertEqual(repeated.settlement_status, 'settled')
        self.assertEqual(folio.status, 'paid')
        self.assertEqual(folio.payment_method, 'wallet')
        self.assertEqual(GuestFolioSerializer(folio).data['payment_reference']['provider_reference'], 'KHALTI-SETTLED')
        self.assertIn(b'Provider reference: KHALTI-SETTLED', guest_folio_pdf(folio))
        self.assertEqual(JournalEntry.objects.filter(source_module='guest_folio', source_id=str(folio.id), status='posted').count(), 1)

    def test_reconcile_succeeded_restaurant_payment_settles_and_posts_once(self):
        suffix = str(abs(hash(self._testMethodName)) % 100000)
        category = MenuCategory.objects.create(name=f'Payment Food {suffix}', code=f'PF-{suffix}')
        item = MenuItem.objects.create(category=category, name=f'Momo {suffix}', sku=f'MOMO-{suffix}', price='300.00')
        table = RestaurantTable.objects.create(table_number=f'T{suffix[-3:]}')
        order = RestaurantOrder.objects.create(table=table, order_type='dine_in', status='served')
        RestaurantOrderLine.objects.create(order=order, menu_item=item, quantity=1, unit_price=Decimal('300.00'), status='served')
        order.refresh_from_db()
        intent = create_payment_intent(
            source_module='restaurant_order',
            source_id=str(order.id),
            amount=order.grand_total,
            provider='esewa',
            idempotency_key=f'order-reconcile-{suffix}',
        )
        mark_payment_succeeded(intent, provider_reference='ESEWA-SETTLED')

        settled = reconcile_payment_intent(intent)
        repeated = reconcile_payment_intent(intent)
        order.refresh_from_db()

        self.assertEqual(settled.settlement_status, 'settled')
        self.assertEqual(repeated.settlement_status, 'settled')
        self.assertEqual(order.status, 'paid')
        self.assertEqual(order.payment_method, 'wallet')
        self.assertEqual(RestaurantOrderSerializer(order).data['payment_reference']['provider_reference'], 'ESEWA-SETTLED')
        self.assertEqual(RestaurantOrderPayment.objects.filter(order=order).count(), 1)
        self.assertEqual(JournalEntry.objects.filter(source_module='restaurant_order', source_id=str(order.id), status='posted').count(), 1)

    def test_summary_endpoint_returns_filtered_reconciliation_totals(self):
        create_payment_intent(
            source_module='manual',
            source_id='failed-1',
            amount='100.00',
            provider='khalti',
            idempotency_key='summary-failed',
        )
        failed_intent = PaymentIntent.objects.get(idempotency_key='summary-failed')
        failed_intent.settlement_status = 'failed'
        failed_intent.follow_up_status = 'open'
        failed_intent.save(update_fields=['settlement_status', 'follow_up_status'])

        create_payment_intent(
            source_module='manual',
            source_id='settled-1',
            amount='200.00',
            provider='esewa',
            idempotency_key='summary-settled',
        )
        settled_intent = PaymentIntent.objects.get(idempotency_key='summary-settled')
        settled_intent.settlement_status = 'settled'
        settled_intent.follow_up_status = 'resolved'
        settled_intent.save(update_fields=['settlement_status', 'follow_up_status'])

        user = PlatformUser.objects.create_user(email='payment-summary@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().get('/payments/intents/summary/', {'settlement_status': 'failed'})
        force_authenticate(request, user=user)
        response = PaymentIntentViewSet.as_view({'get': 'summary'})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['attention_count'], 1)
        self.assertEqual(response.data['by_settlement'][0]['settlement_status'], 'failed')

    def test_follow_up_action_records_reviewer_and_notes(self):
        intent = create_payment_intent(
            source_module='manual',
            source_id='follow-up-1',
            amount='100.00',
            provider='manual',
            idempotency_key='follow-up-action',
        )
        intent.settlement_status = 'failed'
        intent.follow_up_status = 'open'
        intent.save(update_fields=['settlement_status', 'follow_up_status'])

        user = PlatformUser.objects.create_user(email='payment-reviewer@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().post('/payments/intents/follow-up/', {'status': 'in_review', 'notes': 'Checking provider mismatch.'}, format='json')
        force_authenticate(request, user=user)
        response = PaymentIntentViewSet.as_view({'post': 'follow_up'})(request, pk=str(intent.id))

        self.assertEqual(response.status_code, 200)
        intent.refresh_from_db()
        self.assertEqual(intent.follow_up_status, 'in_review')
        self.assertEqual(intent.follow_up_notes, 'Checking provider mismatch.')
        self.assertEqual(intent.reviewed_by, user)
        self.assertIsNotNone(intent.reviewed_at)

    def test_export_endpoint_returns_filtered_csv(self):
        create_payment_intent(
            source_module='manual',
            source_id='export-1',
            amount='100.00',
            provider='khalti',
            idempotency_key='export-khalti',
            description='Khalti export row',
        )
        create_payment_intent(
            source_module='manual',
            source_id='export-2',
            amount='200.00',
            provider='esewa',
            idempotency_key='export-esewa',
            description='eSewa export row',
        )

        user = PlatformUser.objects.create_user(email='payment-export@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().get('/payments/intents/export/', {'provider': 'khalti'})
        force_authenticate(request, user=user)
        response = PaymentIntentViewSet.as_view({'get': 'export'})(request)
        content = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertIn('source,source_id,provider,provider_reference', content)
        self.assertIn('export-1', content)
        self.assertNotIn('export-2', content)
