from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ('restaurant', '0011_menurecipeingredient'),
    ]

    operations = [
        migrations.AlterField(
            model_name='restaurantorder',
            name='payment_method',
            field=models.CharField(blank=True, choices=[('cash', 'Cash'), ('card', 'Card'), ('wallet', 'Wallet'), ('room_posting', 'Room Posting'), ('bank_transfer', 'Bank Transfer'), ('split', 'Split Payment')], max_length=30),
        ),
        migrations.CreateModel(
            name='RestaurantOrderPayment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('payment_method', models.CharField(choices=[('cash', 'Cash'), ('card', 'Card'), ('wallet', 'Wallet'), ('room_posting', 'Room Posting'), ('bank_transfer', 'Bank Transfer'), ('split', 'Split Payment')], max_length=30)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('paid_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('cashier_shift', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='restaurant_order_payments', to='restaurant.cashiershift')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payments', to='restaurant.restaurantorder')),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
