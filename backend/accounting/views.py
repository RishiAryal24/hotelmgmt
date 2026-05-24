from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounting.models import Account, FiscalPeriod, JournalEntry, NightAuditRun, TaxRate, VendorBill
from accounting.serializers import AccountSerializer, AccountingDateRangeSerializer, FiscalPeriodSerializer, JournalEntrySerializer, NightAuditRunRequestSerializer, NightAuditRunSerializer, NightAuditScheduleSerializer, TaxRateSerializer, VendorBillSerializer
from accounting.services import get_balance_sheet, get_night_audit_schedule, get_profit_and_loss, get_trial_balance, post_vendor_bill, run_night_audit, seed_default_accounts, update_night_audit_schedule
from users.permissions import HasActionPermission


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'accounting.ledger.read',
        'retrieve': 'accounting.ledger.read',
        'create': 'accounting.journal.create',
        'update': 'accounting.journal.create',
        'partial_update': 'accounting.journal.create',
        'destroy': 'accounting.journal.create',
        'seed_defaults': 'accounting.journal.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['account_type', 'is_active']
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name']

    @action(detail=False, methods=['post'])
    def seed_defaults(self, request):
        seed_default_accounts()
        return Response({'status': 'Default accounts seeded'}, status=status.HTTP_201_CREATED)


class TaxRateViewSet(viewsets.ModelViewSet):
    queryset = TaxRate.objects.select_related('account').all()
    serializer_class = TaxRateSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'accounting.ledger.read',
        'retrieve': 'accounting.ledger.read',
        'create': 'accounting.journal.create',
        'update': 'accounting.journal.create',
        'partial_update': 'accounting.journal.create',
        'destroy': 'accounting.journal.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['tax_type', 'is_active', 'is_default']
    search_fields = ['code', 'name', 'description']
    ordering_fields = ['code', 'name', 'rate', 'created_at']


class VendorBillViewSet(viewsets.ModelViewSet):
    queryset = VendorBill.objects.select_related('vendor', 'journal_entry', 'posted_by').prefetch_related('lines', 'lines__account', 'lines__tax_rate', 'lines__tax_rate__account').all()
    serializer_class = VendorBillSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'accounting.ledger.read',
        'retrieve': 'accounting.ledger.read',
        'create': 'accounting.journal.create',
        'update': 'accounting.journal.create',
        'partial_update': 'accounting.journal.create',
        'destroy': 'accounting.journal.create',
        'post_bill': 'accounting.journal.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'vendor']
    search_fields = ['bill_number', 'invoice_number', 'vendor__name', 'notes']
    ordering_fields = ['bill_date', 'due_date', 'created_at', 'total_amount']

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=['post'], url_path='post')
    def post_bill(self, request, pk=None):
        bill = self.get_object()
        try:
            post_vendor_bill(bill, posted_by=request.user)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        bill.refresh_from_db()
        return Response(self.get_serializer(bill).data)


class JournalEntryViewSet(viewsets.ModelViewSet):
    queryset = JournalEntry.objects.prefetch_related('lines', 'lines__account').all()
    serializer_class = JournalEntrySerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'accounting.ledger.read',
        'retrieve': 'accounting.ledger.read',
        'create': 'accounting.journal.create',
        'update': 'accounting.journal.create',
        'partial_update': 'accounting.journal.create',
        'destroy': 'accounting.journal.create',
        'trial_balance': 'accounting.ledger.read',
        'profit_and_loss': 'accounting.ledger.read',
        'balance_sheet': 'accounting.ledger.read',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'source_module']
    search_fields = ['entry_number', 'description', 'source_id']
    ordering_fields = ['entry_date', 'created_at']

    def perform_create(self, serializer):
        serializer.save(posted_by=self.request.user)

    @action(detail=False, methods=['get'], url_path='trial-balance')
    def trial_balance(self, request):
        serializer = AccountingDateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        report = get_trial_balance(
            date_from=serializer.validated_data.get('date_from'),
            date_to=serializer.validated_data.get('date_to'),
        )
        return Response(report)

    @action(detail=False, methods=['get'], url_path='profit-and-loss')
    def profit_and_loss(self, request):
        serializer = AccountingDateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        date_from = serializer.validated_data.get('date_from')
        date_to = serializer.validated_data.get('date_to')
        if not date_from or not date_to:
            return Response({'error': 'date_from and date_to are required.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(get_profit_and_loss(date_from=date_from, date_to=date_to))

    @action(detail=False, methods=['get'], url_path='balance-sheet')
    def balance_sheet(self, request):
        serializer = AccountingDateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(get_balance_sheet(as_of=serializer.validated_data.get('as_of')))


class FiscalPeriodViewSet(viewsets.ModelViewSet):
    queryset = FiscalPeriod.objects.select_related('closed_by').all()
    serializer_class = FiscalPeriodSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'accounting.ledger.read',
        'retrieve': 'accounting.ledger.read',
        'create': 'accounting.journal.create',
        'update': 'accounting.journal.create',
        'partial_update': 'accounting.journal.create',
        'destroy': 'accounting.journal.create',
        'close_period': 'accounting.journal.create',
        'reopen_period': 'accounting.journal.create',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status']
    search_fields = ['name']
    ordering_fields = ['start_date', 'end_date', 'created_at']

    @action(detail=True, methods=['post'], url_path='close')
    def close_period(self, request, pk=None):
        period = self.get_object()
        period.status = 'closed'
        period.closed_by = request.user
        period.closed_at = timezone.now()
        period.save(update_fields=['status', 'closed_by', 'closed_at', 'updated_at'])
        return Response(self.get_serializer(period).data)

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen_period(self, request, pk=None):
        period = self.get_object()
        period.status = 'open'
        period.closed_by = None
        period.closed_at = None
        period.save(update_fields=['status', 'closed_by', 'closed_at', 'updated_at'])
        return Response(self.get_serializer(period).data)


class NightAuditRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = NightAuditRun.objects.select_related('triggered_by').all()
    serializer_class = NightAuditRunSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'accounting.ledger.read',
        'retrieve': 'accounting.ledger.read',
        'schedule': 'accounting.ledger.read',
        'update_schedule': 'accounting.journal.create',
        'run_now': 'accounting.journal.create',
    }
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'audit_date']
    ordering_fields = ['audit_date', 'started_at', 'completed_at']

    @action(detail=False, methods=['get'])
    def schedule(self, request):
        return Response(NightAuditScheduleSerializer(get_night_audit_schedule()).data)

    @action(detail=False, methods=['put'], url_path='configure-schedule')
    def update_schedule(self, request):
        serializer = NightAuditScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule = update_night_audit_schedule(
            enabled=serializer.validated_data.get('enabled', False),
            run_time=serializer.validated_data['run_time'],
            timezone_name=serializer.validated_data.get('timezone') or 'Asia/Katmandu',
            notes=serializer.validated_data.get('notes', ''),
        )
        return Response(NightAuditScheduleSerializer(schedule).data)

    @action(detail=False, methods=['post'], url_path='run')
    def run_now(self, request):
        serializer = NightAuditRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            run = run_night_audit(
                audit_date=serializer.validated_data.get('audit_date'),
                triggered_by=request.user,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(run).data, status=status.HTTP_201_CREATED)
