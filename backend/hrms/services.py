from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from accounting.services import post_journal_entry, seed_default_accounts
from hrms.models import Attendance, Employee, PayrollLine, PayrollPeriod, PayrollRun


MONEY = Decimal('0.01')
DAY = Decimal('1.00')
HALF_DAY = Decimal('0.50')


def _money(value):
    return Decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)


def _period_days(period: PayrollPeriod):
    return Decimal((period.end_date - period.start_date).days + 1)


def _attendance_totals(employee, period):
    totals = {
        'present_days': Decimal('0.00'),
        'leave_days': Decimal('0.00'),
        'absent_days': Decimal('0.00'),
    }
    records = Attendance.objects.filter(
        employee=employee,
        attendance_date__gte=period.start_date,
        attendance_date__lte=period.end_date,
    )
    for record in records:
        if record.status in ['present', 'late']:
            totals['present_days'] += DAY
        elif record.status == 'half_day':
            totals['present_days'] += HALF_DAY
            totals['absent_days'] += HALF_DAY
        elif record.status == 'on_leave':
            totals['leave_days'] += DAY
        elif record.status == 'absent':
            totals['absent_days'] += DAY
    return totals


@transaction.atomic
def generate_payroll_run(period: PayrollPeriod):
    if period.end_date < period.start_date:
        raise ValueError('Payroll period end date cannot be before start date.')

    payroll_run = PayrollRun.objects.filter(period=period).exclude(status__in=['canceled', 'reversed']).order_by('-generated_at').first()
    created = payroll_run is None
    if created:
        payroll_run = PayrollRun.objects.create(period=period)
    if payroll_run.status in ['posted', 'paid']:
        raise ValueError('Posted payroll runs cannot be regenerated.')
    if not created:
        payroll_run.lines.all().delete()
        payroll_run.status = 'draft'
        payroll_run.generated_at = timezone.now()
        payroll_run.approved_at = None
        payroll_run.posted_at = None
        payroll_run.paid_at = None
        payroll_run.journal_entry = None
        payroll_run.payment_journal_entry = None
        payroll_run.payment_method = ''
        payroll_run.payment_reference = ''
        payroll_run.save(
            update_fields=[
                'status',
                'generated_at',
                'approved_at',
                'posted_at',
                'paid_at',
                'journal_entry',
                'payment_journal_entry',
                'payment_method',
                'payment_reference',
                'updated_at',
            ],
        )

    period_days = _period_days(period)
    employees = Employee.objects.filter(status='active').order_by('department', 'last_name', 'first_name')
    for employee in employees:
        totals = _attendance_totals(employee, period)
        payable_days = totals['present_days'] + totals['leave_days']
        gross_pay = _money((employee.salary / period_days) * payable_days) if period_days else Decimal('0.00')
        attendance_deduction = _money(employee.salary - gross_pay)
        deductions = attendance_deduction
        PayrollLine.objects.create(
            payroll_run=payroll_run,
            employee=employee,
            base_salary=employee.salary,
            payable_days=payable_days,
            present_days=totals['present_days'],
            leave_days=totals['leave_days'],
            absent_days=totals['absent_days'],
            gross_pay=gross_pay,
            attendance_deduction=attendance_deduction,
            deductions=deductions,
            net_pay=gross_pay,
        )

    period.status = 'generated'
    period.save(update_fields=['status', 'updated_at'])
    return payroll_run


@transaction.atomic
def cancel_payroll_run(payroll_run: PayrollRun):
    if payroll_run.status in ['posted', 'paid']:
        raise ValueError('Posted or paid payroll runs cannot be canceled.')

    period = payroll_run.period
    payroll_run.delete()

    has_active_run = PayrollRun.objects.filter(period=period).exclude(status='canceled').exists()
    if not has_active_run:
        period.status = 'draft'
        period.save(update_fields=['status', 'updated_at'])

    return period


@transaction.atomic
def approve_payroll_run(payroll_run: PayrollRun):
    if payroll_run.status == 'canceled':
        raise ValueError('Canceled payroll runs cannot be approved.')
    if payroll_run.status == 'reversed':
        raise ValueError('Reversed payroll runs cannot be approved.')
    if payroll_run.status in ['posted', 'paid']:
        raise ValueError('Posted payroll runs are already finalized.')
    payroll_run.status = 'approved'
    payroll_run.approved_at = timezone.now()
    payroll_run.save(update_fields=['status', 'approved_at', 'updated_at'])
    return payroll_run


