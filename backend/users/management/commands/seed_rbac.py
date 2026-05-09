from django.core.management.base import BaseCommand

from tenants.models import Tenant
from users.rbac import seed_default_permissions, seed_default_roles


class Command(BaseCommand):
    help = 'Seed default RBAC permissions and roles for all tenants'

    def handle(self, *args, **options):
        seed_default_permissions()
        tenants = Tenant.objects.exclude(schema_name='public')

        for tenant in tenants:
            seed_default_roles(tenant)
            self.stdout.write(f'Seeded RBAC roles for {tenant.name}')

        self.stdout.write(self.style.SUCCESS('RBAC defaults are ready.'))
