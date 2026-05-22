from rest_framework.routers import DefaultRouter

from notifications.views import NotificationEventViewSet, NotificationTemplateViewSet

router = DefaultRouter()
router.register(r'events', NotificationEventViewSet)
router.register(r'templates', NotificationTemplateViewSet)

urlpatterns = router.urls
