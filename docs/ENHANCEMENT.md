# Hotel & Restaurant Management System Enhancements

> Engineering execution plan: see `docs/ENGINEERING_ROADMAP.md`.

## Overview

This document tracks product enhancements needed to move the hotel and restaurant management system toward international hospitality standards such as PMS/POS systems like Opera, Amadeus, and Micros.

The system is now a connected development-stage hospitality ERP with strong tenant isolation, operational modules, accounting flows, POS workflows, HRMS/payroll, reporting, audit logs, and actionable manager notifications.

## Current System Strengths

- Multi-tenant SaaS architecture with PostgreSQL schema isolation.
- JWT authentication, tenant-aware API access, and role-based permissions.
- Comprehensive modules: Bookings, Accounting, Inventory, HRMS, Housekeeping, Maintenance, Restaurant/POS, Reports, Audit, and Notifications.
- Automated workflows such as checkout-to-housekeeping, room transfer housekeeping tasks, POS-to-folio posting, payroll accounting postings, and operational notification triggers.
- Double-entry accounting with source tracking.
- Manager/admin notification center with acknowledge, resolve, reopen, dashboard attention panel, and sidebar open-count badge.

## Key Gaps

- Payment gateway production credentials and live-money provider rollout are still pending; Khalti/eSewa sandbox adapters are implemented.
- SMS/WhatsApp credential setup and Twilio-style provider adapters are implemented; production vendor account rollout and live delivery monitoring are still pending.
- OTA channel sync foundation is implemented with mappings, availability/rate sync jobs, idempotent webhook capture, Zodomus adapter calls, sandbox test-reservation tooling, inbound reservation import review with conflict detection, cancellation/modification reconciliation, manager notifications, and audit logging.
- Security/compliance needs production hardening for PCI-DSS, GDPR, throttling, observability, and secrets management.
- Staff mobile/PWA workflows are still pending.
- Advanced analytics and multi-property operations are still future work.

## Enhancement Roadmap

### Phase 1: Core Infrastructure

- [x] Multi-tenant schema foundation.
- [x] Local development scripts and bootstrap flow.
- [x] JWT auth and current-user flow.
- [x] RBAC permissions and role seeding.
- [x] Protected frontend routes.
- [x] Tenant-scoped audit logging.
- [x] Celery foundation for async tasks.
- [x] Night audit automation command.
- [x] Notifications app foundation with templates, delivery state, retry metadata, and API endpoints.
- [x] Actionable notification center for admins/managers.
- [x] Dashboard needs-attention panel and sidebar notification badge.
- [ ] CI workflow.
- [ ] Stronger production token/session hardening.
- [ ] Structured logging and Sentry-style observability.

### Phase 2: Functional Expansions

- [x] Room, room type, guest, reservation, check-in, checkout, and folio workflows.
- [x] Availability calendar.
- [x] Booking modification foundation.
- [x] Stay extension workflow.
- [x] Room transfer workflow.
- [x] Guest history/CRM profile with notes, preferences, stay history, and VIP level.
- [x] Checkout-to-housekeeping automation.
- [x] Maintenance workflow and housekeeping escalation.
- [x] Rate plans and packages.
- [x] Loyalty program and guest points foundation.
- [x] Restaurant/POS advanced workflows: modifiers, split bills, table transfer/merge, approvals, cashier shifts, receipt numbering, reprint audit, taxes, service charge, reconciliation, and exception reports.
- [x] Inventory stock receiving, adjustments, purchase orders, low-stock alerts, and restaurant inventory deduction.
- [x] HRMS employee, shift, attendance, payroll, payslip, reversal, labor report, and attendance exception report.
- [x] Operational reports with CSV/PDF outputs.
- [x] Provider-backed notification delivery adapter foundation.
- [x] Tenant-scoped SMS/WhatsApp credential setup with masked settings and test delivery diagnostics.
- [x] Retry/cancel actions for notification deliveries.
- [x] Payment abstraction foundation with payment intent records, provider references, status transitions, idempotent callback handling, RBAC, API endpoints, and Payment Intents UI.
- [x] Guest communication follow-up reminders.
- [x] Walk-in booking polish.
- [x] Checkout exception handling for missing/closed folios and unresolved postings.
- [x] Room transfer rate adjustment policy.
- [x] Broader POS manager analytics.

### Phase 3: Advanced Features

- [x] OTA channel sync foundation with mappings, availability/rate sync jobs, and webhook idempotency.
- [x] Zodomus OTA provider adapter foundation.
- [x] Zodomus sandbox testing flow with credential check, room/rate mapping forms, ARI sync actions, and test reservation action.
- [x] OTA inbound reservation import review with conflict detection.
- [x] OTA cancellation/modification reconciliation for accepted imports.
- [x] OTA manager notifications and audit trail for review actions.
- [x] Nepal payment providers: Khalti/eSewa sandbox initiation/verification foundation.
- [x] International payment provider sandbox.
- [x] Fiscal periods, trial balance, profit and loss, and balance sheet.
- [ ] Revenue forecasting and analytics.
- [ ] Multi-property support.
- [ ] Staff mobile/PWA workflows.
- [ ] Full compliance hardening for PCI-DSS and GDPR.
- [ ] Object storage for media.
- [ ] Backups and restore procedure.

