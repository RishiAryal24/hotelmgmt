from django.core.management.base import BaseCommand

from tenants.models import Domain, Tenant


class Command(BaseCommand):
    help = 'Create or update the public tenant and localhost domain for development'

    def add_arguments(self, parser):
        parser.add_argument('--name', default='Public Platform', help='Public tenant display name')
        parser.add_argument('--domain', default='localhost', help='Primary local development domain')

    def handle(self, *args, **options):
        tenant, _ = Tenant.objects.get_or_create(
            schema_name='public',
            defaults={
                'name': options['name'],
                'created_by': 'bootstrap',
                'on_trial': False,
            },
        )

        tenant.name = options['name']
        tenant.on_trial = False
        tenant.save()

        Domain.objects.update_or_create(
            domain=options['domain'],
            defaults={
                'tenant': tenant,
                'is_primary': True,
            },
        )

        Domain.objects.update_or_create(
            domain='127.0.0.1',
            defaults={
                'tenant': tenant,
                'is_primary': False,
            },
        )

        self.stdout.write(self.style.SUCCESS('Public tenant and local domains are ready.'))
