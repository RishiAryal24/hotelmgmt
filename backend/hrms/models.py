from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import UUIDModel


class Employee(UUIDModel):
    EMPLOYMENT_TYPE_CHOICES = [
        ('full_time', 'Full Time'),
        ('part_time', 'Part Time'),
        ('contract', 'Contract'),
        ('intern', 'Intern'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('on_leave', 'On Leave'),
        ('inactive', 'Inactive'),
        ('terminated', 'Terminated'),
    ]

    employee_id = models.CharField(max_length=40, unique=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='employee_profile',
        null=True,
        blank=True,
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    department = models.CharField(max_length=80)
    designation = models.CharField(max_length=100)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='full_time')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    hire_date = models.DateField()
    salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    address = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['department', 'last_name', 'first_name']

    def __str__(self):
        return f'{self.employee_id} - {self.first_name} {self.last_name}'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


class Shift(UUIDModel):
    name = models.CharField(max_length=100, unique=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    break_minutes = models.PositiveIntegerField(default=0)
    grace_minutes = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['start_time', 'name']

    def __str__(self):
        return self.name


class Attendance(UUIDModel):
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('present', 'Present'),
        ('late', 'Late'),
        ('absent', 'Absent'),
        ('half_day', 'Half Day'),
        ('on_leave', 'On Leave'),
    ]

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance_records')
    shift = models.ForeignKey(Shift, on_delete=models.SET_NULL, related_name='attendance_records', null=True, blank=True)
    attendance_date = models.DateField(default=timezone.localdate)
    clock_in = models.DateTimeField(null=True, blank=True)
    clock_out = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-attendance_date', 'employee__department', 'employee__last_name']
        constraints = [
            models.UniqueConstraint(fields=['employee', 'attendance_date'], name='unique_employee_attendance_date'),
        ]

    def __str__(self):
        return f'{self.employee.full_name} - {self.attendance_date}'

    @property
    def hours_worked(self):
        if not self.clock_in or not self.clock_out:
            return '0.00'
        seconds = max((self.clock_out - self.clock_in).total_seconds(), 0)
        return f'{seconds / 3600:.2f}'

    def mark_clock_in(self, when=None):
        when = when or timezone.now()
        self.clock_in = self.clock_in or when
        self.status = 'present'
        if self.shift:
            shift_start = timezone.make_aware(
                timezone.datetime.combine(self.attendance_date, self.shift.start_time),
                timezone.get_current_timezone(),
            )
            late_after = shift_start + timezone.timedelta(minutes=self.shift.grace_minutes)
            if self.clock_in > late_after:
                self.status = 'late'
        self.save(update_fields=['clock_in', 'status', 'updated_at'])

    def mark_clock_out(self, when=None):
        self.clock_out = when or timezone.now()
        self.save(update_fields=['clock_out', 'updated_at'])


class PayrollPeriod(UUIDModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('generated', 'Generated'),
        ('closed', 'Closed'),
    ]

    name = models.CharField(max_length=100, unique=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return self.name


class PayrollRun(UUIDModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('approved', 'Approved'),
        ('posted', 'Posted'),
        ('paid', 'Paid'),
        ('canceled', 'Canceled'),
    ]

    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank Transfer'),
        ('cheque', 'Cheque'),
    ]

    period = models.ForeignKey(PayrollPeriod, on_delete=models.CASCADE, related_name='payroll_runs')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    generated_at = models.DateTimeField(default=timezone.now)
    approved_at = models.DateTimeField(null=True, blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    journal_entry = models.ForeignKey(
        'accounting.JournalEntry',
        on_delete=models.SET_NULL,
        related_name='payroll_runs',
        null=True,
        blank=True,
    )
    payment_journal_entry = models.ForeignKey(
        'accounting.JournalEntry',
        on_delete=models.SET_NULL,
        related_name='payroll_payment_runs',
        null=True,
        blank=True,
    )
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-period__start_date', '-generated_at']

    @property
    def total_gross_pay(self):
        return sum((line.gross_pay for line in self.lines.all()), Decimal('0.00'))

    @property
    def total_deductions(self):
        return sum((line.deductions for line in self.lines.all()), Decimal('0.00'))

    @property
    def total_net_pay(self):
        return sum((line.net_pay for line in self.lines.all()), Decimal('0.00'))

    def __str__(self):
        return f'Payroll {self.period.name}'


class PayrollLine(UUIDModel):
    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='lines')
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name='payroll_lines')
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payable_days = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    present_days = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    leave_days = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    absent_days = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    gross_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    allowances = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    overtime_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    attendance_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['employee__department', 'employee__last_name', 'employee__first_name']
        constraints = [
            models.UniqueConstraint(fields=['payroll_run', 'employee'], name='unique_employee_payroll_line'),
        ]

    def __str__(self):
        return f'{self.employee.full_name} - {self.payroll_run.period.name}'
