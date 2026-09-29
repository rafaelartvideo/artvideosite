begin;

select pg_advisory_xact_lock(hashtextextended('unionworld:order_monitoring_v1', 0));

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('orders.monitor.view', 'Monitorar ordens de serviço', 'Visualiza, em modo somente leitura, OS de tipos de atendimento monitorados nas empresas parceiras.', 'Ordens de Serviço', 950),
  ('orders.monitor.manage', 'Configurar monitoramento de OS', 'Define os tipos de atendimento das empresas parceiras cujas OS são monitoradas pela Union World.', 'Ordens de Serviço', 951)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

create or replace function private.is_platform_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select
    (p_key like 'organizations.%' and p_key <> 'organizations.audit.view')
    or p_key like 'integrations.%'
    or p_key like 'audit.%'
    or p_key like 'orders.monitor.%';
$$;

insert into public.role_permissions (role_id, permission_id)
select distinct source_access.role_id, target_permission.id
from public.role_permissions source_access
join public.permissions source_permission on source_permission.id = source_access.permission_id
join public.roles source_role on source_role.id = source_access.role_id
cross join public.permissions target_permission
where source_role.organization_id = public.platform_operator_organization_id()
  and source_permission.key = 'organizations.view'
  and target_permission.key = 'orders.monitor.view'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct source_access.role_id, target_permission.id
from public.role_permissions source_access
join public.permissions source_permission on source_permission.id = source_access.permission_id
join public.roles source_role on source_role.id = source_access.role_id
cross join public.permissions target_permission
where source_role.organization_id = public.platform_operator_organization_id()
  and source_permission.key = 'organizations.data_shares.manage'
  and target_permission.key in ('orders.monitor.view', 'orders.monitor.manage')
on conflict (role_id, permission_id) do nothing;

create unique index if not exists service_types_id_organization_uidx
  on public.service_types (id, organization_id);

create table if not exists public.service_type_monitoring (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_type_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, service_type_id),
  constraint service_type_monitoring_service_type_fk
    foreign key (service_type_id, organization_id)
    references public.service_types(id, organization_id)
    on delete restrict
);

create index if not exists service_type_monitoring_service_type_idx
  on public.service_type_monitoring(service_type_id);

alter table public.service_type_monitoring enable row level security;
revoke all on table public.service_type_monitoring from anon;
revoke all on table public.service_type_monitoring from public;
grant select on table public.service_type_monitoring to authenticated;

drop policy if exists service_type_monitoring_select on public.service_type_monitoring;
create policy service_type_monitoring_select
on public.service_type_monitoring
for select
to authenticated
using (
  private.is_organization_member(organization_id)
  or private.has_platform_permission('orders.monitor.view')
  or private.has_platform_permission('orders.monitor.manage')
);

