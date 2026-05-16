from rest_framework.routers import DefaultRouter
from bookings.views import RoomViewSet, RoomTypeViewSet, GuestViewSet, BookingViewSet, GuestFolioViewSet, RatePlanViewSet, PackageViewSet, LoyaltyProgramViewSet, GuestPointsViewSet

router = DefaultRouter()
router.register(r'room-types', RoomTypeViewSet)
router.register(r'rooms', RoomViewSet)
router.register(r'guests', GuestViewSet)
router.register(r'bookings', BookingViewSet)
router.register(r'folios', GuestFolioViewSet)
router.register(r'rate-plans', RatePlanViewSet)
router.register(r'packages', PackageViewSet)
router.register(r'loyalty-programs', LoyaltyProgramViewSet)
router.register(r'guest-points', GuestPointsViewSet)

urlpatterns = router.urls
