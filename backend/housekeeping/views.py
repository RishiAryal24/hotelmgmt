from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from bookings.models import Room
from housekeeping.models import HousekeepingTask
from housekeeping.serializers import HousekeepingTaskSerializer
from housekeeping.services import complete_housekeeping_task
from maintenance.serializers import MaintenanceTicketSerializer
from maintenance.services import create_maintenance_ticket
from users.permissions import HasActionPermission


class HousekeepingTaskViewSet(viewsets.ModelViewSet):
    queryset = HousekeepingTask.objects.select_related('room', 'room__room_type', 'assigned_to').all()
    serializer_class = HousekeepingTaskSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'housekeeping.task.update',
        'retrieve': 'housekeeping.task.update',
        'create': 'housekeeping.task.update',
        'update': 'housekeeping.task.update',
        'partial_update': 'housekeeping.task.update',
        'destroy': 'housekeeping.task.update',
        'start': 'housekeeping.task.update',
        'complete': 'housekeeping.task.update',
        'block': 'housekeeping.task.update',
        'escalate_maintenance': 'housekeeping.task.update',
        'create_for_room': 'housekeeping.task.update',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'task_type', 'priority', 'room', 'assigned_to']
    search_fields = ['room__room_number', 'notes']
    ordering_fields = ['created_at', 'due_at', 'priority', 'status']

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        task = self.get_object()
        if task.status not in ['open', 'blocked']:
            return Response({'error': 'Task cannot be started'}, status=status.HTTP_400_BAD_REQUEST)
        task.status = 'in_progress'
        task.save(update_fields=['status', 'updated_at'])
        return Response({'status': 'Task started'})

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        complete_housekeeping_task(task)
        return Response({'status': 'Task completed'})

    @action(detail=True, methods=['post'])
    def block(self, request, pk=None):
        task = self.get_object()
        task.status = 'blocked'
        task.notes = request.data.get('notes', task.notes)
        task.save(update_fields=['status', 'notes', 'updated_at'])
        return Response({'status': 'Task blocked'})

    @action(detail=True, methods=['post'])
    def escalate_maintenance(self, request, pk=None):
        task = self.get_object()
        notes = request.data.get('notes', task.notes)
        task.status = 'blocked'
        task.task_type = 'maintenance_escalation'
        task.priority = 'urgent'
        task.notes = notes
        task.save(update_fields=['status', 'task_type', 'priority', 'notes', 'updated_at'])
        ticket = create_maintenance_ticket(
            room=task.room,
            title=f'Housekeeping escalation - Room {task.room.room_number}',
            description=notes,
            category='other',
            priority='urgent',
            reported_by=request.user,
        )
        return Response(
            {
                'status': 'Escalated to maintenance',
                'ticket': MaintenanceTicketSerializer(ticket, context={'request': request}).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'])
    def create_for_room(self, request):
        room_id = request.data.get('room')
        if not room_id:
            return Response({'error': 'room is required'}, status=status.HTTP_400_BAD_REQUEST)
        room = Room.objects.get(pk=room_id)
        task = HousekeepingTask.objects.create(
            room=room,
            task_type=request.data.get('task_type', 'checkout_clean'),
            priority=request.data.get('priority', 'normal'),
            notes=request.data.get('notes', ''),
            assigned_to_id=request.data.get('assigned_to') or None,
        )
        room.status = 'cleaning'
        room.save(update_fields=['status', 'updated_at'])
        return Response(HousekeepingTaskSerializer(task).data, status=status.HTTP_201_CREATED)
