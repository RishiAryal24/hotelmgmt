from django.urls import path, include
from rest_framework.routers import DefaultRouter
from integrations import views

router = DefaultRouter()
router.register(r'ota-channels', views.OTAChannelViewSet)
router.register(r'ota-room-mappings', views.OTAChannelRoomTypeMappingViewSet)
router.register(r'ota-rate-mappings', views.OTAChannelRatePlanMappingViewSet)
router.register(r'ota-sync-jobs', views.OTASyncJobViewSet)
router.register(r'ota-webhook-events', views.OTAWebhookEventViewSet)
router.register(r'ota-reservation-imports', views.OTAReservationImportViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
