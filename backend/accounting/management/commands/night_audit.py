from datetime import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounting.services import run_night_audit


class Command(BaseCommand):
    help = 'Run night audit to post pending charges and reconcile folios'

    def add_arguments(self, parser):
        parser.add_argument('--date', help='Audit date in YYYY-MM-DD format. Defaults to today.')

    def handle(self, *args, **options):
        audit_date = datetime.strptime(options['date'], '%Y-%m-%d').date() if options.get('date') else timezone.localdate()
        self.stdout.write(f'Starting night audit for {audit_date}')
        run = run_night_audit(audit_date=audit_date)
        self.stdout.write(
            self.style.SUCCESS(
                f'Night audit {run.status}: {run.checked_in_bookings} checked-in bookings, '
                f'{run.room_charge_lines_created} room charge lines created, {len(run.exceptions)} exceptions.'
            )
        )
