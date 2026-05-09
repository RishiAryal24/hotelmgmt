from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from users.views import (
    CurrentUserView,
    PermissionListView,
    PlatformTokenObtainPairView,
    PlatformUserDetailView,
    PlatformUserListView,
    RoleListCreateView,
)

urlpatterns = [
    path('login/', PlatformTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', CurrentUserView.as_view(), name='current-user'),
    path('users/', PlatformUserListView.as_view(), name='platform-user-list'),
    path('users/<uuid:pk>/', PlatformUserDetailView.as_view(), name='platform-user-detail'),
    path('roles/', RoleListCreateView.as_view(), name='role-list-create'),
    path('permissions/', PermissionListView.as_view(), name='permission-list'),
]
