from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.models import Account, FiscalPeriod, JournalEntry, JournalLine, NightAuditRun, NightAuditSchedule


DEFAULT_ACCOUNTS = [
    ('1000', 'Cash', 'asset'),
    ('1010', 'Bank', 'asset'),
    ('1100', 'Accounts Receivable', 'asset'),
    ('1200', 'Inventory Asset', 'asset'),
    ('2000', 'Accounts Payable', 'liability'),
    ('2100', 'Tax Payable', 'liability'),
    ('2200', 'Payroll Payable', 'liability'),
    ('3000', 'Owner Equity', 'equity'),
    ('4000', 'Room Revenue', 'revenue'),
    ('4100', 'Restaurant Revenue', 'revenue'),
    ('4200', 'Service Charge Revenue', 'revenue'),
    ('5000', 'Food Cost', 'expense'),
    ('5100', 'Salary Expense', 'expense'),
    ('5200', 'Complimentary Expense', 'expense'),
]


def seed_default_accounts():
    accounts = {}
    for code, name, account_type in DEFAULT_ACCOUNTS:
        account, _ = Account.objects.update_or_create(
            code=code,
            defaults={
                'name': name,
                'account_type': account_type,
                'is_active': True,
            },
        )
        accounts[code] = account
    return accounts


def get_account(code: str) -> Account:
    return Account.objects.get(code=code)


def get_fiscal_period_for_date(entry_date):
    return (
        FiscalPeriod.objects.filter(start_date__lte=entry_date, end_date__gte=entry_date)
        .order_by('start_date')
        .first()
    )


def ensure_open_fiscal_period(entry_date):
    period = get_fiscal_period_for_date(entry_date)
    if period and period.status == 'closed':
        raise ValueError(f'Fiscal period "{period.name}" is closed for {entry_date}.')
    return period


def _posted_lines_queryset():
    return JournalLine.objects.select_related('account', 'journal_entry').filter(journal_entry__status='posted')


def _report_rows(lines):
    grouped = defaultdict(lambda: {'account_code': '', 'account_name': '', 'account_type': '', 'debit': Decimal('0.00'), 'credit': Decimal('0.00')})
    for line in lines:
        bucket = grouped[str(line.account_id)]
        bucket['account_code'] = line.account.code
        bucket['account_name'] = line.account.name
        bucket['account_type'] = line.account.account_type
        bucket['debit'] += line.debit
        bucket['credit'] += line.credit
    rows = []
    for bucket in grouped.values():
        net = bucket['debit'] - bucket['credit']
        rows.append(
            {
                **bucket,
                'balance': net,
                'debit_balance': net if net > 0 else Decimal('0.00'),
                'credit_balance': abs(net) if net < 0 else Decimal('0.00'),
            }
        )
    return sorted(rows, key=lambda row: row['account_code'])


def get_trial_balance(*, date_from=None, date_to=None):
    lines = _posted_lines_queryset()
    if date_from:
        lines = lines.filter(journal_entry__entry_date__gte=date_from)
    if date_to:
        lines = lines.filter(journal_entry__entry_date__lte=date_to)
    rows = _report_rows(lines)
    total_debits = sum((row['debit_balance'] for row in rows), Decimal('0.00'))
    total_credits = sum((row['credit_balance'] for row in rows), Decimal('0.00'))
    return {
        'date_from': date_from,
        'date_to': date_to,
        'rows': rows,
        'totals': {
            'debit_balance': total_debits,
            'credit_balance': total_credits,
        },
    }


def get_profit_and_loss(*, date_from, date_to):
    lines = _posted_lines_queryset().filter(
        journal_entry__entry_date__gte=date_from,
        journal_entry__entry_date__lte=date_to,
        account__account_type__in=['revenue', 'expense'],
    )
    rows = _report_rows(lines)
    revenue_rows = []
    expense_rows = []
    total_revenue = Decimal('0.00')
    total_expenses = Decimal('0.00')
    for row in rows:
        amount = row['credit'] - row['debit'] if row['account_type'] == 'revenue' else row['debit'] - row['credit']
        normalized = {**row, 'amount': amount}
        if row['account_type'] == 'revenue':
            total_revenue += amount
            revenue_rows.append(normalized)
        else:
            total_expenses += amount
            expense_rows.append(normalized)
    return {
        'date_from': date_from,
        'date_to': date_to,
        'revenue': revenue_rows,
        'expenses': expense_rows,
        'totals': {
            'revenue': total_revenue,
            'expenses': total_expenses,
            'net_income': total_revenue - total_expenses,
        },
    }


