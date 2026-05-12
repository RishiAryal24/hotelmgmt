from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounting.models import Account, JournalEntry
from accounting.serializers import AccountSerializer, JournalEntrySerializer
from accounting.services import seed_default_accounts
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
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'source_module']
    search_fields = ['entry_number', 'description', 'source_id']
    ordering_fields = ['entry_date', 'created_at']

    def perform_create(self, serializer):
        serializer.save(posted_by=self.request.user)
