from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated

from notifications.models import NotificationEvent, NotificationTemplate
from notifications.serializers import NotificationEventSerializer, NotificationTemplateSerializer
from users.permissions import HasActionPermission


class NotificationEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = NotificationEvent.objects.select_related('template', 'recipient_user', 'created_by').all()
    serializer_class = NotificationEventSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'notifications.event.read',
        'retrieve': 'notifications.event.read',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['channel', 'status', 'priority', 'event_type', 'module', 'recipient_user']
    search_fields = ['subject', 'message', 'recipient_email', 'recipient_phone', 'event_type', 'module']
    ordering_fields = ['created_at', 'updated_at', 'status', 'priority', 'channel']


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
