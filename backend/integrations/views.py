from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.utils import timezone
from integrations.models import OTAChannel
from integrations.serializers import OTAChannelSerializer


class OTAChannelViewSet(viewsets.ModelViewSet):
    queryset = OTAChannel.objects.all()
    serializer_class = OTAChannelSerializer
    permission_classes = []  # Add proper permissions later

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def webhook(self, request, pk=None):
        channel = self.get_object()
        # Basic webhook handler - validate and process OTA updates
        data = request.data
        # Process availability/rate updates from OTA
        # This is a placeholder for actual OTA webhook logic
        channel.last_sync = timezone.now()
        channel.save()
        return Response({'status': 'Webhook processed'}, status=status.HTTP_200_OK)


class OTAChannelViewSet(viewsets.ModelViewSet):
    queryset = OTAChannel.objects.all()
    permission_classes = []  # Add proper permissions later

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def webhook(self, request, pk=None):
        channel = self.get_object()
        # Basic webhook handler - validate and process OTA updates
        data = request.data
        # Process availability/rate updates from OTA
        # This is a placeholder for actual OTA webhook logic
        channel.last_sync = timezone.now()
        channel.save()
        return Response({'status': 'Webhook processed'}, status=status.HTTP_200_OK)
