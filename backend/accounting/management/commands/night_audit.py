from django.core.management.base import BaseCommand
from django.utils import timezone
from accounting.models import JournalEntry, JournalLine
from bookings.models import Booking, GuestFolio
from decimal import Decimal


class Command(BaseCommand):
    help = 'Run night audit to post pending charges and reconcile folios'

    def handle(self, *args, **options):
        today = timezone.now().date()

        self.stdout.write(f'Starting night audit for {today}')

        # Post pending room charges for checked-in guests
        pending_bookings = Booking.objects.filter(status='checked_in')
        for booking in pending_bookings:
            # Assuming daily room charge posting
            # This is a simplified example
            folio, created = GuestFolio.objects.get_or_create(
                booking=booking,
                status='open',
                defaults={'subtotal': Decimal('0.00')}
            )
            # Add room charge for today
            room_charge = booking.room.price_per_night
            JournalLine.objects.create(
                journal_entry=JournalEntry.objects.create(
                    date=today,
                    description=f'Room charge for booking {booking.id}',
                    source_module='bookings',
                    source_id=booking.id,
                ),
                account_id=1,  # Assuming revenue account
                debit=Decimal('0.00'),
                credit=room_charge,
            )
            folio.subtotal += room_charge
            folio.save()

        self.stdout.write('Night audit completed successfully')