## Detailed Improvement Tracker

### 1. System Flow and User Experience

#### Unified Dashboard

- [x] Live dashboard with occupancy, arrivals, departures, housekeeping, maintenance, revenue, inventory, and operational signals.
- [x] Dashboard needs-attention panel backed by open manager notifications.
- [ ] Add richer charts and time-series trend cards.

#### Workflow Automation

- [x] Checkout creates housekeeping task.
- [x] Housekeeping escalation creates maintenance ticket.
- [x] Payroll posting creates accounting journal and notification event.
- [x] Low-stock conditions create manager notification events.
- [ ] Add scheduled automation for recurring notifications and night audit execution.

#### Guest Journey Optimization

- [x] Guest profile with stay history, folio value, VIP level, preferences, and internal notes.
- [x] Guest communication follow-up reminders.
- [x] Walk-in booking polish with faster front-desk mode switching, guest safety checks, room readiness context, and immediate folio review.
- [x] Checkout exception handling with server-backed readiness checks for missing/closed folios and unresolved restaurant postings.
- [x] Room transfer rate adjustment policy with folio charge/credit handling.
- [ ] Self-check-in or QR check-in.
- [ ] Guest feedback collection.

#### Staff Mobile Access

- [ ] Mobile/PWA workflow for housekeeping and maintenance.
- [ ] Mobile/PWA workflow for restaurant floor staff.

### 2. Hospitality Functional Standards

#### OTA Integration

- [x] OTAChannel model, views, serializers, and URLs.
- [x] OTA channel room/rate mappings, sync job history, and webhook event idempotency.
- [x] Integrations UI for channel setup, availability/rate sync actions, and webhook diagnostics.
- [x] Zodomus provider-specific channel sync foundation.
- [x] Zodomus sandbox testing controls for `/channels`, `/availability`, `/rates`, and `/reservations-createtest`.
- [x] Webhook idempotency foundation.
- [x] Rate and inventory push workflow foundation.
- [x] Conflict handling foundation for OTA reservation imports.
- [x] OTA cancellation/modification reconciliation for confirmed bookings.
- [x] OTA review notifications and audit trail.

#### Rate Management and Packages

- [x] RatePlan and Package models, serializers, viewsets, and URLs.
- [ ] Dynamic pricing rules.
- [ ] Package booking polish and reporting.

#### Night Audit

- [x] `night_audit` management command.
- [ ] Scheduler setup.
- [ ] Night audit review UI and exception handling.

#### Loyalty and CRM

- [x] LoyaltyProgram and GuestPoints foundation.
- [x] Guest history/CRM profile.
- [x] Guest follow-up reminder records with complete, snooze, and cancel actions.
- [ ] Guest communication timeline polish and campaign-ready segmentation.
- [ ] Campaign-ready segmentation.

#### Advanced POS Features

- [x] Menu modifiers with line-level price impact.
- [x] Item-quantity split bills and amount-based split payments.
- [x] Active dine-in table transfer and table merge.
- [x] Void, discount, and complimentary approval workflow.
- [x] Kitchen display polish with ticket age, filters, modifiers, notes, and order context.
- [x] Cashier shift summary and close report.
- [x] POS settlement for restaurant orders and room folios.
- [x] Restaurant tax and service-charge configuration with receipt and accounting breakdowns.
- [x] Restaurant receipt numbering and reprint audit trail.
- [x] Cash drawer reconciliation by payment row and cashier shift.
- [x] POS operational reports for cashier exceptions.
- [x] Broader POS manager analytics.

### 3. Security Enhancements

#### PCI-DSS Compliance

- [x] Payment abstraction and tokenized provider flow foundation.
- [ ] No raw card data storage.
- [x] Provider callback idempotency.

#### GDPR Compliance

- [ ] Data export.
- [ ] Data anonymization/deletion workflow.
- [ ] Retention policy design.

#### Rate Limiting and API Security

- [ ] Login throttling.
- [ ] Account lock policy.
- [ ] Consistent API error envelope.
- [ ] Refresh token rotation review.

### 4. Scalability and Performance

- [x] Celery task foundation.
- [ ] Redis setup guidance for Celery workers.
- [ ] Redis caching for selected high-read endpoints.
- [ ] Query/index review for high-volume operational tables.
- [ ] Production deployment hardening for workers, web processes, and static/media storage.

### 5. Code Quality and Maintainability

- [x] Focused backend tests for bookings, restaurant, inventory, HRMS, notifications, and RBAC slices.
- [x] Frontend TypeScript checks used during enhancement slices.
- [x] Roadmap and enhancement docs maintained as resume points.
- [ ] CI checks for backend tests and frontend build.
- [ ] API documentation UI.
- [ ] Pre-commit formatting/linting.

### 6. Integration Capabilities

#### Payment Gateways