def get_balance_sheet(*, as_of=None):
    as_of = as_of or date.today()
    lines = _posted_lines_queryset().filter(
        journal_entry__entry_date__lte=as_of,
        account__account_type__in=['asset', 'liability', 'equity'],
    )
    rows = _report_rows(lines)
    sections = {'asset': [], 'liability': [], 'equity': []}
    totals = {'asset': Decimal('0.00'), 'liability': Decimal('0.00'), 'equity': Decimal('0.00')}
    for row in rows:
        amount = row['debit'] - row['credit'] if row['account_type'] == 'asset' else row['credit'] - row['debit']
        normalized = {**row, 'amount': amount}
        sections[row['account_type']].append(normalized)
        totals[row['account_type']] += amount
    return {
        'as_of': as_of,
        'assets': sections['asset'],
        'liabilities': sections['liability'],
        'equity': sections['equity'],
        'totals': {
            **totals,
            'liabilities_and_equity': totals['liability'] + totals['equity'],
        },
    }


@transaction.atomic
def post_journal_entry(*, description: str, lines: list[dict], source_module: str = '', source_id: str = '', posted_by=None, entry_date=None):
    debit_total = sum(Decimal(str(line.get('debit', '0') or '0')) for line in lines)
    credit_total = sum(Decimal(str(line.get('credit', '0') or '0')) for line in lines)

    if debit_total <= 0 or credit_total <= 0:
        raise ValueError('Journal entry must include debit and credit amounts.')
    if debit_total != credit_total:
        raise ValueError('Journal entry is not balanced.')
    entry_date = entry_date or date.today()
    fiscal_period = ensure_open_fiscal_period(entry_date)

    entry = JournalEntry.objects.create(
        description=description,
        source_module=source_module,
        source_id=source_id,
        posted_by=posted_by,
        status='posted',
        entry_date=entry_date,
        fiscal_period=fiscal_period,
    )

    for line in lines:
        account = line['account'] if isinstance(line['account'], Account) else get_account(line['account'])
        JournalLine.objects.create(
            journal_entry=entry,
            account=account,
            description=line.get('description', ''),
            debit=Decimal(str(line.get('debit', '0') or '0')),
            credit=Decimal(str(line.get('credit', '0') or '0')),
        )

    return entry


@transaction.atomic
def post_vendor_bill(vendor_bill, posted_by=None):
    if vendor_bill.status != 'draft':
        raise ValueError('Only draft vendor bills can be posted.')
    vendor_bill.recalculate_totals()
    if vendor_bill.total_amount <= 0:
        raise ValueError('Vendor bill total must be greater than zero.')
    if JournalEntry.objects.filter(source_module='vendor_bill', source_id=str(vendor_bill.id), status='posted').exists():
        raise ValueError('Vendor bill is already posted.')

    seed_default_accounts()
    debit_lines = []
    for line in vendor_bill.lines.select_related('account', 'tax_rate', 'tax_rate__account'):
        if line.amount <= 0:
            raise ValueError('Vendor bill lines must have positive amounts.')
        debit_lines.append(
            {
                'account': line.account,
                'description': line.description,
                'debit': line.amount,
                'credit': 0,
            }
        )
        if line.tax_amount:
            if not line.tax_rate_id:
                raise ValueError('Tax amount requires a tax rate.')
            debit_lines.append(
                {
                    'account': line.tax_rate.account,
                    'description': f'{line.tax_rate.name} on {line.description}',
                    'debit': line.tax_amount,
                    'credit': 0,
                }
            )

    journal_entry = post_journal_entry(
        description=f'Vendor bill {vendor_bill.bill_number}',
        source_module='vendor_bill',
        source_id=str(vendor_bill.id),
        posted_by=posted_by,
        entry_date=vendor_bill.bill_date,
        lines=[
            *debit_lines,
            {
                'account': '2000',
                'description': f'Accounts payable for {vendor_bill.vendor.name}',
                'debit': 0,
                'credit': vendor_bill.total_amount,
            },
        ],
    )
    vendor_bill.status = 'posted'
    vendor_bill.journal_entry = journal_entry
    vendor_bill.posted_by = posted_by
    from django.utils import timezone

    vendor_bill.posted_at = timezone.now()
    vendor_bill.save(update_fields=['status', 'journal_entry', 'posted_by', 'posted_at', 'subtotal', 'tax_total', 'total_amount', 'updated_at'])
    return vendor_bill


