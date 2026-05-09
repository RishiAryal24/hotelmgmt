from rest_framework import serializers

from users.models import PlatformUser, Permission, Role


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'name', 'code', 'module', 'description']


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    permission_ids = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(),
        many=True,
        write_only=True,
        required=False,
        source='permissions',
    )

    class Meta:
        model = Role
        fields = ['id', 'name', 'code', 'tenant', 'description', 'is_system', 'permissions', 'permission_ids']
        read_only_fields = ['id', 'tenant', 'is_system']


class UserSerializer(serializers.ModelSerializer):
    roles = RoleSerializer(many=True, read_only=True)
    tenant_domain = serializers.SerializerMethodField()

    class Meta:
        model = PlatformUser
        fields = [
            'id',
            'email',
            'full_name',
            'tenant',
            'tenant_domain',
            'is_active',
            'is_staff',
            'is_platform_admin',
            'is_tenant_admin',
            'roles',
        ]

    def get_tenant_domain(self, obj):
        if not obj.tenant_id:
            return None
        domain = obj.tenant.domains.filter(is_primary=True).first()
        return domain.domain if domain else None


class StaffUserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(min_length=12, write_only=True)
    role_ids = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(),
        many=True,
        write_only=True,
        required=False,
        source='roles',
    )

    class Meta:
        model = PlatformUser
        fields = ['id', 'email', 'full_name', 'password', 'tenant', 'is_active', 'is_staff', 'is_tenant_admin', 'role_ids']
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password')
        roles = validated_data.pop('roles', [])
        user = PlatformUser.objects.create_user(password=password, **validated_data)
        user.roles.set(roles)
        return user
