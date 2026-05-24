from rest_framework.routers import DefaultRouter

from accounting.views import AccountViewSet, FiscalPeriodViewSet, JournalEntryViewSet, NightAuditRunViewSet, TaxRateViewSet, VendorBillViewSet

router = DefaultRouter()
router.register(r'accounts', AccountViewSet)
router.register(r'tax-rates', TaxRateViewSet)
router.register(r'vendor-bills', VendorBillViewSet)
router.register(r'journal-entries', JournalEntryViewSet)
router.register(r'fiscal-periods', FiscalPeriodViewSet)
router.register(r'night-audits', NightAuditRunViewSet)

urlpatterns = router.urls
