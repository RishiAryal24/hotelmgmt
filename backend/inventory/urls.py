from rest_framework.routers import DefaultRouter

from inventory.views import InventoryItemViewSet, StockMovementViewSet, VendorViewSet

router = DefaultRouter()
router.register(r'vendors', VendorViewSet)
router.register(r'items', InventoryItemViewSet)
router.register(r'movements', StockMovementViewSet)

urlpatterns = router.urls
