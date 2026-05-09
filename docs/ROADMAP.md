# Implementation Roadmap

## Current Project Stage

The repository is currently an early MVP scaffold:

- Django/DRF backend imports successfully.
- React/Vite frontend builds successfully.
- Basic tenant, user, room, guest, and booking concepts exist.
- Restaurant/POS, accounting, inventory, HRMS, reporting, integrations, and advanced RBAC are still mostly placeholders.
- Frontend authentication is not wired to JWT.
- Tenant onboarding UI is static.
- Celery, Redis workflows, testing, CI/CD, and production hardening are not yet implemented.

## Phase 1: Platform Foundation

Goal: make the SaaS platform secure, tenant-aware, and usable by Super Admin and Hotel Admin.

Backend:

- Add migrations for tenants and users.
- Create deterministic tenant onboarding service.
- Add tenant default data seeding.
- Implement JWT login, refresh, logout, and current-user API.
- Implement RBAC models and permission checks.
- Add audit logging foundation.
- Add platform-only Super Admin tenant APIs.
- Add tenant-scoped staff user APIs.
- Add API tests for tenant isolation and permissions.

Frontend:

- Implement real login using JWT.
- Store tokens securely and refresh access tokens.
- Add protected routes.
- Add role-aware navigation.
- Build Super Admin tenant management screens.
- Build Tenant Admin staff/RBAC screens.

DevOps:

- Fix Docker Compose startup flow.
- Add backend migration commands.
- Add GitHub Actions for backend checks and frontend build.
- Add `.env.example` for frontend and backend.

Exit criteria:

- Super Admin can create a tenant.
- Tenant schema is created and migrated.
- Hotel Admin is generated.
- Hotel Admin can log in.
- Tenant Admin can create staff and assign roles.
- Tenant data is isolated.

## Phase 2: HMS Operations

Goal: deliver working hotel operations.

Modules:

- Room types and room inventory.
- Availability calendar.
- Reservation creation and modification.
- Walk-in booking.
- Guest profiles.
- Check-in/check-out.
- Housekeeping status and task assignment.
- Maintenance status.

Exit criteria:

- Receptionist can manage guests and reservations.
- Front desk can check guests in/out.
- Housekeeping can update room readiness.
- Availability prevents double booking.

## Phase 3: Restaurant ERP, POS, Inventory

Goal: deliver restaurant operations and connect food/beverage sales to inventory and accounting.

Restaurant ERP:

- Menu categories and menu items.
- Item modifiers and add-ons.
- Restaurant tables and sections.
- Dine-in, takeaway, delivery, and room-service orders.
- Waiter order entry.
- Kitchen order tickets.
- Kitchen stations.
- Order status workflow.
- Split bills and merged bills.
- Table transfer.
- Complimentary/void workflows with approval.

POS:

- Restaurant, bar, banquet, counter, and room-service sales.
- Tax/service charge handling.
- Room posting support.
- Multiple payment methods.
- Shift/cashier closing.

Inventory:

- Vendors.
- Items and stock movements.
- Purchase orders.
- Goods receipt.
- Inventory valuation.
- Recipe/BOM-ready food costing.
- Stock deduction from restaurant sales.

Exit criteria:

- Waiters can create orders and send items to kitchen.
- Kitchen can process tickets by station.
- Cashier can settle restaurant bills or post to room.
- Restaurant sales can reduce inventory or support recipe-based costing.
- POS sales and inventory purchases produce balanced journal entries.

## Phase 4: Accounting ERP

Goal: connect all hotel and restaurant transactions to a double-entry accounting engine.

Accounting:

- Chart of accounts.
- Fiscal periods.
- Journal entries and journal lines.
- Posting service with debit/credit validation.
- Accounts receivable.
- Accounts payable.
- Tax configuration.
- Guest folios.
- Vendor bills.
- Trial balance, P&L, balance sheet.
- Cash flow.

Exit criteria:

- Booking, checkout, restaurant sale, room-service posting, inventory purchase, payroll, refund, tax, and payment flows produce balanced journal entries.
- Accountant can view ledgers and financial reports.

## Phase 5: HRMS, CRM, Reporting

Goal: broaden ERP capabilities.

HRMS:

- Employee records.
- Attendance.
- Shifts.
- Leave.
- Payroll posting to accounting.

CRM:

- Guest history.
- Loyalty.
- Feedback.
- Campaign segments.

Reporting:

- Occupancy.
- ADR.
- RevPAR.
- Revenue trends.
- Inventory valuation.
- Tax summaries.
- Staff performance.

Exit criteria:

- Tenant Admin has operational and financial dashboards.
- Reports are exportable and permission controlled.

## Phase 6: Scale And Integrations

Goal: prepare for large-scale SaaS and external ecosystem.

Features:

- Multi-property hotel chains.
- Mobile API support.
- OTA integrations.
- Payment gateways.
- Nepal gateways: Khalti/eSewa.
- SMS/WhatsApp/email notifications.
- AI forecasting.
- Smart pricing.
- QR check-in.
- E-signatures.

Infrastructure:

- Kubernetes manifests or Helm chart.
- NGINX production config.
- Sentry.
- Prometheus/Grafana.
- Structured logging.
- Backup and restore procedures.

Exit criteria:

- Platform can safely onboard many tenants.
- Background jobs and reporting workloads are isolated from API latency.
- Production deployment guide is complete.

## Recommended Immediate Next Step

Start with Phase 1 in this order:

1. Fix backend migrations and tenant/user schema setup.
2. Implement auth endpoints and current-user endpoint.
3. Add frontend JWT login and protected routes.
4. Implement Super Admin tenant creation UI.
5. Add tests for tenant creation and isolation.
