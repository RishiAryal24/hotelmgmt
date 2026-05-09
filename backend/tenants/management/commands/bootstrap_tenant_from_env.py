import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from tenants.models import Domain, Tenant
from tenants.services import create_tenant_workspace
from users.rbac import seed_default_roles


class Command(BaseCommand):
    help = 'Create or update a tenant workspace from BOOTSTRAP_TENANT_* environment variables'

    def handle(self, *args, **options):
        name = os.environ.get('BOOTSTRAP_TENANT_NAME')
        domain = os.environ.get('BOOTSTRAP_TENANT_DOMAIN')
        email = os.environ.get('BOOTSTRAP_TENANT_ADMIN_EMAIL')
        password = os.environ.get('BOOTSTRAP_TENANT_ADMIN_PASSWORD')
        currency = os.environ.get('BOOTSTRAP_TENANT_CURRENCY', 'NPR')

        if not all([name, domain, email, password]):
            self.stdout.write('Tenant bootstrap skipped; BOOTSTRAP_TENANT_* variables are not fully set.')
            return

        existing_domain = Domain.objects.filter(domain=domain).select_related('tenant').first()
        tenant = existing_domain.tenant if existing_domain else Tenant.objects.filter(name=name).first()

        if tenant is None:
            tenant = create_tenant_workspace(
                name=name,
                domain_name=domain,
                admin_email=email,
                admin_password=password,
                currency=currency,
                created_by='render-bootstrap',
            )
            self.stdout.write(self.style.SUCCESS(f'Created tenant: {tenant.name}'))
            return

        tenant.name = name
        tenant.currency = currency
        tenant.on_trial = False
        tenant.save()

        Domain.objects.update_or_create(
            domain=domain,
            defaults={'tenant': tenant, 'is_primary': True},
        )

        roles = seed_default_roles(tenant)
        UserModel = get_user_model()
        user, created = UserModel.objects.get_or_create(
            email=UserModel.objects.normalize_email(email),
            defaults={
                'full_name': f'{name} Admin',
                'tenant': tenant,
                'is_platform_admin': False,
                'is_tenant_admin': True,
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
            },
        )
        user.full_name = f'{name} Admin'
        user.tenant = tenant
        user.is_platform_admin = False
        user.is_tenant_admin = True
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()
        user.roles.add(roles['hotel_admin'])

        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{action} tenant admin: {user.email}'))
