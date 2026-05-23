from rest_framework.routers import DefaultRouter

from accounting.views import AccountViewSet, FiscalPeriodViewSet, JournalEntryViewSet

router = DefaultRouter()
router.register(r'accounts', AccountViewSet)
router.register(r'journal-entries', JournalEntryViewSet)
router.register(r'fiscal-periods', FiscalPeriodViewSet)

urlpatterns = router.urls
