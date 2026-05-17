# Engineering Roadmap

## Purpose

This roadmap turns the enhancement vision into an engineering workflow. It is the working plan for stabilizing the platform, choosing the next feature slices, and keeping every change testable, tenant-aware, and easy to resume.

Use this document when deciding what to build next. Use `docs/ENHANCEMENT.md` for product ideas and industry-level ambitions.

## Current Baseline

Status: local development checkpoint stabilized.

Verified foundations:

- Local PostgreSQL works at `127.0.0.1:5432`.
- Local scripts can start/check the database, backend, and frontend.
- Django system check passes.
- Model migration state is clean.
- Tenant migrations apply with `migrate_schemas`.
- Frontend and backend respond locally.
- Authenticated bookings and folios endpoints return `200`.

Known local caveats:

- Docker is not currently available on PATH on the development machine.
- Redis is optional for normal web/API local development, but required for Celery workers.
- The repository has many uncommitted feature changes, so changes should be grouped and committed carefully.

## Operating Rules

Every feature slice should follow this workflow:

1. Confirm scope and affected modules.
2. Check current migration state with `makemigrations --check --dry-run`.
3. Implement backend model/service/API changes.
4. Add or update migrations.
5. Apply migrations with `migrate_schemas`.
6. Add focused backend tests for business rules and tenant behavior.
7. Implement frontend UI/API integration.
8. Run backend checks/tests and frontend build.
9. Update docs and this roadmap status.
10. Commit the slice with a clear message.

Definition of done for a slice:

- Backend API works for authenticated tenant users.
- Tenant data stays isolated.
- Migrations are committed and repeatable.
- Automated tests cover the core behavior.
- Frontend handles loading, empty, success, and error states.
- No new `makemigrations --check --dry-run` changes remain.
- Local startup scripts still work.

## Workstreams

### 1. Local Development And Platform Stability

Goal: make the project easy to run, test, and resume.

Status: in progress, high priority.

Completed:

- Shared local script environment.
- Local PostgreSQL startup/check script.
- Local PostgreSQL setup helper.
- Local backend/frontend script flow.
- Local backend startup now checks/starts database services before runserver.
- Native Windows backend runs use `127.0.0.1` instead of Docker-only `db`.
- Django tenant PostgreSQL backend patched for debug-mode psycopg 3 cursor recursion.
- Django admin and admin static files work locally without `collectstatic`.
- Frontend tenant settings requests include the tenant domain header.
- Frontend build output is treated as generated output instead of tracked source.
- Missing bookings and integrations migrations generated.
- Local README instructions updated.

Remaining:

- Add CI checks for backend tests and frontend build.
- Add optional Redis startup guidance for Celery development.
- Add a health-check command that verifies DB, backend, frontend, and key API endpoints.

Acceptance criteria:

- A new developer can run the app from the README without guessing.
- `scripts\start-local-all.cmd` works after dependencies and database are prepared.
- `scripts\bootstrap-local.cmd` is idempotent or clearly documents when it is safe to rerun.

### 2. Data Model And Migration Discipline

Goal: prevent runtime failures caused by model/schema drift.

Status: active guardrail for all future work.

Completed:

- Booking model forward references fixed.
- Missing booking migration added.
- Missing integration migration added.
- Current migration diff is clean.

Remaining:

- Review all newly added apps for migration completeness.
- Add tests or checks for tenant-schema migration coverage.
- Decide whether generated demo data should live in commands, fixtures, or factories.

Acceptance criteria:

- `makemigrations --check --dry-run` passes.
- `migrate_schemas` applies cleanly on an empty database.
- Tenant bootstrap creates a usable tenant without manual database edits.

### 3. PMS Core Operations

Goal: make reservations, rooms, guests, folios, housekeeping, and maintenance dependable.

Status: functional MVP, needs hardening.

Completed:

- Guest communication timeline with tenant-scoped API and guest profile UI.
- Reservation confirmation and guest folio PDF exports.
- Booking modification workflow for confirmed reservations.

Next slices:

1. Walk-in booking polish.
2. Room transfer rate adjustment policy.

Acceptance criteria:

- Reservation lifecycle is clear: create, modify, check in, extend, transfer, cancel, check out.
- Folio totals remain correct after every booking operation.
- Room status changes remain consistent with housekeeping and maintenance.
- User-facing errors are clear and actionable.

### 4. Restaurant And POS

Goal: move the restaurant module from basic order settlement to practical POS operations.

Status: functional MVP.

Next slices:

1. Split bills.
2. Table transfer.
3. Void and complimentary approvals.
4. Modifiers and item notes.
5. Recipe/BOM costing.

Acceptance criteria:

- Order totals, taxes, payments, and accounting postings remain balanced.
- Inventory deduction remains traceable.
- Room posting only targets active checked-in guests.
- Permission checks protect sensitive POS actions.

### 5. Accounting And Financial Control

Goal: make accounting outputs useful for management and audit.

Status: functional posting MVP.

Next slices:

1. Fiscal periods.
2. Trial balance.
3. Profit and loss report.
4. Balance sheet.
5. Tax configuration.
6. Vendor bills.

Acceptance criteria:

- Every posting is balanced.
- Accounting services, not views, create journal entries.
- Reports reconcile with source transactions.
- Closed fiscal periods prevent unsafe edits.

### 6. HRMS, Payroll, And Reports

Goal: harden staff operations and management reporting.

Status: MVP started.

