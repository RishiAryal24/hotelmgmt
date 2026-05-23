from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from notifications.models import NotificationEvent, NotificationTemplate
from notifications.serializers import NotificationDeliveryActionSerializer, NotificationEventSerializer, NotificationTemplateSerializer, NotificationTestDeliverySerializer, NotificationWorkflowSerializer
from notifications.services import create_notification_event, deliver_notification_event
from notifications.tasks import cancel_notification_delivery, retry_notification_delivery
from users.permissions import HasActionPermission


class NotificationEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = NotificationEvent.objects.select_related('template', 'recipient_user', 'created_by').all()
    serializer_class = NotificationEventSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'notifications.event.read',
        'retrieve': 'notifications.event.read',
        'acknowledge': 'notifications.event.update',
        'resolve': 'notifications.event.update',
        'reopen': 'notifications.event.update',
        'retry': 'notifications.event.update',
        'cancel_delivery': 'notifications.event.update',
        'test_delivery': 'notifications.template.manage',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['channel', 'status', 'workflow_status', 'priority', 'event_type', 'module', 'recipient_user']
    search_fields = ['subject', 'message', 'recipient_email', 'recipient_phone', 'event_type', 'module']
    ordering_fields = ['created_at', 'updated_at', 'status', 'workflow_status', 'priority', 'channel']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if getattr(user, 'is_platform_admin', False) or getattr(user, 'is_tenant_admin', False):
            return queryset
        return queryset.filter(recipient_user=user)

    def _workflow_response(self, handler):
        serializer = NotificationWorkflowSerializer(data=self.request.data)
        serializer.is_valid(raise_exception=True)
        event = self.get_object()
        handler(event, serializer.validated_data.get('notes', ''))
        event.refresh_from_db()
        return Response(self.get_serializer(event).data)

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        return self._workflow_response(lambda event, notes: event.acknowledge(user=request.user, notes=notes))

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        return self._workflow_response(lambda event, notes: event.resolve(user=request.user, notes=notes))

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        return self._workflow_response(lambda event, notes: event.reopen(notes=notes))

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        event = self.get_object()
        try:
            retry_notification_delivery(event)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        event.refresh_from_db()
        return Response(self.get_serializer(event).data)

    @action(detail=True, methods=['post'], url_path='cancel-delivery')
    def cancel_delivery(self, request, pk=None):
        serializer = NotificationDeliveryActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = self.get_object()
        try:
            cancel_notification_delivery(event, reason=serializer.validated_data.get('reason') or 'Canceled by user')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        event.refresh_from_db()
        return Response(self.get_serializer(event).data)

    @action(detail=False, methods=['post'], url_path='test-delivery')
    def test_delivery(self, request):
        serializer = NotificationTestDeliverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = create_notification_event(
            channel=serializer.validated_data['channel'],
            event_type='notifications.test_delivery',
            module='notifications',
            subject=serializer.validated_data['subject'],
            message=serializer.validated_data['message'],
            recipient_email=serializer.validated_data.get('recipient_email', ''),
            recipient_phone=serializer.validated_data.get('recipient_phone', ''),
            priority='normal',
            payload={'source': 'notification_settings_test'},
            created_by=request.user,
        )
        try:
            deliver_notification_event(event)
        except Exception:
            event.refresh_from_db()
            return Response(self.get_serializer(event).data, status=status.HTTP_400_BAD_REQUEST)
        event.refresh_from_db()
        return Response(self.get_serializer(event).data, status=status.HTTP_201_CREATED)


class NotificationTemplateViewSet(viewsets.ModelViewSet):
    queryset = NotificationTemplate.objects.all()
    serializer_class = NotificationTemplateSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'notifications.template.read',
        'retrieve': 'notifications.template.read',
        'create': 'notifications.template.manage',
        'update': 'notifications.template.manage',
        'partial_update': 'notifications.template.manage',
        'destroy': 'notifications.template.manage',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['channel', 'is_active']
    search_fields = ['code', 'name', 'subject_template', 'body_template']
    ordering_fields = ['code', 'name', 'channel', 'created_at']
