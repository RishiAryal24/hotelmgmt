from rest_framework.routers import DefaultRouter

from accounting.views import AccountViewSet, JournalEntryViewSet

router = DefaultRouter()
router.register(r'accounts', AccountViewSet)
router.register(r'journal-entries', JournalEntryViewSet)

urlpatterns = router.urls