Next slices:

1. PDF payslips.
2. Payroll approval and reversal rules.
3. Management summary PDF export.
4. Attendance exception reports.
5. Department-level labor cost reports.

Acceptance criteria:

- Payroll calculations are repeatable.
- Approved payroll cannot silently change.
- Exports match filtered screen data.
- Accounting settlement postings are traceable.

### 7. Integrations, Payments, And Notifications

Goal: add external connectivity without compromising security or tenant isolation.

Status: scaffolded, not production-ready.

Recommended order:

1. Notifications foundation: email templates, event log, retry status.
2. Payment abstraction: payment intent, provider reference, status transitions.
3. Nepal payment providers: Khalti/eSewa sandbox.
4. Stripe or international provider sandbox.
5. OTA channel sync foundation.

Acceptance criteria:

- No raw card data is stored.
- Provider callbacks are idempotent.
- Payment status changes create audit logs.
- External API credentials are tenant-scoped and not exposed to frontend clients.
- Failed notifications and sync jobs can be retried safely.

### 8. Security, Compliance, And Observability

Goal: prepare the platform for real tenant data.

Status: partial.

Next slices:

1. Consistent API error envelope.
2. Login throttling and account lock policy.
3. Refresh token rotation review.
4. Tenant-aware audit coverage review.
5. Sentry or structured logging.
6. GDPR export/anonymization design.

Acceptance criteria:

- Sensitive mutations are audited.
- API errors are predictable for the frontend.
- Logs contain enough context to debug without leaking secrets.
- Payment design remains PCI-aware.

## Recommended Execution Order

### Checkpoint A: Stabilize And Commit

Priority: in progress.

Tasks:

- Review local-dev script changes. Done.
- Review new migrations.
- Run backend check and migration check. Done.
- Run frontend build. Done.
- Align production deployment environment variables. Done.
- Add production smoke checklist. Done.
- Commit the stabilization checkpoint.

Exit criteria:

- The app starts locally from documented scripts.
- No pending migration diff.
- Bookings and folios still return `200`.

### Checkpoint B: Test Harness

Priority: next.

Tasks:

- Add focused tests for bookings, folios, rate plans, and tenant bootstrap.
- Add test coverage for the integration model migration/import path.
- Decide a minimal CI command set.

Exit criteria:

- `scripts\test-backend.cmd bookings tenants users` passes.
- The most recent 500-class regression would be caught by tests.

### Checkpoint C: First Product Slice

Priority: after tests.

Choose one:

- PDF payslips and management summaries.
- Guest communication timeline.
- Restaurant split bills.
- Payment abstraction foundation.

Recommendation:

Start with guest communication timeline if the goal is CRM and hotel operations. Start with payment abstraction if the goal is revenue collection. Start with split bills if the restaurant/POS workflow is the immediate demo priority.

## Local Command Reference

Start or check local database:

```cmd
scripts\start-local-db.cmd
```

Create local PostgreSQL database/user on a fresh machine:

```cmd
scripts\setup-local-postgres.cmd
```

Bootstrap schemas and demo data:

```cmd
scripts\bootstrap-local.cmd
```

Start backend and frontend:

```cmd
scripts\start-local-all.cmd
```

Run backend checks:

```cmd
venv\Scripts\python.exe backend\manage.py check
```

Check for missing migrations:

```cmd
venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
```

Apply tenant migrations:

```cmd
venv\Scripts\python.exe backend\manage.py migrate_schemas
```

Run backend tests:

```cmd
scripts\test-backend.cmd
```

Run the full local verification gate:

```cmd
scripts\verify-local.cmd
```

Skip the frontend production build when only checking backend health:

```cmd
scripts\verify-local.cmd -SkipFrontendBuild
```

Build frontend:

```cmd
cd frontend
npm.cmd run build
```

## Backlog Classification

Use these labels when turning roadmap items into tasks:

- `stability`: startup, migrations, tests, CI, local development.
- `pms`: bookings, guests, rooms, folios, housekeeping, maintenance.
- `pos`: restaurant, tables, orders, kitchen, settlement.
- `inventory`: stock, purchase orders, vendors, costing.
- `accounting`: journals, reports, fiscal periods, tax.
- `hrms`: employees, shifts, attendance, payroll.
- `crm`: guest history, loyalty, communication, feedback.
- `integration`: payments, OTA, SMS, email, third-party APIs.
- `security`: auth, permissions, audit, privacy, compliance.
- `frontend`: UI, UX, state handling, responsive behavior.

## Decision Log

Record major implementation decisions here as they are made.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-05-16 | Prefer native Windows scripts plus local PostgreSQL fallback for development. | Docker is not available on PATH in the current environment, but local PostgreSQL is installed and working. |
| 2026-05-16 | Add a separate engineering roadmap instead of replacing the enhancement document. | Keeps product vision separate from execution workflow. |
| 2026-05-17 | Keep local static serving separate from production manifest static files. | Local admin must work without `collectstatic`, while production should keep hashed static assets. |
| 2026-05-17 | Treat `frontend/dist/` as generated output. | Vite builds should be reproducible and should not create source-control churn. |
| 2026-05-17 | Let deployment platforms run `collectstatic` with production environment variables. | Docker image builds may not have deployment secrets or storage settings available. |
| 2026-05-17 | Deploy frontend preview through Vercel using repo-root `vercel.json`. | Keeps monorepo deployment explicit while preserving Vite SPA routing. |
