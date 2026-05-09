from rest_framework.routers import DefaultRouter

from housekeeping.views import HousekeepingTaskViewSet

router = DefaultRouter()
router.register(r'tasks', HousekeepingTaskViewSet)

urlpatterns = router.urls
