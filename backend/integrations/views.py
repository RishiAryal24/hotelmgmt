from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from integrations.models import OTAChannel, OTAChannelRatePlanMapping, OTAChannelRoomTypeMapping, OTAReservationImport, OTASyncJob, OTAWebhookEvent
from integrations.serializers import (
    OTAChannelRatePlanMappingSerializer,
    OTAChannelRoomTypeMappingSerializer,
    OTAChannelSerializer,
    OTAReservationImportSerializer,
    OTAReservationReviewSerializer,
    OTASyncJobSerializer,
    OTASyncRequestSerializer,
    OTAWebhookEventSerializer,
    ZodomusTestReservationSerializer,
)
from integrations.services import OTASyncError, accept_reservation_import, activate_zodomus_rooms, apply_reservation_cancellation, apply_reservation_modification, check_zodomus_connection, extract_zodomus_property_id, fetch_zodomus_room_rates, process_webhook_event, pull_zodomus_reservations, record_webhook_event, run_availability_sync, run_rate_sync, run_zodomus_test_reservation
from users.permissions import HasActionPermission


class OTAChannelViewSet(viewsets.ModelViewSet):
    queryset = OTAChannel.objects.all()
    serializer_class = OTAChannelSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'integrations.ota.read',
        'retrieve': 'integrations.ota.read',
        'create': 'integrations.ota.manage',
        'update': 'integrations.ota.manage',
        'partial_update': 'integrations.ota.manage',
        'destroy': 'integrations.ota.manage',
        'sync_availability': 'integrations.ota.manage',
        'sync_rates': 'integrations.ota.manage',
        'check_connection': 'integrations.ota.manage',
        'discover_inventory': 'integrations.ota.manage',
        'activate_rooms': 'integrations.ota.manage',
        'pull_reservations': 'integrations.ota.manage',
        'create_test_reservation': 'integrations.ota.manage',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['provider', 'is_active', 'sync_direction']
    search_fields = ['name', 'code', 'base_url']
    ordering_fields = ['name', 'code', 'last_sync']

    def get_permissions(self):
        if getattr(self, 'action', None) == 'webhook':
            return [AllowAny()]
        return super().get_permissions()

    def _run_sync(self, request, sync_handler):
        serializer = OTASyncRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        channel = self.get_object()
        try:
            job = sync_handler(channel, **serializer.validated_data)
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(OTASyncJobSerializer(job).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='sync-availability')
    def sync_availability(self, request, pk=None):
        return self._run_sync(request, run_availability_sync)

    @action(detail=True, methods=['post'], url_path='sync-rates')
    def sync_rates(self, request, pk=None):
        return self._run_sync(request, run_rate_sync)

    @action(detail=True, methods=['post'], url_path='check-connection')
    def check_connection(self, request, pk=None):
        channel = self.get_object()
        if channel.provider != 'zodomus':
            return Response({'status': 'skipped', 'message': 'Connection checks are currently implemented for Zodomus channels.'})
        try:
            provider_response = check_zodomus_connection(channel)
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        discovered_property_id = extract_zodomus_property_id(provider_response)
        if discovered_property_id:
            settings = channel.settings or {}
            if not settings.get('property_id'):
                settings['property_id'] = discovered_property_id
                channel.settings = settings
                channel.save(update_fields=['settings'])
        channel.mark_synced()
        return Response({'status': 'ok', 'property_id': discovered_property_id, 'provider_response': provider_response})

    @action(detail=True, methods=['post'], url_path='discover-inventory')
    def discover_inventory(self, request, pk=None):
        channel = self.get_object()
        if channel.provider != 'zodomus':
            return Response({'status': 'skipped', 'message': 'Inventory discovery is currently implemented for Zodomus channels.'})
        try:
            provider_response = fetch_zodomus_room_rates(channel)
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        channel.mark_synced()
        return Response({'status': 'ok', 'provider_response': provider_response})

    @action(detail=True, methods=['post'], url_path='activate-rooms')
    def activate_rooms(self, request, pk=None):
        channel = self.get_object()
        if channel.provider != 'zodomus':
            return Response({'status': 'skipped', 'message': 'Room activation is currently implemented for Zodomus channels.'})
        try:
            provider_response = activate_zodomus_rooms(channel)
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        channel.mark_synced()
        return Response({'status': 'ok', 'provider_response': provider_response})

    @action(detail=True, methods=['post'], url_path='pull-reservations')
    def pull_reservations(self, request, pk=None):
        channel = self.get_object()
        try:
            job = pull_zodomus_reservations(channel)
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(OTASyncJobSerializer(job).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='create-test-reservation')
    def create_test_reservation(self, request, pk=None):
        serializer = ZodomusTestReservationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        channel = self.get_object()
        payload = {
            **serializer.validated_data,
            'check_in_date': serializer.validated_data['check_in_date'].isoformat(),
            'check_out_date': serializer.validated_data['check_out_date'].isoformat(),
        }
        if 'total_amount' in payload:
            payload['total_amount'] = str(payload['total_amount'])
        try:
            job = run_zodomus_test_reservation(channel, payload)
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(OTASyncJobSerializer(job).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def webhook(self, request, pk=None):
        channel = self.get_object()
        external_event_id = request.headers.get('X-OTA-Event-ID') or request.data.get('event_id') or request.data.get('id')
        event_type = request.headers.get('X-OTA-Event-Type') or request.data.get('event_type') or request.data.get('type') or ''
        try:
            event, created = record_webhook_event(
                channel,
                external_event_id=str(external_event_id or ''),
                event_type=str(event_type or ''),
                payload=request.data,
            )
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not created:
            return Response({'status': 'duplicate', 'event_id': event.external_event_id}, status=status.HTTP_200_OK)
        process_webhook_event(event)
        return Response({'status': 'processed', 'event_id': event.external_event_id}, status=status.HTTP_202_ACCEPTED)


class OTAChannelRoomTypeMappingViewSet(viewsets.ModelViewSet):
    queryset = OTAChannelRoomTypeMapping.objects.select_related('channel', 'room_type').all()
    serializer_class = OTAChannelRoomTypeMappingSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'integrations.ota.read',
        'retrieve': 'integrations.ota.read',
        'create': 'integrations.ota.manage',
        'update': 'integrations.ota.manage',
        'partial_update': 'integrations.ota.manage',
        'destroy': 'integrations.ota.manage',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['channel', 'room_type', 'is_active']
    search_fields = ['external_room_type_id', 'external_room_type_name', 'room_type__name', 'room_type__code']
    ordering_fields = ['channel__name', 'room_type__name', 'external_room_type_id']


class OTAChannelRatePlanMappingViewSet(viewsets.ModelViewSet):
    queryset = OTAChannelRatePlanMapping.objects.select_related('channel', 'rate_plan', 'rate_plan__room_type').all()
    serializer_class = OTAChannelRatePlanMappingSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'integrations.ota.read',
        'retrieve': 'integrations.ota.read',
        'create': 'integrations.ota.manage',
        'update': 'integrations.ota.manage',
        'partial_update': 'integrations.ota.manage',
        'destroy': 'integrations.ota.manage',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['channel', 'rate_plan', 'is_active']
    search_fields = ['external_rate_plan_id', 'external_rate_plan_name', 'rate_plan__name']
    ordering_fields = ['channel__name', 'rate_plan__name', 'external_rate_plan_id']


class OTASyncJobViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OTASyncJob.objects.select_related('channel').all()
    serializer_class = OTASyncJobSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'integrations.ota.read',
        'retrieve': 'integrations.ota.read',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['channel', 'sync_type', 'status']
    search_fields = ['channel__name', 'channel__code', 'error_message']
    ordering_fields = ['created_at', 'started_at', 'completed_at', 'status']


class OTAWebhookEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OTAWebhookEvent.objects.select_related('channel').all()
    serializer_class = OTAWebhookEventSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'integrations.ota.read',
        'retrieve': 'integrations.ota.read',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['channel', 'status', 'event_type']
    search_fields = ['channel__name', 'channel__code', 'external_event_id', 'event_type']
    ordering_fields = ['created_at', 'processed_at', 'status']


class OTAReservationImportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OTAReservationImport.objects.select_related('channel', 'booking', 'reviewed_by').all()
    serializer_class = OTAReservationImportSerializer
    permission_classes = [IsAuthenticated, HasActionPermission]
    permission_map = {
        'list': 'integrations.ota.read',
        'retrieve': 'integrations.ota.read',
        'accept': 'integrations.ota.manage',
        'apply_cancellation': 'integrations.ota.manage',
        'apply_modification': 'integrations.ota.manage',
        'reject': 'integrations.ota.manage',
    }
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['channel', 'status', 'conflict_type', 'external_room_type_id', 'external_rate_plan_id']
    search_fields = ['external_reservation_id', 'guest_first_name', 'guest_last_name', 'guest_email', 'conflict_message']
    ordering_fields = ['created_at', 'updated_at', 'check_in_date', 'status']

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        serializer = OTAReservationReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation_import = self.get_object()
        try:
            accept_reservation_import(reservation_import, user=request.user, notes=serializer.validated_data.get('notes', ''))
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        reservation_import.refresh_from_db()
        return Response(self.get_serializer(reservation_import).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        serializer = OTAReservationReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation_import = self.get_object()
        reservation_import.mark_reviewed(status='rejected', user=request.user, notes=serializer.validated_data.get('notes', ''))
        from audit.services import log_audit_event
        from notifications.services import create_ota_reservation_reviewed_notification

        create_ota_reservation_reviewed_notification(reservation_import, action='rejected', created_by=request.user)
        log_audit_event(
            action='update',
            instance=reservation_import,
            actor=request.user,
            changes={'status': 'rejected'},
            metadata={'action': 'reject_ota_reservation', 'notes': serializer.validated_data.get('notes', '')},
        )
        reservation_import.refresh_from_db()
        return Response(self.get_serializer(reservation_import).data)

    @action(detail=True, methods=['post'], url_path='apply-modification')
    def apply_modification(self, request, pk=None):
        serializer = OTAReservationReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation_import = self.get_object()
        try:
            apply_reservation_modification(reservation_import, user=request.user, notes=serializer.validated_data.get('notes', ''))
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        reservation_import.refresh_from_db()
        return Response(self.get_serializer(reservation_import).data)

    @action(detail=True, methods=['post'], url_path='apply-cancellation')
    def apply_cancellation(self, request, pk=None):
        serializer = OTAReservationReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation_import = self.get_object()
        try:
            apply_reservation_cancellation(reservation_import, user=request.user, notes=serializer.validated_data.get('notes', ''))
        except OTASyncError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        reservation_import.refresh_from_db()
        return Response(self.get_serializer(reservation_import).data)