create or replace function private.can_access_shared_organization_resource(
  p_organization_id uuid,
  p_resource_key text,
  p_required_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select
    p_organization_id is not null
    and (
      private.is_organization_member(p_organization_id)
      or (
        p_required_access_level in ('summary', 'read')
        and (
          exists (
            select 1
            from public.organizations target
            where target.id = p_organization_id
              and target.status = 'active'
              and private.has_platform_permission('organizations.view')
          )
          or exists (
            select 1
            from public.organization_data_shares data_share
            where data_share.child_organization_id = p_organization_id
              and private.is_platform_organization(data_share.parent_organization_id)
              and private.has_organization_permission(data_share.parent_organization_id, 'organizations.view')
              and data_share.resource_key = p_resource_key
              and case p_required_access_level
                when 'summary' then data_share.access_level in ('summary', 'read', 'manage')
                when 'read' then data_share.access_level in ('read', 'manage')
                else false
              end
          )
        )
      )
    );
$$;

comment on function private.can_access_shared_organization_resource(uuid, text, text) is
  'Compartilhamento entre empresas é somente leitura. Escrita operacional exige vínculo direto como membro da empresa alvo.';

create or replace function private.can_monitor_service_order(p_service_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select
    private.has_platform_permission('orders.monitor.view')
    and exists (
      select 1
      from public.service_orders service_order
      join public.service_type_monitoring monitoring
        on monitoring.organization_id = service_order.organization_id
       and monitoring.service_type_id = service_order.service_type_id
      join public.organizations organization
        on organization.id = service_order.organization_id
       and organization.status = 'active'
      where service_order.id = p_service_order_id
        and service_order.service_type_id is not null
        and private.is_organization_module_enabled(service_order.organization_id, 'orders')
    );
$$;

revoke all on function private.can_monitor_service_order(uuid) from public;
grant execute on function private.can_monitor_service_order(uuid) to authenticated;

create or replace function private.can_view_service_order(p_service_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and (
        private.can_monitor_service_order(service_order.id)
        or (
          private.is_organization_member(service_order.organization_id)
          and private.is_organization_module_enabled(service_order.organization_id, 'orders')
          and (
            private.has_effective_organization_permission(service_order.organization_id, 'orders.view_all')
            or (
              private.has_effective_organization_permission(service_order.organization_id, 'orders.view')
              and (
                service_order.assigned_to = (select auth.uid())
                or exists (
                  select 1
                  from public.employees employee
                  where employee.organization_id = service_order.organization_id
                    and employee.profile_id = (select auth.uid())
                    and employee.id in (service_order.technician_id, service_order.seller_id)
                )
                or exists (
                  select 1
                  from public.service_order_technicians technician_link
                  join public.employees employee
                    on employee.id = technician_link.employee_id
                   and employee.organization_id = service_order.organization_id
                  where technician_link.service_order_id = service_order.id
                    and technician_link.organization_id = service_order.organization_id
                    and employee.profile_id = (select auth.uid())
                )
                or exists (
                  select 1
                  from public.service_order_sellers seller_link
                  join public.employees employee
                    on employee.id = seller_link.employee_id
                   and employee.organization_id = service_order.organization_id
                  where seller_link.service_order_id = service_order.id
                    and seller_link.organization_id = service_order.organization_id
                    and employee.profile_id = (select auth.uid())
                )
              )
            )
          )
        )
      )
  );
$$;

revoke all on function private.can_view_service_order(uuid) from public;
grant execute on function private.can_view_service_order(uuid) to authenticated;

drop policy if exists service_orders_tenant_select on public.service_orders;
create policy service_orders_tenant_select
on public.service_orders
as permissive
for select
to authenticated
using (private.can_view_service_order(id));

drop policy if exists service_orders_tenant_insert on public.service_orders;
create policy service_orders_tenant_insert
on public.service_orders
as permissive
for insert
to authenticated
with check (
  organization_id is not null
  and private.is_organization_member(organization_id)
  and private.is_organization_module_enabled(organization_id, 'orders')
  and private.has_effective_organization_permission(organization_id, 'orders.create')
  and assigned_to = (select auth.uid())
);

drop policy if exists service_orders_tenant_update on public.service_orders;
create policy service_orders_tenant_update
on public.service_orders
as permissive
for update
to authenticated
using (
  organization_id is not null
  and private.is_organization_member(organization_id)
  and private.is_organization_module_enabled(organization_id, 'orders')
  and (
    private.has_effective_organization_permission(organization_id, 'orders.edit')
    or private.has_effective_organization_permission(organization_id, 'orders.update')
  )
  and private.can_view_service_order(id)
)
with check (
  organization_id is not null
  and private.is_organization_member(organization_id)
  and private.is_organization_module_enabled(organization_id, 'orders')
  and (
    private.has_effective_organization_permission(organization_id, 'orders.edit')
    or private.has_effective_organization_permission(organization_id, 'orders.update')
  )
  and private.can_view_service_order(id)
);

create or replace function private.guard_monitored_service_type()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_monitored boolean;
begin
  select exists (
    select 1
    from public.service_type_monitoring monitoring
    where monitoring.service_type_id = old.id
      and monitoring.organization_id = old.organization_id
  ) into v_monitored;

  if not v_monitored then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Este tipo de atendimento é monitorado pela Union World e não pode ser excluído.'
      using errcode = '42501';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.forecast_days is distinct from old.forecast_days
     or new.is_active is distinct from old.is_active then
    raise exception 'Tipo monitorado pela Union World: nome, descrição, previsão e status não podem ser alterados. Somente situações e SLA podem ser configurados.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists service_types_guard_union_monitoring on public.service_types;
create trigger service_types_guard_union_monitoring
before update or delete on public.service_types
for each row
execute function private.guard_monitored_service_type();

create or replace function public.create_partner_company_with_monitoring(
  p_company jsonb,
  p_monitored_types jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_organization public.organizations%rowtype;
  v_type jsonb;
  v_service_type_id uuid;
  v_forecast_days integer;
  v_sort_order integer;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('organizations.create') then
    raise exception 'Sem permissão para cadastrar empresas parceiras.' using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(p_monitored_types), 'array') <> 'array' then
    raise exception 'A lista de tipos monitorados é inválida.' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_monitored_types, '[]'::jsonb)) > 0
     and not private.has_platform_permission('orders.monitor.manage') then
    raise exception 'Sem permissão para configurar o monitoramento de OS.' using errcode = '42501';
  end if;

  if nullif(trim(p_company ->> 'name'), '') is null then
    raise exception 'Informe o nome da empresa.' using errcode = '23502';
  end if;

  insert into public.organizations (
    parent_organization_id, organization_type, name, legal_name, document, slug, status, settings, created_by
  )
  values (
    null,
    'partner',
    trim(p_company ->> 'name'),
    nullif(trim(p_company ->> 'legal_name'), ''),
    nullif(trim(p_company ->> 'document'), ''),
    trim(p_company ->> 'slug'),
    case when p_company ->> 'status' in ('active', 'suspended', 'cancelled') then p_company ->> 'status' else 'active' end,
    coalesce(p_company -> 'settings', '{}'::jsonb),
    (select auth.uid())
  )
  returning * into v_organization;

  for v_type in
    select value from jsonb_array_elements(coalesce(p_monitored_types, '[]'::jsonb))
  loop
    if nullif(trim(v_type ->> 'title'), '') is null then
      raise exception 'Todo tipo monitorado precisa de um nome.' using errcode = '23502';
    end if;

    v_forecast_days := case
      when nullif(v_type ->> 'forecast_days', '') is null then null
      else (v_type ->> 'forecast_days')::integer
    end;

    if v_forecast_days is not null and v_forecast_days < 0 then
      raise exception 'A previsão do tipo monitorado não pode ser negativa.' using errcode = '22023';
    end if;

    select coalesce(max(service_type.sort_order), -1) + 1
      into v_sort_order
    from public.service_types service_type
    where service_type.organization_id = v_organization.id;

    insert into public.service_types (organization_id, title, description, forecast_days, is_active, sort_order)
    values (
      v_organization.id,
      trim(v_type ->> 'title'),
      nullif(trim(v_type ->> 'description'), ''),
      v_forecast_days,
      true,
      v_sort_order
    )
    returning id into v_service_type_id;

    insert into public.service_type_monitoring (organization_id, service_type_id, created_by)
    values (v_organization.id, v_service_type_id, (select auth.uid()));
  end loop;

  return to_jsonb(v_organization);
