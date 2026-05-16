from rest_framework.routers import DefaultRouter
from bookings.views import (
    BookingViewSet,
    GuestCommunicationViewSet,
    GuestFolioViewSet,
    GuestPointsViewSet,
    GuestViewSet,
    LoyaltyProgramViewSet,
    PackageViewSet,
    RatePlanViewSet,
    RoomTypeViewSet,
    RoomViewSet,
)

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
router.register(r'guest-communications', GuestCommunicationViewSet)

urlpatterns = router.urls
