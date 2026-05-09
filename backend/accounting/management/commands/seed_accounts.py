from django.core.management.base import BaseCommand

from accounting.services import seed_default_accounts


class Command(BaseCommand):
    help = 'Seed default chart of accounts in the current schema'

    def handle(self, *args, **options):
        seed_default_accounts()
        self.stdout.write(self.style.SUCCESS('Default chart of accounts seeded.'))
