from rest_framework.routers import DefaultRouter
from bookings.views import RoomViewSet, RoomTypeViewSet, GuestViewSet, BookingViewSet, GuestFolioViewSet

router = DefaultRouter()
router.register(r'room-types', RoomTypeViewSet)
router.register(r'rooms', RoomViewSet)
router.register(r'guests', GuestViewSet)
router.register(r'bookings', BookingViewSet)
router.register(r'folios', GuestFolioViewSet)

urlpatterns = router.urls
