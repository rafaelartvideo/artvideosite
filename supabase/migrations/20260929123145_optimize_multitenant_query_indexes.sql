create index if not exists service_orders_org_created_idx
  on public.service_orders (organization_id, created_at desc);

create index if not exists service_orders_org_status_created_idx
  on public.service_orders (organization_id, status_id, created_at desc);

create index if not exists service_orders_org_situation_created_idx
  on public.service_orders (organization_id, situation_id, created_at desc);

create index if not exists service_orders_org_technician_created_idx
  on public.service_orders (organization_id, technician_id, created_at desc)
  where technician_id is not null;

create index if not exists service_orders_org_service_type_created_idx
  on public.service_orders (organization_id, service_type_id, created_at desc)
  where service_type_id is not null;

create index if not exists employees_org_active_full_name_idx
  on public.employees (organization_id, is_active, full_name);

create index if not exists service_order_part_requests_org_order_created_idx
  on public.service_order_part_requests (organization_id, service_order_id, created_at desc);

create index if not exists service_order_part_request_items_org_request_idx
  on public.service_order_part_request_items (organization_id, request_id);

create index if not exists appointments_org_date_idx
  on public.appointments (organization_id, appointment_date);

create index if not exists quote_requests_org_created_idx
  on public.quote_requests (organization_id, created_at desc);

drop index if exists public.appointments_dashboard_date_idx;
drop index if exists public.employees_dashboard_active_idx;
drop index if exists public.inventory_movements_item_created_idx;
drop index if exists public.quote_requests_dashboard_created_at_idx;
drop index if exists public.idx_role_permissions_permission;
drop index if exists public.idx_service_orders_tracking;
drop index if exists public.service_orders_dashboard_created_at_idx;
drop index if exists public.kv_store_529bf66c_key_idx1;
drop index if exists public.kv_store_529bf66c_key_idx2;
drop index if exists public.kv_store_529bf66c_key_idx3;
drop index if exists public.kv_store_529bf66c_key_idx4;
drop index if exists public.kv_store_529bf66c_key_idx5;
drop index if exists public.kv_store_529bf66c_key_idx6;

analyze public.service_orders;
analyze public.employees;
analyze public.service_order_part_requests;
analyze public.service_order_part_request_items;
analyze public.appointments;
analyze public.quote_requests;