- [x] Payment intent model.
- [x] Provider reference and status transitions.
- [x] Idempotent provider callback endpoint.
- [x] Khalti/eSewa sandbox.
- [x] Stripe or international provider sandbox.

#### Notifications

- [x] Notifications app with Celery delivery foundation.
- [x] Notification event/template API with delivery status and retry metadata.
- [x] Operational triggers for low stock, payroll posting, and housekeeping escalation.
- [x] Manager/admin notification center UI.
- [x] Acknowledge, resolve, and reopen follow-up states.
- [x] Dashboard needs-attention panel.
- [x] Sidebar open-count badge.
- [x] Provider adapter structure for email, SMS, WhatsApp, in-app, and system notifications.
- [x] Tenant notification delivery settings field.
- [x] Tenant-scoped SMS/WhatsApp credentials with masked serializer output.
- [x] SMS/WhatsApp test-send diagnostics from the notification center.
- [x] Retry/cancel actions for queued or failed provider deliveries.
- [x] Real SMS/WhatsApp vendor credential setup foundation.
- [ ] Production SMS/WhatsApp account rollout, delivery webhooks, and monitoring.

#### Third-Party APIs

- [x] Zodomus OTA provider client foundation.
- [x] Payment provider clients.
- [ ] SMS/WhatsApp provider clients.

#### Reporting Tools

- [x] Operational reports.
- [x] CSV exports.
- [x] Printable management summary PDF.
- [ ] Power BI or external BI API exposure.

## Current Checkpoint

- Actionable notification center UI is implemented.
- Dashboard needs-attention panel is implemented.
- Sidebar notification badge is implemented.
- Operational triggers are implemented for low stock, payroll posting, and housekeeping escalation.
- Manager/admin visibility and follow-up states are implemented.
- Provider adapter foundation, tenant notification delivery settings, and retry/cancel controls are implemented.
- Guest follow-up reminder records, APIs, dashboard surfacing, Notifications surfacing, guest profile surfacing, and reminder actions are implemented.
- Payment abstraction foundation is implemented with payment intents, provider/status transitions, callback idempotency, tenant API routes, RBAC, focused tests, and Payment Intents UI.
- Khalti/eSewa sandbox foundation is implemented with tenant-scoped masked settings, Khalti initiate/lookup adapters, eSewa signed form generation, eSewa callback signature verification, provider UI actions, migrations, and focused tests.
- Payment settlement reconciliation is implemented for successful payment intents linked to guest folios and restaurant orders, with idempotent settlement, accounting posting reuse, settlement status tracking, and Payment Intents UI reconciliation visibility.
- Payment reconciliation reports and operator workflow are implemented with filtered summaries by provider/status/settlement/follow-up state, attention counts, review/resolve actions, reviewer tracking, and Payment Intents UI filters.
- Provider references are surfaced on folio serializers/PDFs, restaurant order serializers, restaurant payment rows, cashier close report rows, POS payment receipts, revenue/cashier reports, and management summaries.
- Payment reconciliation exports and drill-down links are implemented with filtered UI CSV exports, server-side CSV export endpoint, and Payment Intents source links into POS folio/paid-order context.
- SMS/WhatsApp credential setup is implemented with masked tenant settings, Twilio-style SMS/WhatsApp adapters, admin test-send diagnostics, and notification center controls.
- OTA channel sync foundation is implemented with channel configuration, room/rate mappings, availability/rate payload jobs, Zodomus Basic Auth provider calls, sandbox test reservation tooling, idempotent webhook event capture, inbound reservation import conflict detection, accept/reject review, cancellation/modification reconciliation, manager notifications, audit logging, and Integrations UI.
- Stripe sandbox is implemented with tenant-scoped test settings, masked secret preservation, PaymentIntent creation/confirmation actions, and focused tests.
- Accounting statements are implemented with fiscal periods, close/reopen controls, trial balance, profit and loss, balance sheet APIs, and Accounting UI tabs.
- Accounting tax configuration is implemented with tax rate records, liability control account validation, API endpoints, focused tests, and an Accounting UI tab.
- Vendor bill capture and posting is implemented with draft bills, expense/asset lines, purchase tax handling, AP journal posting, closed-period protection, focused tests, and an Accounting UI tab.
- Broader POS manager analytics is implemented with sales trend, payment mix, top item, table/location performance, and exception summaries in the Restaurant UI.
- Walk-in booking polish is implemented with a faster front-desk mode, automatic today/tomorrow stay defaults, guest safety checks, room readiness context, and immediate folio review after check-in.
- Checkout exception handling is implemented with readiness APIs, checkout blocking for missing/closed folios and unresolved restaurant postings, and front-desk blocker visibility.
- Room transfer rate adjustment policy is implemented with keep-rate, upgrade-charge, complimentary-upgrade, and downgrade-credit options plus folio adjustment preview.
- Local verification completed with focused backend tests, migration check, tenant migrations, and frontend TypeScript check.

## Next Enhancement

Recommended next enhancement: **dynamic pricing rules**.

Suggested order:

1. Add accounting tax configuration. Done.
2. Add vendor bill capture and posting. Done.
3. Add broader POS manager analytics. Done.
