from tenants.models import Tenant
from users.models import Permission, Role


DEFAULT_PERMISSIONS = [
    ('users.staff.read', 'View staff', 'users'),
    ('users.staff.create', 'Create staff', 'users'),
    ('users.staff.update', 'Update staff', 'users'),
    ('bookings.reservation.read', 'View reservations', 'bookings'),
    ('bookings.reservation.create', 'Create reservations', 'bookings'),
    ('bookings.reservation.check_in', 'Check in guests', 'bookings'),
    ('bookings.reservation.check_out', 'Check out guests', 'bookings'),
    ('rooms.room.read', 'View rooms', 'rooms'),
    ('rooms.room.update', 'Update rooms', 'rooms'),
    ('housekeeping.task.update', 'Update housekeeping tasks', 'housekeeping'),
    ('restaurant.order.create', 'Create restaurant orders', 'restaurant'),
    ('restaurant.order.update', 'Update restaurant orders', 'restaurant'),
    ('restaurant.kitchen.update', 'Update kitchen tickets', 'restaurant'),
    ('pos.sale.create', 'Create POS sales', 'pos'),
    ('inventory.stock.read', 'View inventory stock', 'inventory'),
    ('inventory.purchase.create', 'Create purchase orders', 'inventory'),
    ('accounting.ledger.read', 'View ledgers', 'accounting'),
    ('accounting.journal.create', 'Create journal entries', 'accounting'),
    ('hrms.employee.read', 'View employees', 'hrms'),
    ('hrms.employee.create', 'Create employees', 'hrms'),
    ('maintenance.ticket.update', 'Update maintenance tickets', 'maintenance'),
    ('reports.operational.read', 'View operational reports', 'reports'),
]

DEFAULT_ROLES = [
    ('hotel_admin', 'Hotel Admin', 'Full tenant administration', [code for code, _, _ in DEFAULT_PERMISSIONS]),
    (
        'receptionist',
        'Receptionist',
        'Front desk reservations and guest handling',
        [
            'bookings.reservation.read',
            'bookings.reservation.create',
            'bookings.reservation.check_in',
            'bookings.reservation.check_out',
            'rooms.room.read',
        ],
    ),
    (
        'accountant',
        'Accountant',
        'Accounting, payments, and financial reports',
        ['accounting.ledger.read', 'accounting.journal.create', 'reports.operational.read'],
    ),
    (
        'housekeeping',
        'Housekeeping',
        'Room readiness and cleaning tasks',
        ['rooms.room.read', 'housekeeping.task.update'],
    ),
    (
        'waiter',
        'Waiter',
        'Restaurant table orders',
        ['restaurant.order.create', 'restaurant.order.update'],
    ),
    (
        'kitchen',
        'Kitchen',
        'Kitchen order ticket workflow',
        ['restaurant.kitchen.update'],
    ),
    (
        'cashier',
        'Cashier',
        'POS settlement and billing',
        ['pos.sale.create', 'restaurant.order.update'],
    ),
    (
        'inventory_manager',
        'Inventory Manager',
        'Stock and purchase management',
        ['inventory.stock.read', 'inventory.purchase.create'],
    ),
    ('hr_officer', 'HR Officer', 'Employee and HR operations', ['hrms.employee.read', 'hrms.employee.create']),
    ('maintenance', 'Maintenance', 'Maintenance ticket handling', ['rooms.room.read', 'maintenance.ticket.update']),
    ('auditor', 'Auditor', 'Read-only operational and accounting review', ['accounting.ledger.read', 'reports.operational.read']),
]


def seed_default_permissions():
    permissions = {}
    for code, name, module in DEFAULT_PERMISSIONS:
        permission, _ = Permission.objects.update_or_create(
            code=code,
            defaults={
                'name': name,
                'module': module,
                'description': name,
            },
        )
        permissions[code] = permission
    return permissions


def seed_default_roles(tenant: Tenant):
    permissions = seed_default_permissions()
    roles = {}

    for code, name, description, permission_codes in DEFAULT_ROLES:
        role, _ = Role.objects.update_or_create(
            tenant=tenant,
            code=code,
            defaults={
                'name': name,
                'description': description,
                'is_system': True,
            },
        )
        role.permissions.set([permissions[permission_code] for permission_code in permission_codes])
        roles[code] = role

    return roles
