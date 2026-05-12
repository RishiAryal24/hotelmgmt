from rest_framework import exceptions, generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from users.models import Permission, PlatformUser, Role
from users.permissions import HasActionPermission
from users.serializers import PermissionSerializer, RoleSerializer, StaffUserCreateSerializer, UserSerializer


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response(UserSerializer(request.user).data)


class PlatformUserListView(generics.ListCreateAPIView):
    queryset = PlatformUser.objects.all()
    permission_classes = [permissions.IsAuthenticated, HasActionPermission]
    permission_map = {
        'get': 'users.staff.read',
        'post': 'users.staff.create',
    }

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StaffUserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'is_platform_admin', False):
            return PlatformUser.objects.all()
        return PlatformUser.objects.filter(tenant=user.tenant)

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, 'is_platform_admin', False):
            serializer.save()
            return
        roles = serializer.validated_data.get('roles', [])
        invalid_roles = [role for role in roles if role.tenant_id != user.tenant_id]
        if invalid_roles:
            raise exceptions.PermissionDenied('Cannot assign roles outside this tenant.')
        serializer.save(
            tenant=user.tenant,
            is_platform_admin=False,
            is_staff=False,
        )


class PlatformUserDetailView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, HasActionPermission]
    permission_map = {
        'get': 'users.staff.read',
    }

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'is_platform_admin', False):
            return PlatformUser.objects.all()
        return PlatformUser.objects.filter(tenant=user.tenant)


class PlatformTokenObtainPairView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]


class PermissionListView(generics.ListAPIView):
    queryset = Permission.objects.all().order_by('module', 'name')
    serializer_class = PermissionSerializer
    permission_classes = [permissions.IsAuthenticated, HasActionPermission]
    permission_map = {
        'get': 'users.staff.read',
    }


class RoleListCreateView(generics.ListCreateAPIView):
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated, HasActionPermission]
    permission_map = {
        'get': 'users.staff.read',
        'post': 'users.staff.create',
    }

    def get_queryset(self):
        user = self.request.user
        queryset = Role.objects.prefetch_related('permissions').order_by('name')
        if getattr(user, 'is_platform_admin', False):
            return queryset
        return queryset.filter(tenant=user.tenant)

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, 'is_platform_admin', False):
            serializer.save()
            return
        serializer.save(tenant=user.tenant, is_system=False)
