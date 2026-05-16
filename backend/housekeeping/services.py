from django.utils import timezone

from housekeeping.models import HousekeepingTask


def create_checkout_cleaning_task(booking):
    task = HousekeepingTask.objects.filter(
        room=booking.room,
        status='open',
        task_type='checkout_clean',
    ).order_by('created_at').first()
    created = task is None
    if created:
        task = HousekeepingTask.objects.create(
            room=booking.room,
            status='open',
            task_type='checkout_clean',
            priority='normal',
            notes=f'Checkout cleaning for booking {booking.id}',
        )
    if booking.room.status != 'cleaning':
        booking.room.status = 'cleaning'
        booking.room.save(update_fields=['status', 'updated_at'])
    return task, created


def complete_housekeeping_task(task):
    task.status = 'done'
    task.completed_at = timezone.now()
    task.save(update_fields=['status', 'completed_at', 'updated_at'])

    active_room_tasks = HousekeepingTask.objects.filter(
        room=task.room,
        status__in=['open', 'in_progress', 'blocked'],
    ).exclude(pk=task.pk)
    if not active_room_tasks.exists():
        task.room.status = 'available'
        task.room.save(update_fields=['status', 'updated_at'])

    return task
