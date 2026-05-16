from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from maintenance.models import MaintenanceTicket
from maintenance.serializers import MaintenanceTicketSerializer
from maintenance.services import cancel_maintenance_ticket, close_maintenance_ticket, resolve_maintenance_ticket, start_maintenance_ticket
from users.permissions import HasActionPermission


class MaintenanceTicketViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceTicket.objects.select_related(
        'room',
        'room__room_type',
        'reported_by',
        'assigned_to',
    ).all()
    serializer_class = MaintenanceTicketSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'maintenance.ticket.update',
        'retrieve': 'maintenance.ticket.update',
        'create': 'maintenance.ticket.update',
        'update': 'maintenance.ticket.update',
        'partial_update': 'maintenance.ticket.update',
        'destroy': 'maintenance.ticket.update',
        'start': 'maintenance.ticket.update',
        'resolve': 'maintenance.ticket.update',
        'close': 'maintenance.ticket.update',
        'cancel': 'maintenance.ticket.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'priority', 'category', 'room', 'assigned_to']
    search_fields = ['title', 'description', 'room__room_number']
    ordering_fields = ['created_at', 'due_at', 'priority', 'status']

    def _run_action(self, handler, request, *args, **kwargs):
        ticket = self.get_object()
        try:
            handler(ticket)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        return self._run_action(start_maintenance_ticket, request)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        return self._run_action(lambda ticket: resolve_maintenance_ticket(ticket, request.data.get('resolution_notes', '')), request)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        return self._run_action(close_maintenance_ticket, request)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        return self._run_action(cancel_maintenance_ticket, request)

