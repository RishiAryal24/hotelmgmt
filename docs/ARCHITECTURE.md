# Multi-Tenant Hotel Management ERP Architecture

## Product Goal

Build a cloud-ready SaaS Hotel and Restaurant Management ERP with integrated double-entry accounting. The platform serves many independent hotel, restaurant, and mixed hospitality tenants, with strict data isolation, tenant-specific administration, modular operations, and accounting automation for every financial transaction.

## Architecture Style

- Modular monolith first, with clear module boundaries for future service extraction.
- API-first backend using Django and Django REST Framework.
- PostgreSQL schema-based tenant isolation using `django-tenants`.
- Event-driven ready using domain events persisted in the database and dispatched through Celery.
- React + TypeScript frontend with route-aware RBAC and TanStack Query for API state.
- Dockerized local/dev deployment, Kubernetes-ready production deployment.

## Runtime Components

- `frontend`: React, TypeScript, Vite, TailwindCSS, React Router, TanStack Query.
- `backend`: Django, DRF, JWT auth, django-tenants, Celery.
- `postgres`: primary transactional database with tenant schemas.
- `redis`: cache, rate limiting, Celery broker.
- `celery_worker`: asynchronous task execution.
- `celery_beat`: scheduled jobs for reports, reminders, subscription tasks.
- `nginx`: TLS termination, static assets, reverse proxy.
- `observability`: Sentry, Prometheus, Grafana, structured logs.

## Tenancy Model

Preferred strategy: PostgreSQL schema-based isolation.

Shared/public schema:

- Tenant registry
- Tenant domains
- Platform users
- Subscription plans
- Platform audit logs
- Global configuration

Tenant schema:

- Hotel, restaurant, and property profile/settings
- Tenant users and staff
- Roles and permissions
- Rooms, rates, reservations, guests
- Restaurant menus, tables, kitchen orders, POS, inventory, HRMS
- Accounting ledgers, journals, invoices, payments
- Tenant audit logs

Tenant creation flow:

1. Super Admin submits tenant creation request.
2. Backend validates tenant name, domain, subscription plan, and admin email.
3. Tenant record is created in public schema.
4. PostgreSQL tenant schema is created.
5. Tenant migrations are applied.
6. Default tenant settings are generated.
7. Default departments, roles, and permissions are seeded.
8. Hotel Admin account is created.
9. Subscription record is generated.
10. Onboarding email/task is queued.
11. Audit event is written.

## Identity And Access

Authentication:

- JWT access tokens.
- Refresh tokens with rotation.
- OAuth2-ready provider abstraction.
- MFA-ready user model and login flow.

Authorization:

- Super Admin operates only in the public/platform context.
- Hotel Admin operates inside one or more tenant contexts.
- Staff users operate inside tenant context with scoped permissions.
- Permissions are dynamic and module-aware.

Permission format:

```text
module.resource.action
```

Examples:

- `bookings.reservation.create`
- `bookings.reservation.check_in`
- `rooms.room.update_status`
- `accounting.journal.approve`
- `inventory.purchase_order.create`
- `hrms.employee.read`

## Backend Module Boundaries

Recommended modules:

- `core`: UUID base models, audit fields, soft delete, shared utilities.
- `tenants`: tenant registry, domains, subscription context, onboarding.
- `users`: authentication, user profiles, RBAC, staff accounts.
- `bookings`: reservations, guests, availability, check-in/check-out.
- `rooms`: room types, rooms, status, housekeeping readiness.
- `housekeeping`: cleaning tasks, schedules, assignments, escalations.
- `restaurant`: menus, categories, modifiers, tables, waiter orders, kitchen order tickets, dining sessions.
- `pos`: restaurant, bar, room service, counter sales, tax-aware billing and payments.
- `inventory`: stock, vendors, purchase orders, valuation.
- `accounting`: chart of accounts, ledger, journals, invoices, payments.
- `hrms`: employees, attendance, shifts, payroll, leave.
- `crm`: guest history, loyalty, feedback, campaigns.
- `reports`: operational, financial, and analytics reports.
- `integrations`: payment gateways, OTA, SMS, WhatsApp, email.

## Accounting Engine

Accounting must use double-entry principles.

Core concepts:

