from datetime import date
from decimal import Decimal

from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounting.models import FiscalPeriod, JournalEntry, JournalLine, NightAuditRun, TaxRate, VendorBill
from accounting.services import get_balance_sheet, get_night_audit_schedule, get_profit_and_loss, get_trial_balance, post_journal_entry, run_night_audit, seed_default_accounts, update_night_audit_schedule
from accounting.views import FiscalPeriodViewSet, JournalEntryViewSet, NightAuditRunViewSet, TaxRateViewSet, VendorBillViewSet
from bookings.models import Booking, Guest, GuestFolioLine, Room, RoomType
from inventory.models import Vendor
from users.models import PlatformUser


class AccountingReportingTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_accounting'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-accounting.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Accounting'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        seed_default_accounts()
        self.user = PlatformUser.objects.create_user(
            email='accounting-admin@example.com',
            password='testpass123456',
            tenant=connection.tenant,
            is_tenant_admin=True,
        )
        self.factory = APIRequestFactory()

    def _create_entry(self, *, entry_date, description, lines, source_module='manual', source_id=''):
        entry = JournalEntry.objects.create(
            entry_date=entry_date,
            description=description,
            source_module=source_module,
            source_id=source_id,
            status='posted',
            posted_by=self.user,
        )
        for code, debit, credit in lines:
            JournalLine.objects.create(
                journal_entry=entry,
                account_id=seed_default_accounts()[code].id,
                description=f'{code} line',
                debit=Decimal(str(debit)),
                credit=Decimal(str(credit)),
            )
        return entry

    def test_trial_balance_returns_balanced_rows_for_period(self):
        self._create_entry(
            entry_date=date(2026, 5, 1),
            description='Room sale',
            lines=[
                ('1000', '1200.00', '0.00'),
                ('4000', '0.00', '1200.00'),
            ],
        )
        self._create_entry(
            entry_date=date(2026, 5, 2),
            description='Salary expense',
            lines=[
                ('5100', '300.00', '0.00'),
                ('1000', '0.00', '300.00'),
            ],
        )

        report = get_trial_balance(date_from=date(2026, 5, 1), date_to=date(2026, 5, 31))

        self.assertEqual(report['totals']['debit_balance'], Decimal('1200.00'))
        self.assertEqual(report['totals']['credit_balance'], Decimal('1200.00'))
        self.assertEqual(report['rows'][0]['account_code'], '1000')

    def test_profit_and_loss_calculates_net_income(self):
        self._create_entry(
            entry_date=date(2026, 5, 1),
            description='Room sale',
            lines=[
                ('1000', '1200.00', '0.00'),
                ('4000', '0.00', '1200.00'),
            ],
        )
        self._create_entry(
            entry_date=date(2026, 5, 3),
            description='Food cost',
            lines=[
                ('5000', '250.00', '0.00'),
                ('1000', '0.00', '250.00'),
            ],
        )

        report = get_profit_and_loss(date_from=date(2026, 5, 1), date_to=date(2026, 5, 31))

        self.assertEqual(report['totals']['revenue'], Decimal('1200.00'))
        self.assertEqual(report['totals']['expenses'], Decimal('250.00'))
        self.assertEqual(report['totals']['net_income'], Decimal('950.00'))

    def test_balance_sheet_groups_assets_liabilities_and_equity(self):
        self._create_entry(
            entry_date=date(2026, 5, 1),
            description='Owner funding',
            lines=[
                ('1000', '5000.00', '0.00'),
                ('3000', '0.00', '5000.00'),
            ],
        )
        self._create_entry(
            entry_date=date(2026, 5, 2),
            description='Inventory on account',
            lines=[
                ('1200', '800.00', '0.00'),
                ('2000', '0.00', '800.00'),
            ],
        )

        report = get_balance_sheet(as_of=date(2026, 5, 31))

        self.assertEqual(report['totals']['asset'], Decimal('5800.00'))
        self.assertEqual(report['totals']['liability'], Decimal('800.00'))
        self.assertEqual(report['totals']['equity'], Decimal('5000.00'))
        self.assertEqual(report['totals']['liabilities_and_equity'], Decimal('5800.00'))

    def test_closed_fiscal_period_blocks_new_posted_entry(self):
        FiscalPeriod.objects.create(
            name='May 2026',
            start_date=date(2026, 5, 1),
            end_date=date(2026, 5, 31),
            status='closed',
        )
        request = self.factory.post(
            '/accounting/journal-entries/',
            {
                'entry_date': '2026-05-15',
                'description': 'Blocked entry',
                'source_module': 'manual',
                'source_id': '',
                'status': 'posted',
                'lines': [
                    {'account': str(seed_default_accounts()['1000'].id), 'description': 'Cash', 'debit': '100.00', 'credit': '0.00'},
                    {'account': str(seed_default_accounts()['3000'].id), 'description': 'Equity', 'debit': '0.00', 'credit': '100.00'},
                ],
            },
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = JournalEntryViewSet.as_view({'post': 'create'})(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn('Fiscal period', str(response.data))

    def test_fiscal_period_close_and_reopen_actions(self):
        period = FiscalPeriod.objects.create(
            name='June 2026',
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 30),
            status='open',
        )

        close_request = self.factory.post(f'/accounting/fiscal-periods/{period.id}/close/', {}, format='json')
        force_authenticate(close_request, user=self.user)
        close_response = FiscalPeriodViewSet.as_view({'post': 'close_period'})(close_request, pk=str(period.id))

        self.assertEqual(close_response.status_code, 200)
        period.refresh_from_db()
        self.assertEqual(period.status, 'closed')
        self.assertEqual(period.closed_by, self.user)

        reopen_request = self.factory.post(f'/accounting/fiscal-periods/{period.id}/reopen/', {}, format='json')
        force_authenticate(reopen_request, user=self.user)
        reopen_response = FiscalPeriodViewSet.as_view({'post': 'reopen_period'})(reopen_request, pk=str(period.id))

        self.assertEqual(reopen_response.status_code, 200)
        period.refresh_from_db()
        self.assertEqual(period.status, 'open')
        self.assertIsNone(period.closed_by)

    def test_tax_rate_endpoint_creates_liability_backed_rate(self):
        tax_account = seed_default_accounts()['2100']
        request = self.factory.post(
            '/accounting/tax-rates/',
            {
                'code': 'VAT13',
                'name': 'VAT 13%',
                'tax_type': 'sales',
                'rate': '13.000',
                'account': str(tax_account.id),
                'is_default': True,
                'is_active': True,
            },
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = TaxRateViewSet.as_view({'post': 'create'})(request)

        self.assertEqual(response.status_code, 201)
        self.assertTrue(TaxRate.objects.filter(code='VAT13', account=tax_account).exists())
        self.assertEqual(response.data['account_details']['code'], '2100')

    def test_tax_rate_rejects_non_liability_control_account(self):
        cash_account = seed_default_accounts()['1000']
        request = self.factory.post(
            '/accounting/tax-rates/',
            {
                'code': 'BADTAX',
                'name': 'Bad Tax',
                'tax_type': 'sales',
                'rate': '5.000',
                'account': str(cash_account.id),
                'is_active': True,
            },
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = TaxRateViewSet.as_view({'post': 'create'})(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn('liability', str(response.data).lower())

    def test_vendor_bill_create_and_post_creates_accounts_payable_journal(self):
        accounts = seed_default_accounts()
        vendor = Vendor.objects.create(name='Laundry Supplier')
        tax_rate = TaxRate.objects.create(
            code='VAT13',
            name='VAT 13%',
            tax_type='purchase',
            rate=Decimal('13.000'),
            account=accounts['2100'],
        )
        create_request = self.factory.post(
            '/accounting/vendor-bills/',
            {
                'vendor': str(vendor.id),
                'invoice_number': 'INV-1001',
                'bill_date': '2026-05-18',
                'due_date': '2026-06-01',
                'notes': 'Laundry service bill',
                'lines': [
                    {
                        'account': str(accounts['5000'].id),
                        'tax_rate': str(tax_rate.id),
                        'description': 'Laundry supplies',
                        'amount': '1000.00',
                        'tax_amount': '130.00',
                    }
                ],
            },
            format='json',
        )
        force_authenticate(create_request, user=self.user)
        create_response = VendorBillViewSet.as_view({'post': 'create'})(create_request)

        self.assertEqual(create_response.status_code, 201)
        bill = VendorBill.objects.get(id=create_response.data['id'])
        self.assertEqual(bill.total_amount, Decimal('1130.00'))
        self.assertEqual(bill.status, 'draft')

        post_request = self.factory.post(f'/accounting/vendor-bills/{bill.id}/post/', {}, format='json')
        force_authenticate(post_request, user=self.user)
        post_response = VendorBillViewSet.as_view({'post': 'post_bill'})(post_request, pk=str(bill.id))

        self.assertEqual(post_response.status_code, 200)
        bill.refresh_from_db()
        self.assertEqual(bill.status, 'posted')
        journal = JournalEntry.objects.get(source_module='vendor_bill', source_id=str(bill.id))
        self.assertEqual(journal.entry_date, date(2026, 5, 18))
        self.assertEqual(JournalLine.objects.get(journal_entry=journal, account__code='5000').debit, Decimal('1000.00'))
        self.assertEqual(JournalLine.objects.get(journal_entry=journal, account__code='2100').debit, Decimal('130.00'))
        self.assertEqual(JournalLine.objects.get(journal_entry=journal, account__code='2000').credit, Decimal('1130.00'))

    def test_closed_fiscal_period_blocks_vendor_bill_posting(self):
        accounts = seed_default_accounts()
        vendor = Vendor.objects.create(name='Closed Period Supplier')
        bill = VendorBill.objects.create(vendor=vendor, invoice_number='INV-CLOSED', bill_date=date(2026, 5, 20))
        bill.lines.create(account=accounts['5000'], description='Blocked bill', amount=Decimal('50.00'))
        bill.recalculate_totals()
        FiscalPeriod.objects.create(
            name='Closed May 2026',
            start_date=date(2026, 5, 1),
            end_date=date(2026, 5, 31),
            status='closed',
        )

        request = self.factory.post(f'/accounting/vendor-bills/{bill.id}/post/', {}, format='json')
        force_authenticate(request, user=self.user)
        response = VendorBillViewSet.as_view({'post': 'post_bill'})(request, pk=str(bill.id))

        self.assertEqual(response.status_code, 400)
        self.assertIn('closed', str(response.data).lower())

    def test_trial_balance_endpoint_returns_report(self):
        self._create_entry(
            entry_date=date(2026, 5, 1),
            description='Room sale',
            lines=[
                ('1000', '1200.00', '0.00'),
                ('4000', '0.00', '1200.00'),
            ],
        )
        request = self.factory.get('/accounting/journal-entries/trial-balance/', {'date_from': '2026-05-01', 'date_to': '2026-05-31'})
        force_authenticate(request, user=self.user)
        response = JournalEntryViewSet.as_view({'get': 'trial_balance'})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['totals']['debit_balance'], Decimal('1200.00'))

    def test_night_audit_run_creates_review_record_and_room_charge_line(self):
        room_type = RoomType.objects.create(name='Audit Standard', code='AUD-STD', base_rate='100.00')
        room = Room.objects.create(room_number='NA-101', room_type=room_type, capacity=2, price_per_night='100.00')
        guest = Guest.objects.create(first_name='Night', last_name='Guest', email='night.guest@example.com')
        booking = Booking.objects.create(
            room=room,
            guest=guest,
            check_in_date=date(2026, 5, 24),
            check_out_date=date(2026, 5, 25),
            number_of_guests=1,
            status='checked_in',
        )

        run = run_night_audit(audit_date=date(2026, 5, 24), triggered_by=self.user)

        self.assertEqual(run.status, 'completed')
        self.assertEqual(run.checked_in_bookings, 1)
        self.assertEqual(run.room_charge_lines_created, 1)
        self.assertTrue(GuestFolioLine.objects.filter(folio__booking=booking, source_module='room_charge').exists())

    def test_night_audit_endpoint_runs_and_blocks_duplicate_date(self):
        request = self.factory.post('/accounting/night-audits/run/', {'audit_date': '2026-05-24'}, format='json')
        force_authenticate(request, user=self.user)
        response = NightAuditRunViewSet.as_view({'post': 'run_now'})(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['audit_date'], '2026-05-24')
        self.assertTrue(NightAuditRun.objects.filter(audit_date=date(2026, 5, 24)).exists())

        duplicate_request = self.factory.post('/accounting/night-audits/run/', {'audit_date': '2026-05-24'}, format='json')
        force_authenticate(duplicate_request, user=self.user)
        duplicate_response = NightAuditRunViewSet.as_view({'post': 'run_now'})(duplicate_request)

        self.assertEqual(duplicate_response.status_code, 400)
        self.assertIn('already ran', str(duplicate_response.data))

    def test_night_audit_schedule_can_be_updated(self):
        schedule = update_night_audit_schedule(
            enabled=True,
            run_time='03:15',
            timezone_name='Asia/Katmandu',
            notes='Run after POS close',
        )

        self.assertTrue(schedule.enabled)
        self.assertEqual(str(schedule.run_time), '03:15:00')
        self.assertEqual(get_night_audit_schedule().notes, 'Run after POS close')