end;
$$;

revoke all on function public.create_partner_company_with_monitoring(jsonb, jsonb) from public;
revoke all on function public.create_partner_company_with_monitoring(jsonb, jsonb) from anon;
grant execute on function public.create_partner_company_with_monitoring(jsonb, jsonb) to authenticated;

create or replace function public.list_partner_service_type_monitoring(p_organization_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  forecast_days integer,
  is_active boolean,
  sort_order integer,
  is_monitored boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is null
     or not (
       private.has_platform_permission('orders.monitor.view')
       or private.has_platform_permission('orders.monitor.manage')
     ) then
    raise exception 'Sem permissão para visualizar a configuração de monitoramento.' using errcode = '42501';
  end if;

  return query
  select
    service_type.id,
    service_type.title,
    service_type.description,
    service_type.forecast_days,
    service_type.is_active,
    service_type.sort_order,
    (monitoring.service_type_id is not null) as is_monitored
  from public.service_types service_type
  left join public.service_type_monitoring monitoring
    on monitoring.organization_id = service_type.organization_id
   and monitoring.service_type_id = service_type.id
  where service_type.organization_id = p_organization_id
  order by monitoring.service_type_id is null, service_type.sort_order, service_type.title;
end;
$$;

revoke all on function public.list_partner_service_type_monitoring(uuid) from public;
revoke all on function public.list_partner_service_type_monitoring(uuid) from anon;
grant execute on function public.list_partner_service_type_monitoring(uuid) to authenticated;

create or replace function public.add_partner_monitored_service_type(
  p_organization_id uuid,
  p_service_type_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('orders.monitor.manage') then
    raise exception 'Sem permissão para configurar o monitoramento de OS.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and organization.status = 'active'
      and organization.organization_type = 'partner'
  ) then
    raise exception 'Empresa parceira ativa não encontrada.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.service_types service_type
    where service_type.id = p_service_type_id
      and service_type.organization_id = p_organization_id
  ) then
    raise exception 'O tipo de atendimento não pertence à empresa informada.' using errcode = '22023';
  end if;

  insert into public.service_type_monitoring (organization_id, service_type_id, created_by)
  values (p_organization_id, p_service_type_id, (select auth.uid()))
  on conflict (organization_id, service_type_id) do nothing;

  insert into public.organization_audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    p_organization_id,
    (select auth.uid()),
    'orders.monitor.service_type_added',
    'service_types',
    p_service_type_id::text,
    jsonb_build_object('source', 'union_monitoring')
  );
