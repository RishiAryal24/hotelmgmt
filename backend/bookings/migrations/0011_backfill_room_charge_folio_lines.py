from django.db import migrations


def backfill_room_charge_lines(apps, schema_editor):
    GuestFolio = apps.get_model('bookings', 'GuestFolio')
    GuestFolioLine = apps.get_model('bookings', 'GuestFolioLine')

    folios = GuestFolio.objects.select_related('booking', 'booking__room').all()
    for folio in folios:
        booking = folio.booking
        GuestFolioLine.objects.get_or_create(
            folio=folio,
            source_module='room_charge',
            source_id=str(booking.id),
            defaults={
                'description': f'Room charge - Room {booking.room.room_number} ({booking.check_in_date} to {booking.check_out_date})',
                'amount': booking.total_amount,
            },
        )


def remove_room_charge_lines(apps, schema_editor):
    GuestFolioLine = apps.get_model('bookings', 'GuestFolioLine')
    GuestFolioLine.objects.filter(source_module='room_charge').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('bookings', '0010_facilityamenity_alter_facilityservice_options_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_room_charge_lines, remove_room_charge_lines),
    ]
