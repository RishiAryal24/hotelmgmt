from django.contrib.auth import get_user_model

from tenants.models import Domain, Tenant
from users.rbac import seed_default_roles


def create_tenant_workspace(
    name: str,
    domain_name: str,
    admin_email: str,
    admin_password: str,
    created_by: str = 'superadmin',
    currency: str = 'NPR',
) -> Tenant:
    tenant = Tenant(name=name, created_by=created_by, currency=currency)
    tenant.save()
    Domain.objects.create(tenant=tenant, domain=domain_name, is_primary=True)
    roles = seed_default_roles(tenant)

    UserModel = get_user_model()
    admin_user = UserModel.objects.create_superuser(
        email=admin_email,
        password=admin_password,
        full_name=f'{name} Admin',
        is_platform_admin=False,
        is_tenant_admin=True,
        is_staff=True,
        is_superuser=True,
        tenant=tenant,
    )
    admin_user.roles.add(roles['hotel_admin'])

    return tenant
