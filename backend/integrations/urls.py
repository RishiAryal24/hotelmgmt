from django.urls import path, include
from rest_framework.routers import DefaultRouter
from integrations import views

router = DefaultRouter()
router.register(r'ota-channels', views.OTAChannelViewSet)

urlpatterns = [
    path('', include(router.urls)),
]