from rest_framework.routers import DefaultRouter

from maintenance.views import MaintenanceTicketViewSet

router = DefaultRouter()
router.register(r'tickets', MaintenanceTicketViewSet)

urlpatterns = router.urls
