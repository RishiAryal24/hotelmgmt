from datetime import datetime
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand
from django.utils import timezone
from django_tenants.utils import schema_context

from accounting.models import NightAuditRun
from accounting.services import get_night_audit_schedule, run_night_audit
from tenants.models import Tenant


class Command(BaseCommand):
    help = 'Run enabled tenant night audits whose scheduled local time has passed.'

    def handle(self, *args, **options):
        for tenant in Tenant.objects.exclude(schema_name='public'):
            with schema_context(tenant.schema_name):
                schedule = get_night_audit_schedule()
                if not schedule.enabled:
                    continue
                local_now = timezone.now().astimezone(ZoneInfo(schedule.timezone))
                scheduled_at = datetime.combine(local_now.date(), schedule.run_time, tzinfo=ZoneInfo(schedule.timezone))
                audit_date = local_now.date()
                if local_now < scheduled_at:
                    continue
                if NightAuditRun.objects.filter(audit_date=audit_date).exclude(status='failed').exists():
                    continue
                run = run_night_audit(audit_date=audit_date)
                self.stdout.write(
                    self.style.SUCCESS(
                        f'{tenant.schema_name}: night audit {run.status} for {audit_date}'
                    )
                )
