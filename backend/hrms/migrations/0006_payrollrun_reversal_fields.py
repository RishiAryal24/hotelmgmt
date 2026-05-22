from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0001_initial'),
        ('hrms', '0005_alter_payrollrun_period_alter_payrollrun_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='payrollrun',
            name='payment_reversal_journal_entry',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payroll_payment_reversal_runs', to='accounting.journalentry'),
        ),
        migrations.AddField(
            model_name='payrollrun',
            name='reversal_journal_entry',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payroll_reversal_runs', to='accounting.journalentry'),
        ),
        migrations.AddField(
            model_name='payrollrun',
            name='reversal_reason',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='payrollrun',
            name='reversed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='payrollrun',
            name='status',
            field=models.CharField(choices=[('draft', 'Draft'), ('approved', 'Approved'), ('posted', 'Posted'), ('paid', 'Paid'), ('canceled', 'Canceled'), ('reversed', 'Reversed')], default='draft', max_length=20),
        ),
    ]
