from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('restaurant', '0014_restaurantorder_receipt_issued_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='cashiershift',
            name='actual_card',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='cashiershift',
            name='actual_wallet',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='cashiershift',
            name='actual_bank_transfer',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='cashiershift',
            name='actual_room_posting',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='cashiershift',
            name='card_variance',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='cashiershift',
            name='wallet_variance',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='cashiershift',
            name='bank_transfer_variance',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='cashiershift',
            name='room_posting_variance',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='cashiershift',
            name='total_variance',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