def post_restaurant_settlement(order, posted_by=None):
    if JournalEntry.objects.filter(source_module='restaurant_order', source_id=str(order.id), status='posted').exists():
        return None

    seed_default_accounts()
    payment_rows = list(order.payments.all())
    if payment_rows:
        debit_lines = []
        for payment in payment_rows:
            payment_account = '1100' if payment.payment_method == 'room_posting' else '1010' if payment.payment_method in ['card', 'bank_transfer'] else '1000'
            debit_lines.append(
                {
                    'account': payment_account,
                    'description': f'{payment.get_payment_method_display()} payment for {order.order_number}',
                    'debit': payment.amount,
                    'credit': 0,
                }
            )
    else:
        payment_account = '1100' if order.payment_method == 'room_posting' else '1000'
        debit_lines = [
            {
                'account': payment_account,
                'description': f'Payment for {order.order_number}',
                'debit': order.paid_amount,
                'credit': 0,
            }
        ]
    discount_remaining = order.discount_total
    restaurant_revenue = order.subtotal - min(discount_remaining, order.subtotal)
    discount_remaining -= min(discount_remaining, order.subtotal)
    tax_payable = order.tax_total - min(discount_remaining, order.tax_total)
    discount_remaining -= min(discount_remaining, order.tax_total)
    service_revenue = order.service_charge_total - min(discount_remaining, order.service_charge_total)

    credit_lines = []
    if restaurant_revenue:
        credit_lines.append(
            {
                'account': '4100',
                'description': f'Restaurant revenue for {order.order_number}',
                'debit': 0,
                'credit': restaurant_revenue,
            }
        )
    if tax_payable:
        credit_lines.append(
            {
                'account': '2100',
                'description': f'Restaurant tax for {order.order_number}',
                'debit': 0,
                'credit': tax_payable,
            }
        )
    if service_revenue:
        credit_lines.append(
            {
                'account': '4200',
                'description': f'Restaurant service charge for {order.order_number}',
                'debit': 0,
                'credit': service_revenue,
            }
        )

    return post_journal_entry(
        description=f'Restaurant settlement {order.order_number}',
        source_module='restaurant_order',
        source_id=str(order.id),
        posted_by=posted_by,
        lines=[
            *debit_lines,
            *credit_lines,
        ],
    )


def post_room_payment(folio, posted_by=None):
    if JournalEntry.objects.filter(source_module='guest_folio', source_id=str(folio.id), status='posted').exists():
        return None

    seed_default_accounts()
    payment_account = '1010' if folio.payment_method in ['card', 'bank_transfer'] else '1000'
    room_total = folio.subtotal + folio.tax_total + folio.service_charge_total
    receivable_total = folio.charge_total
    lines = [
        {
            'account': payment_account,
            'description': f'Payment for {folio.folio_number}',
            'debit': folio.paid_amount,
            'credit': 0,
        },
    ]
    if room_total:
        lines.append(
            {
                'account': '4000',
                'description': f'Room revenue for {folio.folio_number}',
                'debit': 0,
                'credit': room_total,
            },
        )
    if receivable_total:
        lines.append(
            {
                'account': '1100',
                'description': f'Clear room-posted charges for {folio.folio_number}',
                'debit': 0,
                'credit': receivable_total,
            },
        )

    return post_journal_entry(
        description=f'Room folio settlement {folio.folio_number}',
        source_module='guest_folio',
        source_id=str(folio.id),
        posted_by=posted_by,
        lines=lines,
    )


def post_inventory_purchase(movement, payment_account='2000', posted_by=None):
    if JournalEntry.objects.filter(source_module='inventory_purchase', source_id=str(movement.id), status='posted').exists():
        return None

    seed_default_accounts()
    total_cost = movement.total_cost
    return post_journal_entry(
        description=f'Inventory purchase {movement.reference or movement.item.sku}',
        source_module='inventory_purchase',
        source_id=str(movement.id),
        posted_by=posted_by,
        lines=[
            {
                'account': '1200',
                'description': f'Inventory received: {movement.item.name}',
                'debit': total_cost,
                'credit': 0,
            },
            {
                'account': payment_account,
                'description': f'Inventory purchase payable: {movement.item.name}',
                'debit': 0,
                'credit': total_cost,
            },
        ],
    )


def post_purchase_order_payment(purchase_order, payment_account='1000', posted_by=None):
    if JournalEntry.objects.filter(source_module='purchase_order_payment', source_id=str(purchase_order.id), status='posted').exists():
        return None

    seed_default_accounts()
    total_cost = purchase_order.total_amount
    return post_journal_entry(
        description=f'Purchase order payment {purchase_order.po_number}',
        source_module='purchase_order_payment',
        source_id=str(purchase_order.id),
        posted_by=posted_by,
        lines=[
            {
                'account': '2000',
                'description': f'Clear payable for {purchase_order.po_number}',
                'debit': total_cost,
                'credit': 0,
            },
            {
                'account': payment_account,
                'description': f'Payment for {purchase_order.po_number}',
                'debit': 0,
                'credit': total_cost,
            },
        ],
    )


