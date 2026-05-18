from rest_framework.routers import DefaultRouter

from restaurant.views import CashierCounterViewSet, CashierShiftViewSet, KitchenTicketViewSet, MenuCategoryViewSet, MenuItemViewSet, RestaurantOrderViewSet, RestaurantTableViewSet

router = DefaultRouter()
router.register(r'categories', MenuCategoryViewSet)
router.register(r'items', MenuItemViewSet)
router.register(r'tables', RestaurantTableViewSet)
router.register(r'orders', RestaurantOrderViewSet)
router.register(r'kitchen-tickets', KitchenTicketViewSet)
router.register(r'cashier-counters', CashierCounterViewSet)
router.register(r'cashier-shifts', CashierShiftViewSet)

urlpatterns = router.urls
