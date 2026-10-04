begin;

create table if not exists public.queue_integration_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  require_code_for_orders boolean not null default false,
  reservation_ttl_seconds integer not null default 600
    check (reservation_ttl_seconds between 60 and 3600),
  outage_policy text not null default 'manager_override'
    check (outage_policy in ('block', 'manager_override', 'allow')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.queue_integration_settings enable row level security;

drop policy if exists queue_integration_settings_select on public.queue_integration_settings;
create policy queue_integration_settings_select
on public.queue_integration_settings
for select to authenticated
using (private.can_access_organization(organization_id));

drop policy if exists queue_integration_settings_insert on public.queue_integration_settings;
create policy queue_integration_settings_insert
on public.queue_integration_settings
for insert to authenticated
with check (
  private.can_access_organization(organization_id)
  and private.has_effective_organization_permission(organization_id, 'settings.update')
);

drop policy if exists queue_integration_settings_update on public.queue_integration_settings;
create policy queue_integration_settings_update
on public.queue_integration_settings
for update to authenticated
using (
  private.can_access_organization(organization_id)
  and private.has_effective_organization_permission(organization_id, 'settings.update')
)
with check (
  private.can_access_organization(organization_id)
  and private.has_effective_organization_permission(organization_id, 'settings.update')
);

revoke all on public.queue_integration_settings from public, anon;
grant select, insert, update on public.queue_integration_settings to authenticated;
grant select, insert, update, delete on public.queue_integration_settings to service_role;

create or replace function private.touch_queue_integration_settings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  new.updated_by := auth.uid();
  return new;
end
$$;

revoke all on function private.touch_queue_integration_settings() from public, anon, authenticated;

drop trigger if exists queue_integration_settings_touch on public.queue_integration_settings;
create trigger queue_integration_settings_touch
before insert or update on public.queue_integration_settings
for each row execute function private.touch_queue_integration_settings();

create table if not exists public.queue_os_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null default 'fila-eletronica-artvideo',
  external_ticket_id uuid not null,
  ticket_number text not null check (char_length(ticket_number) between 1 and 40),
  service_type_name text,
  service_priority text,
  external_reservation_token uuid not null unique,
  reserved_by uuid not null references auth.users(id) on delete restrict,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  state text not null default 'reserved'
    check (state in ('reserved', 'used', 'released', 'expired')),
  used_at timestamptz,
  external_sync_status text not null default 'pending'
    check (external_sync_status in ('pending', 'synced', 'failed')),
  external_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists queue_os_reservations_active_idx
  on public.queue_os_reservations (organization_id, state, expires_at);
create index if not exists queue_os_reservations_reserved_by_idx
  on public.queue_os_reservations (reserved_by, state, expires_at);
create unique index if not exists queue_os_reservations_ticket_active_uidx
  on public.queue_os_reservations (organization_id, external_ticket_id)
  where state in ('reserved', 'used');

alter table public.queue_os_reservations enable row level security;

drop policy if exists queue_os_reservations_no_direct_access on public.queue_os_reservations;
create policy queue_os_reservations_no_direct_access
on public.queue_os_reservations
for all to authenticated
using (false)
with check (false);

revoke all on public.queue_os_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.queue_os_reservations to service_role;

alter table public.service_orders
  add column if not exists queue_reservation_id uuid
    references public.queue_os_reservations(id) on delete restrict,
  add column if not exists queue_ticket_id uuid,
  add column if not exists queue_ticket_number text,
  add column if not exists queue_override_reason text,
  add column if not exists queue_override_by uuid
    references auth.users(id) on delete set null;

create unique index if not exists service_orders_queue_reservation_uidx
  on public.service_orders(queue_reservation_id)
  where queue_reservation_id is not null;

do $$
begin
  alter table public.service_orders
    add constraint service_orders_queue_ticket_number_length_check
    check (queue_ticket_number is null or char_length(queue_ticket_number) between 1 and 40);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.service_orders
    add constraint service_orders_queue_override_reason_length_check
    check (queue_override_reason is null or char_length(queue_override_reason) <= 500);
exception when duplicate_object then null;
end
$$;

create or replace function private.claim_queue_os_reservation(
  p_organization_id uuid,
  p_reservation_id uuid,
  p_override_reason text default null
)
returns table (
  reservation_id uuid,
  external_ticket_id uuid,
  ticket_number text,
  service_type_name text,
  service_priority text,
  was_override boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.queue_integration_settings%rowtype;
  v_reservation public.queue_os_reservations%rowtype;
  v_override_reason text := nullif(pg_catalog.btrim(p_override_reason), '');
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.can_access_organization(p_organization_id)
     or not private.has_effective_organization_permission(p_organization_id, 'orders.create') then
    raise exception 'Sem permissão para criar OS nesta empresa.' using errcode = '42501';
  end if;

  select settings.*
    into v_settings
  from public.queue_integration_settings settings
  where settings.organization_id = p_organization_id;

  if p_reservation_id is not null then
    update public.queue_os_reservations reservation
       set state = 'used',
           used_at = pg_catalog.clock_timestamp(),
           updated_at = pg_catalog.clock_timestamp()
     where reservation.id = p_reservation_id
       and reservation.organization_id = p_organization_id
       and reservation.reserved_by = v_user_id
       and reservation.state = 'reserved'
       and reservation.expires_at > pg_catalog.clock_timestamp()
    returning reservation.* into v_reservation;

    if not found then
      raise exception 'O código da fila expirou, já foi usado ou não pertence a esta sessão.'
        using errcode = 'P0001';
    end if;

    return query
      select v_reservation.id,
             v_reservation.external_ticket_id,
             v_reservation.ticket_number,
             v_reservation.service_type_name,
             v_reservation.service_priority,
             false;
    return;
  end if;

  if not found or not v_settings.enabled or not v_settings.require_code_for_orders then
    return query select null::uuid, null::uuid, null::text, null::text, null::text, false;
    return;
  end if;

  if v_settings.outage_policy = 'allow' then
    if v_override_reason is null then
      raise exception 'Informe o motivo para abrir a OS sem o código da fila.'
        using errcode = 'P0001';
    end if;
    return query select null::uuid, null::uuid, null::text, null::text, null::text, true;
    return;
  end if;

  if v_settings.outage_policy = 'manager_override'
     and private.has_effective_organization_permission(p_organization_id, 'settings.update') then
    if v_override_reason is null then
      raise exception 'Informe o motivo da liberação excepcional sem código da fila.'
        using errcode = 'P0001';
    end if;
    return query select null::uuid, null::uuid, null::text, null::text, null::text, true;
    return;
  end if;

  raise exception 'Código da fila obrigatório para abrir uma nova OS.'
    using errcode = 'P0001';
end
$$;

revoke all on function private.claim_queue_os_reservation(uuid, uuid, text)
  from public, anon;
grant execute on function private.claim_queue_os_reservation(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.create_service_order_atomic(
  p_order_id uuid,
  p_organization_id uuid,
  p_payload jsonb,
  p_technician_ids uuid[] default '{}'::uuid[],
  p_seller_ids uuid[] default '{}'::uuid[],
  p_technical_values jsonb default '[]'::jsonb,
  p_media_links jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.service_orders%rowtype;
  v_order public.service_orders%rowtype;
  v_value jsonb;
  v_employee_id uuid;
  v_media_id uuid;
  v_sort_order integer;
  v_queue record;
  v_override_reason text := nullif(pg_catalog.btrim(p_payload->>'queue_override_reason'), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_order_id is null or p_organization_id is null then
    raise exception 'Identificador da OS e empresa são obrigatórios.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload da OS inválido.' using errcode = '22023';
  end if;

  select service_order.*
    into v_order
  from public.service_orders service_order
  where service_order.id = p_order_id
    and service_order.organization_id = p_organization_id;

  if found then
    return jsonb_build_object(
      'id', v_order.id,
      'os_number', v_order.os_number,
      'external_os_number', v_order.external_os_number,
      'queue_ticket_number', v_order.queue_ticket_number,
      'idempotent_replay', true
    );
  end if;

  select *
    into v_source
  from jsonb_populate_record(null::public.service_orders, p_payload);

  select *
    into v_queue
  from private.claim_queue_os_reservation(
    p_organization_id,
    v_source.queue_reservation_id,
    v_override_reason
  );

  insert into public.service_orders (
    id, organization_id, service_id, general_service_id, service_type_id,
    seller_id, estimated_price, status_id, situation_id, customer_id,
    assigned_to, technician_id, equipment_type_id, equipment_brand_id,
    equipment_model_id, brand_id, product_id, model, serial_number,
    external_os_number, accessories, equipment_condition, priority,
    scheduled_at, started_at, completed_at, internal_notes, customer_notes,
    order_type, service_zip_code, service_state, service_city,
    service_neighborhood, service_street, service_number, service_complement,
    service_address_source, service_customer_address_id,
    queue_reservation_id, queue_ticket_id, queue_ticket_number,
    queue_override_reason, queue_override_by
  ) values (
    p_order_id, p_organization_id, v_source.service_id, v_source.general_service_id,
    v_source.service_type_id, v_source.seller_id, v_source.estimated_price,
    v_source.status_id, v_source.situation_id, v_source.customer_id,
    (select auth.uid()), v_source.technician_id, v_source.equipment_type_id,
    v_source.equipment_brand_id, v_source.equipment_model_id, v_source.brand_id,
    v_source.product_id, v_source.model, v_source.serial_number,
    v_source.external_os_number, v_source.accessories, v_source.equipment_condition,
    coalesce(v_source.priority, 'normal'), v_source.scheduled_at,
    v_source.started_at, v_source.completed_at, v_source.internal_notes,
    v_source.customer_notes, v_source.order_type, v_source.service_zip_code,
    v_source.service_state, v_source.service_city, v_source.service_neighborhood,
    v_source.service_street, v_source.service_number, v_source.service_complement,
    v_source.service_address_source, v_source.service_customer_address_id,
    v_queue.reservation_id, v_queue.external_ticket_id, v_queue.ticket_number,
    case when coalesce(v_queue.was_override, false) then v_override_reason else null end,
    case when coalesce(v_queue.was_override, false) then (select auth.uid()) else null end
  )
  returning * into v_order;

  if jsonb_typeof(coalesce(p_technical_values, '[]'::jsonb)) <> 'array' then
    raise exception 'Campos técnicos inválidos.' using errcode = '22023';
  end if;

  for v_value in
    select value from jsonb_array_elements(coalesce(p_technical_values, '[]'::jsonb))
  loop
    if nullif(v_value->>'technical_field_id', '') is null then
      raise exception 'Campo técnico sem identificador.' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.technical_fields technical_field
      where technical_field.id = (v_value->>'technical_field_id')::uuid
        and technical_field.organization_id = p_organization_id
    ) then
      raise exception 'Campo técnico não pertence à empresa da OS.' using errcode = '42501';
    end if;

    insert into public.service_order_technical_values (
      organization_id, service_order_id, technical_field_id,
      field_key_snapshot, label_snapshot, field_type_snapshot,
      value_text, value_number
    ) values (
      p_organization_id, p_order_id,
      (v_value->>'technical_field_id')::uuid,
      v_value->>'field_key_snapshot',
      v_value->>'label_snapshot',
      v_value->>'field_type_snapshot',
      nullif(v_value->>'value_text', ''),
      case
        when v_value->>'value_number' is null or v_value->>'value_number' = '' then null
        else (v_value->>'value_number')::numeric
      end
    );
  end loop;

  foreach v_employee_id in array coalesce(p_technician_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.employees employee
      where employee.id = v_employee_id
        and employee.organization_id = p_organization_id
        and coalesce(employee.is_active, true)
    ) then
      raise exception 'Técnico selecionado não pertence à empresa ou está inativo.'
        using errcode = '42501';
    end if;

    insert into public.service_order_technicians (
      organization_id, service_order_id, employee_id
    ) values (
      p_organization_id, p_order_id, v_employee_id
    );
  end loop;

  foreach v_employee_id in array coalesce(p_seller_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.employees employee
      where employee.id = v_employee_id
        and employee.organization_id = p_organization_id
        and coalesce(employee.is_active, true)
    ) then
      raise exception 'Vendedor selecionado não pertence à empresa ou está inativo.'
        using errcode = '42501';
    end if;

    insert into public.service_order_sellers (
      organization_id, service_order_id, employee_id
    ) values (
      p_organization_id, p_order_id, v_employee_id
    );
  end loop;

  if jsonb_typeof(coalesce(p_media_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de imagens inválida.' using errcode = '22023';
  end if;

  for v_value in
    select value from jsonb_array_elements(coalesce(p_media_links, '[]'::jsonb))
  loop
    if nullif(v_value->>'media_id', '') is null then
      raise exception 'Imagem sem identificador.' using errcode = '22023';
    end if;

    v_media_id := (v_value->>'media_id')::uuid;
    v_sort_order := coalesce((v_value->>'sort_order')::integer, 0);

    if not exists (
      select 1 from public.media media
      where media.id = v_media_id
        and media.organization_id = p_organization_id
    ) then
      raise exception 'Imagem não pertence à empresa da OS.' using errcode = '42501';
    end if;

    insert into public.service_order_media (
      organization_id, service_order_id, media_id, sort_order
    ) values (
      p_organization_id, p_order_id, v_media_id, v_sort_order
    );
  end loop;

  return jsonb_build_object(
    'id', v_order.id,
    'os_number', v_order.os_number,
    'external_os_number', v_order.external_os_number,
    'queue_ticket_number', v_order.queue_ticket_number,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.create_service_order_atomic(
  uuid, uuid, jsonb, uuid[], uuid[], jsonb, jsonb
) from public, anon;

grant execute on function public.create_service_order_atomic(
  uuid, uuid, jsonb, uuid[], uuid[], jsonb, jsonb
) to authenticated;

notify pgrst, 'reload schema';

commit;
