from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create or update a platform Super Admin account'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='Super Admin email')
        parser.add_argument('--password', required=True, help='Super Admin password')
        parser.add_argument('--full-name', default='Platform Super Admin', help='Super Admin full name')

    def handle(self, *args, **options):
        UserModel = get_user_model()
        user, created = UserModel.objects.get_or_create(
            email=UserModel.objects.normalize_email(options['email']),
            defaults={
                'full_name': options['full_name'],
                'is_staff': True,
                'is_superuser': True,
                'is_platform_admin': True,
                'is_active': True,
            },
        )

        user.full_name = options['full_name']
        user.is_staff = True
        user.is_superuser = True
        user.is_platform_admin = True
        user.is_active = True
        user.set_password(options['password'])
        user.save()

        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{action} platform Super Admin: {user.email}'))
