from rest_framework.routers import DefaultRouter

from payments.views import PaymentIntentViewSet

router = DefaultRouter()
router.register(r'intents', PaymentIntentViewSet)

urlpatterns = router.urls
