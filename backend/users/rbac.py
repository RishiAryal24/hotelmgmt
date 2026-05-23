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
    ('restaurant.order.approve', 'Approve restaurant order adjustments', 'restaurant'),
    ('restaurant.kitchen.update', 'Update kitchen tickets', 'restaurant'),
    ('pos.sale.create', 'Create POS sales', 'pos'),
    ('inventory.stock.read', 'View inventory stock', 'inventory'),
    ('inventory.purchase.create', 'Create purchase orders', 'inventory'),
    ('accounting.ledger.read', 'View ledgers', 'accounting'),
    ('accounting.journal.create', 'Create journal entries', 'accounting'),
    ('hrms.employee.read', 'View employees', 'hrms'),
    ('hrms.employee.create', 'Create employees', 'hrms'),
    ('hrms.shift.read', 'View shifts', 'hrms'),
    ('hrms.shift.create', 'Create shifts', 'hrms'),
    ('hrms.attendance.read', 'View attendance', 'hrms'),
    ('hrms.attendance.create', 'Create attendance', 'hrms'),
    ('hrms.payroll.read', 'View payroll', 'hrms'),
    ('hrms.payroll.create', 'Create payroll', 'hrms'),
    ('hrms.payroll.approve', 'Approve payroll', 'hrms'),
    ('hrms.payroll.post', 'Post payroll', 'hrms'),
    ('maintenance.ticket.update', 'Update maintenance tickets', 'maintenance'),
    ('audit.log.read', 'View audit logs', 'audit'),
    ('notifications.event.read', 'View notification events', 'notifications'),
    ('notifications.event.update', 'Update notification follow-up state', 'notifications'),
    ('notifications.template.read', 'View notification templates', 'notifications'),
    ('notifications.template.manage', 'Manage notification templates', 'notifications'),
    ('payments.intent.read', 'View payment intents', 'payments'),
    ('payments.intent.create', 'Create payment intents', 'payments'),
    ('payments.intent.update', 'Update payment intents', 'payments'),
    ('payments.intent.callback', 'Record provider payment callbacks', 'payments'),
    ('integrations.ota.read', 'View OTA channels and sync jobs', 'integrations'),
    ('integrations.ota.manage', 'Manage OTA channels and sync jobs', 'integrations'),
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
        [
            'accounting.ledger.read',
            'accounting.journal.create',
            'payments.intent.read',
            'payments.intent.create',
            'payments.intent.update',
            'payments.intent.callback',
            'reports.operational.read',
            'notifications.event.read',
            'notifications.event.update',
        ],
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
        'restaurant_manager',
        'Restaurant Manager',
        'Restaurant order supervision and approval',
        ['restaurant.order.create', 'restaurant.order.update', 'restaurant.order.approve', 'restaurant.kitchen.update', 'pos.sale.create', 'notifications.event.read', 'notifications.event.update'],
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
        ['pos.sale.create', 'restaurant.order.update', 'bookings.reservation.read', 'payments.intent.read', 'payments.intent.create', 'payments.intent.update'],
    ),
    (
        'inventory_manager',
        'Inventory Manager',
        'Stock and purchase management',
        ['inventory.stock.read', 'inventory.purchase.create', 'notifications.event.read', 'notifications.event.update'],
    ),
    (
        'hr_officer',
        'HR Officer',
        'Employee and HR operations',
        [
            'hrms.employee.read',
            'hrms.employee.create',
            'hrms.shift.read',
            'hrms.shift.create',
            'hrms.attendance.read',
            'hrms.attendance.create',
            'hrms.payroll.read',
            'hrms.payroll.create',
            'hrms.payroll.approve',
            'hrms.payroll.post',
            'notifications.event.read',
            'notifications.event.update',
        ],
    ),
    ('maintenance', 'Maintenance', 'Maintenance ticket handling', ['rooms.room.read', 'maintenance.ticket.update', 'notifications.event.read', 'notifications.event.update']),
    ('auditor', 'Auditor', 'Read-only operational, accounting, and audit review', ['accounting.ledger.read', 'reports.operational.read', 'audit.log.read', 'notifications.event.read']),
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
