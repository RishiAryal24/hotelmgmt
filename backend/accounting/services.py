from decimal import Decimal

from django.db import transaction

from accounting.models import Account, JournalEntry, JournalLine


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


@transaction.atomic
def post_journal_entry(*, description: str, lines: list[dict], source_module: str = '', source_id: str = '', posted_by=None):
    debit_total = sum(Decimal(str(line.get('debit', '0') or '0')) for line in lines)
    credit_total = sum(Decimal(str(line.get('credit', '0') or '0')) for line in lines)

    if debit_total <= 0 or credit_total <= 0:
        raise ValueError('Journal entry must include debit and credit amounts.')
    if debit_total != credit_total:
        raise ValueError('Journal entry is not balanced.')

    entry = JournalEntry.objects.create(
        description=description,
        source_module=source_module,
        source_id=source_id,
        posted_by=posted_by,
        status='posted',
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