end;
$$;

revoke all on function public.add_partner_monitored_service_type(uuid, uuid) from public;
revoke all on function public.add_partner_monitored_service_type(uuid, uuid) from anon;
grant execute on function public.add_partner_monitored_service_type(uuid, uuid) to authenticated;

create or replace function public.create_partner_monitored_service_type(
  p_organization_id uuid,
  p_title text,
  p_description text default null,
  p_forecast_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_service_type_id uuid;
  v_sort_order integer;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('orders.monitor.manage') then
    raise exception 'Sem permissão para configurar o monitoramento de OS.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and organization.status = 'active'
      and organization.organization_type = 'partner'
  ) then
    raise exception 'Empresa parceira ativa não encontrada.' using errcode = '22023';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Informe o nome do tipo de atendimento.' using errcode = '23502';
  end if;

  if p_forecast_days is not null and p_forecast_days < 0 then
    raise exception 'A previsão não pode ser negativa.' using errcode = '22023';
  end if;

  select coalesce(max(service_type.sort_order), -1) + 1
    into v_sort_order
  from public.service_types service_type
  where service_type.organization_id = p_organization_id;

  insert into public.service_types (organization_id, title, description, forecast_days, is_active, sort_order)
  values (p_organization_id, trim(p_title), nullif(trim(p_description), ''), p_forecast_days, true, v_sort_order)
  returning id into v_service_type_id;

  insert into public.service_type_monitoring (organization_id, service_type_id, created_by)
  values (p_organization_id, v_service_type_id, (select auth.uid()));

  insert into public.organization_audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    p_organization_id,
    (select auth.uid()),
    'orders.monitor.service_type_created',
    'service_types',
    v_service_type_id::text,
    jsonb_build_object('source', 'union_monitoring')
  );

  return v_service_type_id;
end;
$$;

revoke all on function public.create_partner_monitored_service_type(uuid, text, text, integer) from public;
revoke all on function public.create_partner_monitored_service_type(uuid, text, text, integer) from anon;
grant execute on function public.create_partner_monitored_service_type(uuid, text, text, integer) to authenticated;

