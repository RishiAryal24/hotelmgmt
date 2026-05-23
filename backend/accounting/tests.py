from datetime import date
from decimal import Decimal

from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounting.models import FiscalPeriod, JournalEntry, JournalLine
from accounting.services import get_balance_sheet, get_profit_and_loss, get_trial_balance, post_journal_entry, seed_default_accounts
from accounting.views import FiscalPeriodViewSet, JournalEntryViewSet
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
