# Implementation Roadmap

## Current Project Stage

The project is now a connected development-stage hospitality ERP. It is suitable for local testing and development previews, not production tenant data.

Checkpoint note:

- Current checkpoint includes the actionable notification center, dashboard follow-up panel, sidebar badge, operational trigger slice, provider adapter foundation, tenant notification settings, retry/cancel delivery controls, SMS/WhatsApp credential setup with test delivery diagnostics, guest follow-up reminders, and payment reconciliation exports/drill-down links.
- Notification tests, Django check, migration check, and frontend TypeScript checks are passing locally. Frontend Vite output still hits the existing Windows `EPERM` writing `frontend/dist/assets`.
- Recommended continuation: Stripe or another international payment provider sandbox, or OTA channel sync foundation.

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
- Guest follow-up reminders linked to guests/bookings with complete, snooze, and cancel actions.
- Checkout-to-housekeeping automation.
- Housekeeping task workflow and room readiness updates.
- Maintenance tickets with room downtime status, resolution workflow, and housekeeping escalation.
- Restaurant menu, tables, order workflow, kitchen tickets, settlement.
- Restaurant room posting into guest folios.
- POS facility/amenity catalog and in-house guest facility charge posting.
- Inventory vendors, items, purchase orders, stock receiving, adjustments, low-stock alerts, movement history.
- Restaurant inventory deduction on settled orders.
- Accounting chart of accounts, journal entries, automated postings, summary view, and journal filters.
- Basic operational Reports for occupancy, revenue, restaurant sales, and inventory.
- CSV exports for operational reports and payroll.
- Printable management summary PDF export from Reports.
- Basic HRMS employee records.
- HRMS shifts and attendance with clock-in/clock-out workflow.
- Payroll periods, generated draft payroll runs, approval/posting status, payslip details, and accounting settlement posting.
- Printable payroll payslips with browser Save as PDF support.
- Payroll reversal workflow with reversing accounting journals.
- Attendance exception report for late, absent, half-day, and missing clock-out records.
- Department-level labor cost report with period filter, CSV export, and printable PDF view.
- Audit Logs page with action/module filters and field-change summaries.
- Notifications foundation with tenant notification events, templates, delivery status, retry metadata, API endpoints, booking confirmation logging, manager/admin notification center UI, dashboard needs-attention panel, sidebar open-count badge, operational triggers for low stock, payroll posting, and housekeeping escalation, acknowledge/resolve/reopen follow-up states, provider adapter foundation, tenant notification settings, masked SMS/WhatsApp credentials, test delivery diagnostics, and retry/cancel delivery controls.
- Payment abstraction foundation with tenant-scoped payment intents, provider references, status transitions, idempotent callback handling, RBAC, API endpoints, and Payment Intents UI.
- Khalti/eSewa sandbox initiation/verification foundation with tenant-scoped masked settings, Khalti lookup, eSewa signed form payloads, and signature verification.
- Payment settlement reconciliation for successful provider payment intents into guest folios, restaurant orders, and existing accounting posting services.
- Payment reconciliation reporting and operator workflow with summary API, filters, attention counts, follow-up review/resolve actions, and reviewer tracking.
- Provider references on folio PDFs, POS receipts, cashier close report rows, revenue/cashier reports, and management summaries.
- Payment reconciliation exports and drill-down links from payment intents to POS folio/order context.

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
- Facility and amenity charge catalog with folio posting from POS.
- Item-quantity split bills.
- Active dine-in table transfer.
- Void, discount, and complimentary approval workflow.
- Menu modifiers with line-level price impact.
- Recipe/BOM costing with multi-ingredient stock deduction.
- Inventory item linkage for menu items.
- Stock deduction from restaurant sales.
- Vendors, stock receiving, stock adjustments.
- Low-stock alerts and purchase movement history.
- Purchase order workflow with draft/order/receive/cancel/pay actions.
- Purchase order receiving creates stock movements and accounting payables.
- Purchase order payment clears accounts payable to cash or bank.
- Merged bills.
- Amount-based split payments.
- Restaurant tax and service-charge configuration.
- Restaurant receipt numbering and reprint audit trail.
- Cash drawer reconciliation by payment row and cashier shift.
- POS operational reports for cashier exceptions.

Remaining:

- Broader POS manager analytics.

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
- Guest communication timeline and follow-up reminders.

Next:

- Real SMS/WhatsApp provider credential setup.
- Real SMS/WhatsApp provider credential setup.

## Phase 6: Scale And Integrations

Status: future.

Planned:

- Multi-property support.
- OTA integrations.
- Payment gateways.
- Payment abstraction foundation. Done.
- Khalti/eSewa sandbox foundation. Done.
- Payment settlement reconciliation. Done.
- Payment reconciliation reports and operator workflow. Done.
- Provider references on receipts and management reports. Done.
- Payment reconciliation exports and receipt drill-down links. Done.
- Nepal gateways: Khalti/eSewa.
- SMS/WhatsApp/email notifications.
- Object storage for media.
- Sentry and structured logging.
- Backups and restore procedure.

## Recommended Immediate Next Step

Resume with **real SMS/WhatsApp provider credential setup**.

Suggested order:

1. Add tenant-scoped SMS/WhatsApp credential fields with masked serializer output.
2. Implement provider adapters and test-send actions.
3. Add delivery diagnostics and keep providers disabled until credentials are configured.
4. Preserve in-app notifications as the reliable fallback.
