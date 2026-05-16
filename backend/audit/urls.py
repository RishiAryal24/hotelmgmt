from rest_framework.routers import DefaultRouter

from audit.views import AuditLogViewSet

router = DefaultRouter()
router.register(r'logs', AuditLogViewSet)

urlpatterns = router.urls