@transaction.atomic
def post_payroll_run(payroll_run: PayrollRun, posted_by=None):
    if payroll_run.status == 'canceled':
        raise ValueError('Canceled payroll runs cannot be posted.')
    if payroll_run.status == 'reversed':
        raise ValueError('Reversed payroll runs cannot be posted.')
    if payroll_run.status in ['posted', 'paid']:
        return payroll_run.journal_entry
    if not payroll_run.lines.exists():
        raise ValueError('Payroll run has no lines to post.')

    seed_default_accounts()
    net_pay = payroll_run.total_net_pay
    journal_entry = post_journal_entry(
        description=f'Payroll payable for {payroll_run.period.name}',
        source_module='payroll_run',
        source_id=str(payroll_run.id),
        posted_by=posted_by,
        lines=[
            {
                'account': '5100',
                'description': f'Salary expense for {payroll_run.period.name}',
                'debit': net_pay,
                'credit': 0,
            },
            {
                'account': '2200',
                'description': f'Payroll payable for {payroll_run.period.name}',
                'debit': 0,
                'credit': net_pay,
            },
        ],
    )
    payroll_run.status = 'posted'
    payroll_run.posted_at = timezone.now()
    payroll_run.journal_entry = journal_entry
    payroll_run.save(update_fields=['status', 'posted_at', 'journal_entry', 'updated_at'])
    payroll_run.period.status = 'closed'
    payroll_run.period.save(update_fields=['status', 'updated_at'])
    return journal_entry


@transaction.atomic
def settle_payroll_run(payroll_run: PayrollRun, payment_method='bank_transfer', payment_reference='', posted_by=None):
    if payroll_run.status == 'paid':
        return payroll_run.payment_journal_entry
    if payroll_run.status == 'reversed':
        raise ValueError('Reversed payroll runs cannot be settled.')
    if payroll_run.status != 'posted':
        raise ValueError('Only posted payroll runs can be settled.')
    if not payroll_run.journal_entry_id:
        raise ValueError('Payroll run must be posted before settlement.')

    seed_default_accounts()
    payment_account = '1000' if payment_method == 'cash' else '1010'
    net_pay = payroll_run.total_net_pay
    journal_entry = post_journal_entry(
        description=f'Payroll payment for {payroll_run.period.name}',
        source_module='payroll_payment',
        source_id=str(payroll_run.id),
        posted_by=posted_by,
        lines=[
            {
                'account': '2200',
                'description': f'Clear payroll payable for {payroll_run.period.name}',
                'debit': net_pay,
                'credit': 0,
            },
            {
                'account': payment_account,
                'description': f'Payroll payment {payment_reference}'.strip(),
                'debit': 0,
                'credit': net_pay,
            },
        ],
    )
    payroll_run.status = 'paid'
    payroll_run.paid_at = timezone.now()
    payroll_run.payment_method = payment_method
    payroll_run.payment_reference = payment_reference
    payroll_run.payment_journal_entry = journal_entry
    payroll_run.save(
        update_fields=[
            'status',
            'paid_at',
            'payment_method',
            'payment_reference',
            'payment_journal_entry',
            'updated_at',
        ],
    )
    return journal_entry


def _reverse_journal_entry(original_entry, *, description, source_module, source_id, posted_by=None):
    if not original_entry:
        return None
    lines = [
        {
            'account': line.account,
            'description': f'Reversal: {line.description}',
            'debit': line.credit,
            'credit': line.debit,
        }
        for line in original_entry.lines.select_related('account').all()
    ]
    return post_journal_entry(
        description=description,
        source_module=source_module,
        source_id=source_id,
        posted_by=posted_by,
        lines=lines,
    )


@transaction.atomic
def reverse_payroll_run(payroll_run: PayrollRun, *, reason='', posted_by=None):
    if payroll_run.status not in ['posted', 'paid']:
        raise ValueError('Only posted or paid payroll runs can be reversed.')
    if payroll_run.status == 'paid' and not payroll_run.payment_journal_entry_id:
        raise ValueError('Paid payroll run is missing its payment journal.')
    if not payroll_run.journal_entry_id:
        raise ValueError('Posted payroll run is missing its payroll journal.')

    payment_reversal = None
    if payroll_run.status == 'paid':
        payment_reversal = _reverse_journal_entry(
            payroll_run.payment_journal_entry,
            description=f'Reverse payroll payment for {payroll_run.period.name}',
            source_module='payroll_payment_reversal',
            source_id=str(payroll_run.id),
            posted_by=posted_by,
        )

    payroll_reversal = _reverse_journal_entry(
        payroll_run.journal_entry,
        description=f'Reverse payroll payable for {payroll_run.period.name}',
        source_module='payroll_run_reversal',
        source_id=str(payroll_run.id),
        posted_by=posted_by,
    )

    payroll_run.status = 'reversed'
    payroll_run.reversed_at = timezone.now()
    payroll_run.reversal_reason = reason
    payroll_run.reversal_journal_entry = payroll_reversal
    payroll_run.payment_reversal_journal_entry = payment_reversal
    payroll_run.save(
        update_fields=[
            'status',
            'reversed_at',
            'reversal_reason',
            'reversal_journal_entry',
            'payment_reversal_journal_entry',
            'updated_at',
        ],
    )

    has_active_run = PayrollRun.objects.filter(period=payroll_run.period).exclude(status__in=['canceled', 'reversed']).exists()
    if not has_active_run:
        payroll_run.period.status = 'draft'
        payroll_run.period.save(update_fields=['status', 'updated_at'])

    return payroll_run