def get_night_audit_schedule():
    schedule = NightAuditSchedule.objects.order_by('-created_at').first()
    if schedule:
        return schedule
    return NightAuditSchedule.objects.create()


@transaction.atomic
def update_night_audit_schedule(*, enabled, run_time, timezone_name, notes=''):
    schedule = get_night_audit_schedule()
    schedule.enabled = enabled
    schedule.run_time = datetime.strptime(run_time, '%H:%M').time() if isinstance(run_time, str) else run_time
    schedule.timezone = timezone_name
    schedule.notes = notes
    schedule.save(update_fields=['enabled', 'run_time', 'timezone', 'notes', 'updated_at'])
    return schedule


@transaction.atomic
def run_night_audit(*, audit_date=None, triggered_by=None):
    from bookings.models import Booking, GuestFolio, GuestFolioLine
    from bookings.services import ensure_room_charge_line
    from restaurant.models import RestaurantOrder

    audit_date = audit_date or timezone.localdate()
    existing_run = NightAuditRun.objects.filter(audit_date=audit_date).first()
    if existing_run and existing_run.status != 'failed':
        raise ValueError(f'Night audit already ran for {audit_date}.')

    run = existing_run or NightAuditRun.objects.create(audit_date=audit_date, triggered_by=triggered_by)
    run.started_at = timezone.now()
    run.triggered_by = triggered_by or run.triggered_by
    run.status = 'completed'
    run.error_message = ''
    run.save(update_fields=['started_at', 'triggered_by', 'status', 'error_message', 'updated_at'])

    exceptions = []
    room_charge_lines_created = 0

    try:
        checked_in_bookings = list(
            Booking.objects.select_related('room', 'guest')
            .filter(status='checked_in', check_in_date__lte=audit_date)
            .order_by('check_in_date')
        )
        for booking in checked_in_bookings:
            folio, _ = GuestFolio.objects.get_or_create(
                booking=booking,
                defaults={'status': 'open', 'subtotal': booking.total_amount},
            )
            before_exists = GuestFolioLine.objects.filter(
                folio=folio,
                source_module='room_charge',
                source_id=str(booking.id),
            ).exists()
            ensure_room_charge_line(folio)
            if not before_exists:
                room_charge_lines_created += 1
            if folio.status != 'open':
                exceptions.append(
                    {
                        'type': 'folio_not_open',
                        'booking_id': str(booking.id),
                        'folio_id': str(folio.id),
                        'message': f'Folio {folio.folio_number} is {folio.status}.',
                    }
                )
            unresolved_orders = RestaurantOrder.objects.filter(room_booking=booking).exclude(status__in=['paid', 'cancelled']).count()
            if unresolved_orders:
                exceptions.append(
                    {
                        'type': 'unresolved_room_service',
                        'booking_id': str(booking.id),
                        'folio_id': str(folio.id),
                        'message': f'{unresolved_orders} room-service order(s) remain unresolved.',
                    }
                )

        open_folios = GuestFolio.objects.filter(status='open').count()
        paid_folios = GuestFolio.objects.filter(status='paid').count()
        run.checked_in_bookings = len(checked_in_bookings)
        run.folios_reviewed = GuestFolio.objects.count()
        run.room_charge_lines_created = room_charge_lines_created
        run.open_folios = open_folios
        run.paid_folios = paid_folios
        run.exceptions = exceptions
        run.summary = {
            'checked_in_bookings': len(checked_in_bookings),
            'folios_reviewed': run.folios_reviewed,
            'open_folios': open_folios,
            'paid_folios': paid_folios,
            'room_charge_lines_created': room_charge_lines_created,
            'exception_count': len(exceptions),
        }
        run.status = 'completed_with_exceptions' if exceptions else 'completed'
        run.completed_at = timezone.now()
        run.save()
    except Exception as exc:
        run.status = 'failed'
        run.error_message = str(exc)
        run.completed_at = timezone.now()
        run.save(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
        raise

    schedule = NightAuditSchedule.objects.order_by('-created_at').first()
    if schedule:
        schedule.last_run_at = run.completed_at
        schedule.save(update_fields=['last_run_at', 'updated_at'])
    return run
