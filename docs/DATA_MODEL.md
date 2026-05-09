# Data Model Blueprint

## Shared Public Schema

### tenants_tenant

- `id`
- `schema_name`
- `name`
- `status`
- `paid_until`
- `on_trial`
- `created_by`
- `description`
- `created_at`
- `updated_at`
- `deleted_at`
- `is_deleted`

### tenants_domain

- `id`
- `tenant_id`
- `domain`
- `is_primary`
- `created_at`
- `updated_at`

### platform_subscription_plan

- `id`
- `code`
- `name`
- `max_properties`
- `max_users`
- `max_rooms`
- `features`
- `price`
- `currency`
- `billing_interval`
- `is_active`

### platform_subscription

- `id`
- `tenant_id`
- `plan_id`
- `status`
- `starts_at`
- `ends_at`
- `trial_ends_at`
- `cancelled_at`

## Tenant Schema

### users_user

- `id`
- `email`
- `full_name`
- `phone`
- `password`
- `is_active`
- `is_staff`
- `is_tenant_admin`
- `last_login`
- `created_at`
- `updated_at`

### rbac_role

- `id`
- `name`
- `code`
- `description`
- `is_system`

### rbac_permission

- `id`
- `module`
- `resource`
- `action`
- `code`
- `description`

### rbac_role_permissions

- `id`
- `role_id`
- `permission_id`

### hotel_property

- `id`
- `name`
- `legal_name`
- `timezone`
- `currency`
- `address`
- `phone`
- `email`
- `tax_number`

### rooms_room_type

- `id`
- `name`
- `code`
- `base_occupancy`
- `max_occupancy`
- `base_rate`
- `description`

### rooms_room

- `id`
- `property_id`
- `room_type_id`
- `room_number`
- `floor`
- `status`
- `housekeeping_status`
- `maintenance_status`

### guests_guest

- `id`
- `first_name`
- `last_name`
- `email`
- `phone`
- `address`
- `id_type`
- `id_number`
- `nationality`
- `date_of_birth`

### bookings_reservation

- `id`
- `property_id`
- `guest_id`
- `status`
- `source`
- `check_in_date`
- `check_out_date`
- `adult_count`
- `child_count`
- `total_amount`
- `currency`

### bookings_reservation_room

- `id`
- `reservation_id`
- `room_id`
- `rate_plan_id`
- `nightly_rate`
- `tax_amount`
- `service_charge_amount`

### accounting_account

- `id`
- `code`
- `name`
- `account_type`
- `parent_id`
- `is_active`

### accounting_journal_entry

- `id`
- `entry_number`
- `entry_date`
- `description`
- `source_module`
- `source_id`
- `status`
- `posted_by_id`
- `posted_at`

### accounting_journal_line

- `id`
- `journal_entry_id`
- `account_id`
- `department_id`
- `description`
- `debit`
- `credit`

### accounting_invoice

- `id`
- `guest_id`
- `reservation_id`
- `invoice_number`
- `invoice_date`
- `due_date`
- `subtotal`
- `tax_total`
- `service_charge_total`
- `grand_total`
- `status`

### accounting_payment

- `id`
- `invoice_id`
- `payment_method`
- `amount`
- `currency`
- `paid_at`
- `reference`

### restaurant_menu_category

- `id`
- `name`
- `code`
- `description`
- `display_order`
- `is_active`

### restaurant_menu_item

- `id`
- `category_id`
- `sku`
- `name`
- `description`
- `price`
- `tax_rate_id`
- `is_available`
- `preparation_station`
- `preparation_time_minutes`

### restaurant_menu_modifier_group

- `id`
- `name`
- `min_select`
- `max_select`
- `is_required`

### restaurant_menu_modifier

- `id`
- `modifier_group_id`
- `name`
- `price_delta`
- `is_active`

### restaurant_table

- `id`
- `property_id`
- `table_number`
- `section`
- `capacity`
- `status`

### restaurant_dining_session

- `id`
- `table_id`
- `guest_id`
- `reservation_id`
- `opened_by_id`
- `status`
- `opened_at`
- `closed_at`

### restaurant_order

- `id`
- `dining_session_id`
- `order_number`
- `order_type`
- `waiter_id`
- `status`
- `subtotal`
- `tax_total`
- `service_charge_total`
- `discount_total`
- `grand_total`

### restaurant_order_line

- `id`
- `order_id`
- `menu_item_id`
- `quantity`
- `unit_price`
- `tax_amount`
- `discount_amount`
- `notes`
- `status`

### restaurant_kitchen_ticket

- `id`
- `order_id`
- `ticket_number`
- `station`
- `status`
- `sent_at`
- `started_at`
- `completed_at`

### restaurant_kitchen_ticket_line

- `id`
- `ticket_id`
- `order_line_id`
- `quantity`
- `status`

### inventory_vendor

- `id`
- `name`
- `email`
- `phone`
- `address`
- `tax_number`

### inventory_item

- `id`
- `sku`
- `name`
- `category`
- `unit`
- `cost_price`
- `reorder_level`
- `is_active`

### inventory_stock_movement

- `id`
- `item_id`
- `movement_type`
- `quantity`
- `unit_cost`
- `source_module`
- `source_id`
- `occurred_at`

### hrms_employee

- `id`
- `user_id`
- `employee_code`
- `department_id`
- `designation`
- `hire_date`
- `status`
- `salary_amount`

## Cross-Cutting Tables

### audit_audit_log

- `id`
- `actor_id`
- `action`
- `module`
- `resource_type`
- `resource_id`
- `ip_address`
- `user_agent`
- `metadata`
- `created_at`

### events_domain_event

- `id`
- `event_type`
- `aggregate_type`
- `aggregate_id`
- `payload`
- `status`
- `created_at`
- `processed_at`

## Indexing Notes

- Index all foreign keys.
- Index `created_at` for reporting-heavy tables.
- Index reservation date ranges by room/property.
- Index journal lines by account and journal date.
- Index audit logs by actor, module, resource, and created date.
- Keep high-volume event/audit tables partitioning-ready by date.
