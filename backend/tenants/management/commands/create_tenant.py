from django.core.management.base import BaseCommand

from tenants.services import create_tenant_workspace


class Command(BaseCommand):
    help = 'Create a new tenant workspace with default schema and hotel admin'

    def add_arguments(self, parser):
        parser.add_argument('--name', required=True, help='Tenant name')
        parser.add_argument('--domain', required=True, help='Tenant domain name')
        parser.add_argument('--email', required=True, help='Hotel admin email')
        parser.add_argument('--password', required=True, help='Hotel admin password')
        parser.add_argument('--currency', default='NPR', help='Tenant currency code')

    def handle(self, *args, **options):
        tenant = create_tenant_workspace(
            name=options['name'],
            domain_name=options['domain'],
            admin_email=options['email'],
            admin_password=options['password'],
            currency=options['currency'],
            created_by='management-command',
        )
        self.stdout.write(self.style.SUCCESS(f'Tenant created: {tenant.name}'))