- Chart of Accounts
- Fiscal periods
- Journal entries
- Journal lines
- General ledger
- Accounts receivable
- Accounts payable
- Tax rules
- Cost centers/departments

Every posting must satisfy:

```text
sum(debits) == sum(credits)
```

Automated posting examples:

- Booking confirmation with deposit:
  - Debit Cash/Bank
  - Credit Guest Advance Liability

- Guest checkout invoice:
  - Debit Accounts Receivable or Guest Advance Liability
  - Credit Room Revenue
  - Credit Tax Payable

- POS sale:
  - Debit Cash/AR
  - Credit Restaurant/POS Revenue
  - Credit Tax Payable

- Room service posted to guest folio:
  - Debit Guest Receivable
  - Credit Restaurant Revenue
  - Credit Tax Payable

- Complimentary restaurant item:
  - Debit Complimentary/Promotion Expense
  - Credit Inventory or Food Cost Recovery, depending on policy

- Inventory purchase:
  - Debit Inventory Asset
  - Credit Accounts Payable or Cash

- Payroll:
  - Debit Salary Expense
  - Credit Cash/Bank or Salary Payable

Posting should happen through accounting services, not directly in views.

Current automated postings:

- Guest checkout posts room folio settlement.
- Restaurant cash/card/wallet/bank settlement posts restaurant revenue.
- Restaurant room posting debits receivables and adds a guest folio line.
- Inventory receiving debits inventory asset and credits payable/cash/bank.

Current cross-module automations:

- Guest checkout creates a checkout-clean housekeeping task and sets the room to cleaning.
- Completing the last active housekeeping task for a room sets the room to available.
- Restaurant settlement can post served orders to checked-in guest folios.
- Settled restaurant orders deduct linked inventory items.
- Inventory receiving updates current stock, cost price, stock movement history, and accounting.

## API Shape

Base path:

```text
/api/v1/
```

Primary API groups:

- `/api/v1/auth/`
- `/api/v1/tenants/`
- `/api/v1/users/`
- `/api/v1/rbac/`
- `/api/v1/bookings/`
- `/api/v1/rooms/`
- `/api/v1/restaurant/`
- `/api/v1/pos/`
- `/api/v1/accounting/`
- `/api/v1/inventory/`
- `/api/v1/hrms/`
- `/api/v1/reports/`
- `/api/v1/integrations/`

API requirements:

- Versioned routes.
- JWT authentication.
- Tenant context resolution.
- Pagination, filtering, search, sorting.
- Request throttling.
- Swagger/OpenAPI docs.
- Consistent error envelope.
- Audit logging for sensitive mutations.

## Frontend Architecture

Recommended structure:

```text
src/
  app/
  components/
  hooks/
  layouts/
  modules/
    auth/
    dashboard/
    tenants/
    bookings/
    rooms/
    restaurant/
    pos/
    accounting/
    inventory/
    hrms/
    reports/
    settings/
  services/
  store/
  types/
```

Frontend requirements:

- Role-aware routing.
- Permission-aware navigation.
- Tenant context switcher for authorized users.
- Light/dark theme.
- Responsive enterprise dashboard.
- React Query for server state.
- Axios client with token refresh.
- Formik + Yup or React Hook Form + Zod for forms.
- Internationalization-ready labels and layouts.

## Security Requirements

- JWT access/refresh token flow.
- Refresh token rotation.
- Strong password policy.
- MFA-ready model fields and login flow.
- API throttling and login rate limits.
- Tenant isolation enforced at middleware/service/query layers.
- Audit logs for authentication, RBAC, payments, accounting, and tenant changes.
- Sensitive field encryption where needed.
- Secure headers, CORS restrictions, CSRF protection where applicable.
- GDPR-ready export/delete/anonymization workflows.
- PCI-aware payment design: never store raw card data.

## Scalability Path

Initial:

- Modular monolith.
- PostgreSQL schemas.
- Redis cache.
- Celery background jobs.
- Docker Compose.

Growth:

- Read replicas.
- Tenant-aware connection pooling.
- Horizontal backend workers.
- Dedicated worker queues by workload.
- CDN for static/media.
- Partitioning-ready audit/event tables.

Future extraction candidates:

- Accounting service.
- Reporting/analytics service.
- Restaurant/POS service.
- Notification service.
- OTA integrations service.
- Payment service.