create or replace function public.get_union_order_monitor_options()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('orders.monitor.view') then
    raise exception 'Sem permissão para monitorar ordens de serviço.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'companies',
    coalesce((
      select jsonb_agg(to_jsonb(company_option) order by company_option.name)
      from (
        select distinct organization.id, organization.name
        from public.organizations organization
        join public.service_type_monitoring monitoring on monitoring.organization_id = organization.id
        where organization.status = 'active'
      ) company_option
    ), '[]'::jsonb),
    'serviceTypes',
    coalesce((
      select jsonb_agg(to_jsonb(type_option) order by type_option.organization_name, type_option.title)
      from (
        select service_type.id, service_type.organization_id, organization.name as organization_name, service_type.title
        from public.service_type_monitoring monitoring
        join public.service_types service_type
          on service_type.id = monitoring.service_type_id
         and service_type.organization_id = monitoring.organization_id
        join public.organizations organization on organization.id = monitoring.organization_id
        where organization.status = 'active'
      ) type_option
    ), '[]'::jsonb),
    'statuses',
    coalesce((
      select jsonb_agg(to_jsonb(status_option) order by status_option.organization_name, status_option.name)
      from (
        select distinct status.id, service_order.organization_id, organization.name as organization_name, status.name, status.color
        from public.service_orders service_order
        join public.service_type_monitoring monitoring
          on monitoring.organization_id = service_order.organization_id
         and monitoring.service_type_id = service_order.service_type_id
        join public.organizations organization on organization.id = service_order.organization_id
        join public.order_statuses status on status.id = service_order.status_id
        where organization.status = 'active'
      ) status_option
    ), '[]'::jsonb),
    'situations',
    coalesce((
      select jsonb_agg(to_jsonb(situation_option) order by situation_option.organization_name, situation_option.name)
      from (
        select distinct situation.id, service_order.organization_id, organization.name as organization_name, situation.name, situation.color
        from public.service_orders service_order
        join public.service_type_monitoring monitoring
          on monitoring.organization_id = service_order.organization_id
         and monitoring.service_type_id = service_order.service_type_id
        join public.organizations organization on organization.id = service_order.organization_id
        join public.os_situations situation on situation.id = service_order.situation_id
        where organization.status = 'active'
      ) situation_option
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_union_order_monitor_options() from public;
revoke all on function public.get_union_order_monitor_options() from anon;
grant execute on function public.get_union_order_monitor_options() to authenticated;

create or replace function public.list_union_monitored_orders(
  p_search text default null,
  p_organization_id uuid default null,
  p_service_type_id uuid default null,
  p_status_id uuid default null,
  p_situation_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('orders.monitor.view') then
    raise exception 'Sem permissão para monitorar ordens de serviço.' using errcode = '42501';
  end if;

  with filtered as (
    select
      service_order.id,
      service_order.organization_id,
      organization.name as organization_name,
      service_order.os_number,
      service_order.external_os_number,
      service_order.created_at,
      service_order.updated_at,
      service_order.scheduled_at,
      service_order.serial_number,
      service_order.model,
      service_order.priority,
      service_order.order_type,
      service_type.id as service_type_id,
      service_type.title as service_type_title,
      status.id as status_id,
      status.name as status_name,
      status.color as status_color,
      situation.id as situation_id,
      situation.name as situation_name,
      situation.color as situation_color,
      customer.id as customer_id,
      coalesce(customer.full_name, customer.trade_name, customer.legal_name, '—') as customer_name,
      coalesce(equipment_type.name, '') as equipment_type_name,
      coalesce(equipment_brand.name, '') as equipment_brand_name,
      coalesce(equipment_model.name, service_order.model, '') as equipment_model_name,
      technician.full_name as technician_name,
      seller.full_name as seller_name
    from public.service_orders service_order
    join public.service_type_monitoring monitoring
      on monitoring.organization_id = service_order.organization_id
     and monitoring.service_type_id = service_order.service_type_id
    join public.organizations organization
      on organization.id = service_order.organization_id
     and organization.status = 'active'
    join public.service_types service_type
      on service_type.id = service_order.service_type_id
     and service_type.organization_id = service_order.organization_id
    left join public.order_statuses status on status.id = service_order.status_id
    left join public.os_situations situation on situation.id = service_order.situation_id
    left join public.customers customer on customer.id = service_order.customer_id
    left join public.equipment_types equipment_type on equipment_type.id = service_order.equipment_type_id
    left join public.equipment_brands equipment_brand on equipment_brand.id = service_order.equipment_brand_id
    left join public.equipment_models equipment_model on equipment_model.id = service_order.equipment_model_id
    left join public.employees technician on technician.id = service_order.technician_id
    left join public.employees seller on seller.id = service_order.seller_id
    where private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and (p_organization_id is null or service_order.organization_id = p_organization_id)
      and (p_service_type_id is null or service_order.service_type_id = p_service_type_id)
      and (p_status_id is null or service_order.status_id = p_status_id)
      and (p_situation_id is null or service_order.situation_id = p_situation_id)
      and (
        v_search is null
        or service_order.os_number ilike '%' || v_search || '%'
        or coalesce(service_order.external_os_number, '') ilike '%' || v_search || '%'
        or coalesce(customer.full_name, '') ilike '%' || v_search || '%'
        or coalesce(customer.trade_name, '') ilike '%' || v_search || '%'
        or coalesce(customer.legal_name, '') ilike '%' || v_search || '%'
        or coalesce(customer.document, '') ilike '%' || v_search || '%'
        or coalesce(customer.cnpj, '') ilike '%' || v_search || '%'
        or coalesce(service_order.serial_number, '') ilike '%' || v_search || '%'
        or coalesce(service_order.model, '') ilike '%' || v_search || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by created_at desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc) from page_rows page_row),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.list_union_monitored_orders(text, uuid, uuid, uuid, uuid, integer, integer) from public;
revoke all on function public.list_union_monitored_orders(text, uuid, uuid, uuid, uuid, integer, integer) from anon;
grant execute on function public.list_union_monitored_orders(text, uuid, uuid, uuid, uuid, integer, integer) to authenticated;

create or replace function public.get_union_monitored_order(p_service_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('orders.monitor.view') then
    raise exception 'Sem permissão para monitorar ordens de serviço.' using errcode = '42501';
  end if;

  if not private.can_monitor_service_order(p_service_order_id) then
    raise exception 'Esta OS não está disponível para monitoramento.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'order', to_jsonb(service_order),
    'organization', jsonb_build_object(
      'id', organization.id,
      'name', organization.name,
      'legal_name', organization.legal_name,
      'document', organization.document
    ),
    'customer', case when customer.id is null then null else to_jsonb(customer) end,
    'serviceType', case when service_type.id is null then null else to_jsonb(service_type) end,
    'status', case when status.id is null then null else to_jsonb(status) end,
    'situation', case when situation.id is null then null else to_jsonb(situation) end,
    'generalService', case when general_service.id is null then null else to_jsonb(general_service) end,
    'equipmentType', case when equipment_type.id is null then null else to_jsonb(equipment_type) end,
    'equipmentBrand', case when equipment_brand.id is null then null else to_jsonb(equipment_brand) end,
    'equipmentModel', case when equipment_model.id is null then null else to_jsonb(equipment_model) end,
    'technician', case when technician.id is null then null else to_jsonb(technician) end,
    'seller', case when seller.id is null then null else to_jsonb(seller) end,
    'technicians', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', employee.id,
          'full_name', employee.full_name,
          'function_name', employee.function_name,
          'is_active', employee.is_active
        )
        order by employee.full_name
      )
      from public.service_order_technicians link
      join public.employees employee on employee.id = link.employee_id
      where link.service_order_id = service_order.id
        and link.organization_id = service_order.organization_id
    ), '[]'::jsonb),
    'sellers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', employee.id,
          'full_name', employee.full_name,
          'function_name', employee.function_name,
          'is_active', employee.is_active
        )
        order by employee.full_name
      )
      from public.service_order_sellers link
      join public.employees employee on employee.id = link.employee_id
      where link.service_order_id = service_order.id
        and link.organization_id = service_order.organization_id
    ), '[]'::jsonb),
    'statusHistory', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', history.id,
          'status_id', history.status_id,
          'status_name', history_status.name,
          'notes', history.notes,
          'created_at', history.created_at
        )
        order by history.created_at desc
      )
      from public.service_order_status_history history
      left join public.order_statuses history_status on history_status.id = history.status_id
      where history.service_order_id = service_order.id
    ), '[]'::jsonb),
    'technicalValues', coalesce((
      select jsonb_agg(to_jsonb(technical_value) order by technical_value.created_at)
      from public.service_order_technical_values technical_value
      where technical_value.service_order_id = service_order.id
    ), '[]'::jsonb),
    'usedItems', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', used_item.id,
          'quantity', used_item.quantity,
          'unit_sale_price', used_item.unit_sale_price,
          'total_sale_price', used_item.total_sale_price,
          'created_at', used_item.created_at,
          'item', case when inventory_item.id is null then null else jsonb_build_object(
            'id', inventory_item.id,
            'name', inventory_item.name,
            'sku', inventory_item.sku,
            'unit', inventory_item.unit
          ) end
        )
        order by used_item.created_at desc
      )
      from public.service_order_used_items used_item
      left join public.inventory_items inventory_item on inventory_item.id = used_item.inventory_item_id
      where used_item.service_order_id = service_order.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.service_orders service_order
  join public.service_type_monitoring monitoring
    on monitoring.organization_id = service_order.organization_id
   and monitoring.service_type_id = service_order.service_type_id
  join public.organizations organization on organization.id = service_order.organization_id
  left join public.customers customer on customer.id = service_order.customer_id
  left join public.service_types service_type on service_type.id = service_order.service_type_id
  left join public.order_statuses status on status.id = service_order.status_id
  left join public.os_situations situation on situation.id = service_order.situation_id
  left join public.general_services general_service on general_service.id = service_order.general_service_id
  left join public.equipment_types equipment_type on equipment_type.id = service_order.equipment_type_id
  left join public.equipment_brands equipment_brand on equipment_brand.id = service_order.equipment_brand_id
  left join public.equipment_models equipment_model on equipment_model.id = service_order.equipment_model_id
  left join public.employees technician on technician.id = service_order.technician_id
  left join public.employees seller on seller.id = service_order.seller_id
  where service_order.id = p_service_order_id;

  if v_result is null then
    raise exception 'OS monitorada não encontrada.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_union_monitored_order(uuid) from public;
