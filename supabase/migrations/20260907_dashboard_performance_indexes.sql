-- Índices de leitura para os filtros e agregações do Dashboard.
-- Não altera dados nem políticas RLS existentes.

create index if not exists service_orders_dashboard_created_at_idx
  on public.service_orders (created_at desc);

create index if not exists service_orders_dashboard_completed_at_idx
  on public.service_orders (completed_at desc)
  where completed_at is not null;

create index if not exists quote_requests_dashboard_created_at_idx
  on public.quote_requests (created_at desc);

create index if not exists customers_dashboard_created_at_idx
  on public.customers (created_at desc);

create index if not exists appointments_dashboard_date_idx
  on public.appointments (appointment_date);

create index if not exists inventory_items_dashboard_alerts_idx
  on public.inventory_items (is_active, quantity);

create index if not exists employees_dashboard_active_idx
  on public.employees (is_active);
