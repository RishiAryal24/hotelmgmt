# Implementation Roadmap

## Current Project Stage

The project is now a connected development-stage hospitality ERP. It is suitable for local testing and development previews, not production tenant data.

Checkpoint note:

- Current checkpoint is stable as of the audit logging foundation slice.
- Local bootstrap, frontend build, and backend tests are passing.
- Recommended continuation: restaurant split bills/table transfer or fiscal periods/trial balance.

Working foundations:

- Multi-tenant Django/DRF backend with JWT auth and RBAC.
- React/Vite frontend with protected routes and permission-aware navigation.
- Tenant-scoped audit logging for core business records.
- Local PostgreSQL development setup with bootstrap scripts and seeded demo data.
- Development deployment shape confirmed: Netlify frontend, Render backend, Supabase Postgres.

Working modules:

- Dashboard with live operational signals.
- Staff and role management.
- Rooms and room types.
- Guests, reservations, check-in, checkout, guest folios.
- Availability calendar view for room/date planning.
- Stay extension for in-house guests with availability validation and folio extension charges.
- Room transfer for in-house guests with target-room availability validation and old-room cleaning task creation.
- Guest history/CRM profile with stay history, folio value, VIP level, preferences, and internal notes.
- Checkout-to-housekeeping automation.
- Housekeeping task workflow and room readiness updates.
- Maintenance tickets with room downtime status, resolution workflow, and housekeeping escalation.
- Restaurant menu, tables, order workflow, kitchen tickets, settlement.
- Restaurant room posting into guest folios.
- Inventory vendors, items, purchase orders, stock receiving, adjustments, low-stock alerts, movement history.
- Restaurant inventory deduction on settled orders.
- Accounting chart of accounts, journal entries, automated postings, summary view, and journal filters.
- Basic operational Reports for occupancy, revenue, restaurant sales, and inventory.
- CSV exports for operational reports and payroll.
- Basic HRMS employee records.
- HRMS shifts and attendance with clock-in/clock-out workflow.
- Payroll periods, generated draft payroll runs, approval/posting status, payslip details, and accounting settlement posting.
- Audit Logs page with action/module filters and field-change summaries.

## Local Testing

Bootstrap local data:

```powershell
.\scripts\bootstrap-local.cmd
```

Start the local app:

```powershell
.\scripts\start-local-all.cmd
```

Login:

- Email: `admin@local.test`
- Password: `AdminPass12345`
- Tenant domain: `local.hotel.test`

Run backend tests:

```powershell
.\scripts\test-backend.cmd bookings restaurant inventory
```

Build frontend:

```powershell
cd frontend
npm.cmd run build
```

## Phase 1: Platform Foundation

Status: mostly complete for development.

Completed:

- Tenant models and schema setup.
- Tenant bootstrap commands.
- JWT login and current-user flow.
- RBAC permissions, roles, and permission checks.
- Protected frontend routes.
- Staff and role management UI.
- Local development scripts.
- Basic tenant isolation tests.
- Audit logging foundation with create/update/delete capture.

Remaining:

- Stronger token/session hardening.
- CI workflow.
- Production-grade environment management.

## Phase 2: HMS Operations

Status: functional MVP.

Completed:

- Room types and rooms.
- Guest profiles.
- Reservation creation.
- Availability checks.
- Check-in and checkout.
- Guest folios.
- Checkout creates housekeeping task.
- Completing housekeeping task returns room to available.
- Maintenance tickets with open/start/resolve/close/cancel workflow.
- Housekeeping escalation creates a maintenance ticket and moves the room offline.

Remaining:

- Broader booking modification workflow.
- Walk-in booking polish.
- Room transfer rate adjustment policy.

## Phase 3: Restaurant, POS, Inventory

Status: functional MVP.

Completed:

- Menu categories and menu items.
- Menu item image upload.
- Tables and order workflow.
- Kitchen tickets.
- Served order settlement.
- Room posting to guest folio.
- Inventory item linkage for menu items.
- Stock deduction from restaurant sales.
- Vendors, stock receiving, stock adjustments.
- Low-stock alerts and purchase movement history.
- Purchase order workflow with draft/order/receive/cancel/pay actions.
- Purchase order receiving creates stock movements and accounting payables.
- Purchase order payment clears accounts payable to cash or bank.

Remaining:

- Split/merged bills.
- Table transfer.
- Complimentary/void approvals.
- Recipe/BOM costing.

## Phase 4: Accounting ERP

Status: functional MVP.

Completed:

- Chart of accounts.
- Journal entries and lines.
- Balanced posting service.
- Room checkout postings.
- Restaurant settlement postings.
- Inventory purchase postings.
- Purchase order vendor payment postings.
- Accounting summary dashboard.
- Journal source/status/date filters.
- Expandable journal line details.

Remaining:

- Fiscal periods.
- Trial balance.
- Profit and loss.
- Balance sheet.
- Tax configuration.
- Vendor bills.

## Phase 5: HRMS, CRM, Reporting

Status: reporting and HRMS shift/attendance MVPs started; CRM is pending.

Completed:

- Basic reports page.
- Occupancy report.
- Revenue report.
- Restaurant sales report.
- Inventory report.
- Employee records.
- Employee status tracking.
- Department/designation basics.
- Shift setup.
- Attendance scheduling.
- Clock-in/clock-out tracking.

Next:

- PDF exports for payslips and management summaries.
- Guest communication timeline and follow-up reminders.

## Phase 6: Scale And Integrations

Status: future.

Planned:

- Multi-property support.
- OTA integrations.
- Payment gateways.
- Nepal gateways: Khalti/eSewa.
- SMS/WhatsApp/email notifications.
- Object storage for media.
- Sentry and structured logging.
- Backups and restore procedure.

## Recommended Immediate Next Step

Resume with **PDF exports or guest communication timeline**.

Suggested order:

1. Commit the current connected MVP checkpoint if it has not been committed.
2. Add PDF payslips and management summaries.
3. Add guest communication timeline and follow-up reminders.
