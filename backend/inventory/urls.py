from rest_framework.routers import DefaultRouter

from inventory.views import InventoryItemViewSet, PurchaseOrderViewSet, StockMovementViewSet, VendorViewSet

router = DefaultRouter()
router.register(r'vendors', VendorViewSet)
router.register(r'items', InventoryItemViewSet)
router.register(r'movements', StockMovementViewSet)
router.register(r'purchase-orders', PurchaseOrderViewSet)

urlpatterns = router.urls
