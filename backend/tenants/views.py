from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from tenants.models import Tenant
from tenants.serializers import TenantCreateSerializer, TenantSerializer, TenantSettingsSerializer
from users.permissions import IsPlatformAdmin


class TenantListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request, *args, **kwargs):
        tenants = Tenant.objects.all().order_by('name')
        return Response(TenantSerializer(tenants, many=True).data)

    def post(self, request, *args, **kwargs):
        serializer = TenantCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        tenant = serializer.save()
        output = TenantSerializer(tenant).data
        return Response(output, status=status.HTTP_201_CREATED)


class CurrentTenantSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get_tenant(self, request):
        if getattr(request.user, 'is_platform_admin', False):
            return getattr(request, 'tenant', None)
        return request.user.tenant

    def get(self, request, *args, **kwargs):
        tenant = self.get_tenant(request)
        serializer = TenantSettingsSerializer(tenant)
        return Response(serializer.data)

    def patch(self, request, *args, **kwargs):
        tenant = self.get_tenant(request)
        serializer = TenantSettingsSerializer(tenant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