revoke all on function public.get_union_monitored_order(uuid) from anon;
grant execute on function public.get_union_monitored_order(uuid) to authenticated;


create or replace function private.can_access_service_order_child(
  p_service_order_id uuid,
  p_permission_key text,
  p_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and private.can_view_service_order(service_order.id)
      and (
        (
          p_access_level = 'read'
          and private.can_monitor_service_order(service_order.id)
        )
        or (
          private.can_access_shared_organization_resource(
            service_order.organization_id,
            'orders',
            p_access_level
          )
          and private.has_effective_organization_permission(
            service_order.organization_id,
            p_permission_key
          )
        )
      )
  );
$;

revoke all on function private.can_access_service_order_child(uuid, text, text) from public;
grant execute on function private.can_access_service_order_child(uuid, text, text) to authenticated;

do $
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='service_order_technical_values'
  ) then
    alter publication supabase_realtime add table public.service_order_technical_values;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='service_order_technicians'
  ) then
    alter publication supabase_realtime add table public.service_order_technicians;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='service_order_sellers'
  ) then
    alter publication supabase_realtime add table public.service_order_sellers;
  end if;
end
$;

comment on table public.service_type_monitoring is
  'Tipos de atendimento de empresas parceiras cujas OS podem ser monitoradas pela Union World.';
comment on function public.list_union_monitored_orders(text, uuid, uuid, uuid, uuid, integer, integer) is
  'Lista somente OS de tipos explicitamente monitorados pela Union World, com filtros e paginação.';
comment on function public.get_union_monitored_order(uuid) is
  'Retorna os dados de uma OS monitorada em modo somente leitura.';

commit;
