from django.conf import settings
from django.db import models

from bookings.models import Room
from core.models import UUIDModel


class HousekeepingTask(UUIDModel):
    TASK_TYPE_CHOICES = [
        ('checkout_clean', 'Checkout Clean'),
        ('stayover_clean', 'Stayover Clean'),
        ('deep_clean', 'Deep Clean'),
        ('inspection', 'Inspection'),
        ('maintenance_escalation', 'Maintenance Escalation'),
    ]

    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('done', 'Done'),
        ('blocked', 'Blocked'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='housekeeping_tasks')
    task_type = models.CharField(max_length=40, choices=TASK_TYPE_CHOICES, default='checkout_clean')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='housekeeping_tasks',
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['status', '-priority', 'room__room_number']

    def __str__(self):
        return f'{self.get_task_type_display()} - Room {self.room.room_number}'

