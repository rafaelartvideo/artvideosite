begin;

create table if not exists public.organization_notifications (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  audit_log_id bigint unique references public.organization_audit_logs(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name_snapshot text,
  module_key text not null,
  event_type text not null check (event_type in ('created','updated','deleted')),
  entity_type text not null,
  entity_id text,
  title text not null,
  message text not null,
  route text,
  visibility_permissions text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_notifications_org_date_idx
  on public.organization_notifications (organization_id, created_at desc);

create index if not exists organization_notifications_module_date_idx
  on public.organization_notifications (organization_id, module_key, created_at desc);

create table if not exists public.organization_notification_reads (
  notification_id bigint not null references public.organization_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists organization_notification_reads_user_idx
  on public.organization_notification_reads (user_id, read_at desc);

alter table public.organization_notifications enable row level security;
alter table public.organization_notification_reads enable row level security;

revoke all on table public.organization_notifications from anon, authenticated;
revoke all on table public.organization_notification_reads from anon, authenticated;

grant select on table public.organization_notifications to authenticated;
grant select, insert, update on table public.organization_notification_reads to authenticated;

drop policy if exists organization_notifications_select on public.organization_notifications;
create policy organization_notifications_select
on public.organization_notifications
for select
to authenticated
using (
  private.is_organization_member(organization_id)
  and (
    coalesce(array_length(visibility_permissions, 1), 0) = 0
    or exists (
      select 1
      from unnest(visibility_permissions) as permission_key
      where private.has_organization_permission(organization_id, permission_key)
    )
  )
);

drop policy if exists organization_notification_reads_select on public.organization_notification_reads;
create policy organization_notification_reads_select
on public.organization_notification_reads
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_notifications notification
    where notification.id = notification_id
  )
);

drop policy if exists organization_notification_reads_insert on public.organization_notification_reads;
create policy organization_notification_reads_insert
on public.organization_notification_reads
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_notifications notification
    where notification.id = notification_id
  )
);

drop policy if exists organization_notification_reads_update on public.organization_notification_reads;
create policy organization_notification_reads_update
on public.organization_notification_reads
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_notifications notification
    where notification.id = notification_id
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_notifications notification
    where notification.id = notification_id
  )
);

create or replace function private.create_notification_from_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  v_article text := 'um';
  v_feminine boolean := false;
  v_module text;
  v_route text;
  v_permissions text[] := '{}'::text[];
  v_event_type text;
  v_adjective text;
  v_verb text;
  v_actor text;
  v_detail text;
  v_uuid uuid;
begin
  if new.organization_id is null or new.operation not in ('insert','update','delete') then
    return new;
  end if;

  case coalesce(new.table_name, new.entity_type, '')
    when 'service_orders' then
      v_label := 'Ordem de Serviço'; v_article := 'uma'; v_feminine := true; v_module := 'orders';
      v_route := '/admin/orders/' || coalesce(new.entity_id, '');
      v_permissions := array['orders.view','orders.monitor.view'];
    when 'entities' then
      v_label := 'Cadastro'; v_module := 'customers';
      v_route := '/admin/customers/' || coalesce(new.entity_id, '');
      v_permissions := array['customers.view'];
    when 'quote_requests' then
      v_label := 'Orçamento'; v_module := 'quotes';
      v_route := '/admin/quotes/' || coalesce(new.entity_id, '');
      v_permissions := array['quotes.view'];
    when 'appointments' then
      v_label := 'Agendamento'; v_module := 'agenda';
      v_route := '/admin/agenda/' || coalesce(new.entity_id, '');
      v_permissions := array['agenda.view'];
    when 'inventory_items' then
      v_label := 'Item de estoque'; v_module := 'inventory';
      v_route := '/admin/inventory/' || coalesce(new.entity_id, '');
      v_permissions := array['inventory.view','products.view'];
    when 'products' then
      v_label := 'Produto'; v_module := 'inventory';
      v_route := '/admin/inventory';
      v_permissions := array['inventory.view','products.view'];
    when 'pdv_sales' then
      v_label := 'Venda'; v_article := 'uma'; v_feminine := true; v_module := 'pdv';
      v_route := '/admin/pdv';
      v_permissions := array['pdv.view'];
    when 'financial_entries' then
      v_label := 'Lançamento financeiro'; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'equipment_types' then
      v_label := 'Tipo de equipamento'; v_module := 'equipment';
      v_route := '/admin/operation/equipment';
      v_permissions := array['equipment.view'];
    when 'checklist_profiles' then
      v_label := 'Checklist'; v_module := 'checklists';
      v_route := '/admin/operation/checklists';
      v_permissions := array['checklists.view'];
    when 'general_services' then
      v_label := 'Serviço Geral'; v_module := 'generalServices';
      v_route := '/admin/operation/general-services';
      v_permissions := array['general_services.view'];
    when 'service_types' then
      v_label := 'Tipo de Atendimento'; v_module := 'serviceTypes';
      v_route := '/admin/operation/service-types';
      v_permissions := array['service_types.view'];
    when 'os_situations' then
      v_label := 'Situação da OS'; v_article := 'uma'; v_feminine := true; v_module := 'situations';
      v_route := '/admin/operation/order-situations';
      v_permissions := array['situations.view'];
    when 'order_statuses' then
      v_label := 'Status da OS'; v_module := 'orderStatuses';
      v_route := '/admin/operation/order-statuses';
      v_permissions := array['order_statuses.view'];
    when 'roles' then
      v_label := 'Função'; v_article := 'uma'; v_feminine := true; v_module := 'roles';
      v_route := '/admin/operation/roles';
      v_permissions := array['roles.view'];
    when 'print_templates' then
      v_label := 'Modelo de documento'; v_module := 'documents';
      v_route := '/admin/operation/documents';
      v_permissions := array['documents.view'];
    when 'organization_terms' then
      v_label := 'Termo'; v_module := 'terms';
      v_route := '/admin/operation/terms';
      v_permissions := array['terms.view'];
    when 'service_warranty_terms' then
      v_label := 'Garantia'; v_article := 'uma'; v_feminine := true; v_module := 'terms';
      v_route := '/admin/operation/terms';
      v_permissions := array['terms.view'];
    when 'organization_company_settings' then
      v_label := 'Dados da empresa'; v_article := 'os'; v_module := 'settings';
      v_route := '/admin/operation/company';
      v_permissions := array['settings.details.view'];
    when 'services' then
      v_label := 'Serviço do Site'; v_module := 'services';
      v_route := '/admin/site/services';
      v_permissions := array['services.view'];
    when 'brands' then
      v_label := 'Marca'; v_article := 'uma'; v_feminine := true; v_module := 'brands';
      v_route := '/admin/site/brands';
      v_permissions := array['brands.view'];
    when 'service_categories' then
      v_label := 'Categoria'; v_article := 'uma'; v_feminine := true; v_module := 'categories';
      v_route := '/admin/site/categories';
      v_permissions := array['categories.view'];
    when 'product_categories' then
      v_label := 'Categoria'; v_article := 'uma'; v_feminine := true; v_module := 'categories';
      v_route := '/admin/site/categories';
      v_permissions := array['categories.view'];
    when 'site_settings' then
      v_label := 'Configuração do site'; v_article := 'uma'; v_feminine := true; v_module := 'siteSettings';
      v_route := '/admin/site/settings';
      v_permissions := array['site_settings.view'];
    when 'contact_fields' then
      v_label := 'Informação de contato'; v_article := 'uma'; v_feminine := true; v_module := 'contact';
      v_route := '/admin/contact';
      v_permissions := array['contact.view'];
    when 'organization_members' then
      v_label := 'Acesso de usuário'; v_module := 'roles';
      v_route := '/admin/operation/roles';
      v_permissions := array['roles.view'];
    when 'organization_modules' then
      v_label := 'Módulo da empresa'; v_module := 'partnerCompanies';
      v_route := '/admin/partner-companies';
      v_permissions := array['organizations.view'];
    when 'organizations' then
      v_label := 'Empresa parceira'; v_article := 'uma'; v_feminine := true; v_module := 'partnerCompanies';
      v_route := '/admin/partner-companies';
      v_permissions := array['organizations.view'];
    else
      return new;
  end case;

  v_event_type := case new.operation
    when 'insert' then 'created'
    when 'update' then 'updated'
    else 'deleted'
  end;

  v_adjective := case new.operation
    when 'insert' then case when v_feminine then 'criada' else 'criado' end
    when 'update' then case when v_feminine then 'editada' else 'editado' end
    else case when v_feminine then 'excluída' else 'excluído' end
  end;

  if coalesce(new.table_name, new.entity_type, '') = 'organization_company_settings' then
    v_adjective := case new.operation
      when 'insert' then 'cadastrados'
      when 'update' then 'editados'
      else 'excluídos'
    end;
  end if;

  v_verb := case new.operation
    when 'insert' then 'criou'
    when 'update' then 'editou'
    else 'excluiu'
  end;

  v_actor := coalesce(nullif(btrim(new.actor_name_snapshot), ''), 'Sistema');
  v_uuid := private.audit_try_uuid(new.entity_id);

  if coalesce(new.table_name, new.entity_type, '') = 'service_orders' then
    if new.operation = 'delete' then
      v_detail := coalesce(new.row_snapshot ->> 'os_number', new.row_snapshot ->> 'number');
    elsif v_uuid is not null then
      select coalesce(to_jsonb(service_order) ->> 'os_number', to_jsonb(service_order) ->> 'number')
      into v_detail
      from public.service_orders service_order
      where service_order.id = v_uuid;
    end if;
  elsif coalesce(new.table_name, new.entity_type, '') = 'entities' then
    if new.operation = 'delete' then
      v_detail := coalesce(
        nullif(new.row_snapshot ->> 'name', ''),
        nullif(new.row_snapshot ->> 'trade_name', ''),
        nullif(new.row_snapshot ->> 'legal_name', '')
      );
    elsif v_uuid is not null then
      select coalesce(
        nullif(entity.name, ''),
        nullif(entity.trade_name, ''),
        nullif(entity.legal_name, '')
      )
      into v_detail
      from public.entities entity
      where entity.id = v_uuid;
    end if;
  elsif coalesce(new.table_name, new.entity_type, '') = 'inventory_items' then
    if new.operation = 'delete' then
      v_detail := coalesce(
        nullif(new.row_snapshot ->> 'name', ''),
        nullif(new.row_snapshot ->> 'description', ''),
        nullif(new.row_snapshot ->> 'sku', '')
      );
    elsif v_uuid is not null then
      select coalesce(
        nullif(to_jsonb(item) ->> 'name', ''),
        nullif(to_jsonb(item) ->> 'description', ''),
        nullif(to_jsonb(item) ->> 'sku', '')
      )
      into v_detail
      from public.inventory_items item
      where item.id = v_uuid;
    end if;
  elsif coalesce(new.table_name, new.entity_type, '') = 'pdv_sales' then
    if new.operation = 'delete' then
      v_detail := new.row_snapshot ->> 'sale_number';
    elsif v_uuid is not null then
      select nullif(to_jsonb(sale) ->> 'sale_number', '')
      into v_detail
      from public.pdv_sales sale
      where sale.id = v_uuid;
    end if;
  end if;

  insert into public.organization_notifications (
    organization_id,
    audit_log_id,
    actor_user_id,
    actor_name_snapshot,
    module_key,
    event_type,
    entity_type,
    entity_id,
    title,
    message,
    route,
    visibility_permissions,
    metadata,
    created_at
  )
  values (
    new.organization_id,
    new.id,
    new.actor_user_id,
    new.actor_name_snapshot,
    v_module,
    v_event_type,
    coalesce(new.table_name, new.entity_type, 'registro'),
    new.entity_id,
    case
      when coalesce(new.table_name, new.entity_type, '') = 'service_orders' and nullif(v_detail, '') is not null
        then 'OS #' || v_detail || ' ' || v_adjective
      when nullif(v_detail, '') is not null
        then v_label || ' ' || v_adjective || ': ' || v_detail
      else v_label || ' ' || v_adjective
    end,
    case
      when coalesce(new.table_name, new.entity_type, '') = 'organization_company_settings'
        then v_actor || ' editou os dados da empresa.'
      else v_actor || ' ' || v_verb || ' ' || v_article || ' ' || lower(v_label) || '.'
    end,
    nullif(v_route, ''),
    v_permissions,
    jsonb_build_object(
      'audit_action', new.action,
      'audit_operation', new.operation,
      'detail', v_detail
    ),
    coalesce(new.created_at, now())
  )
  on conflict (audit_log_id) do nothing;

  return new;
end;
$$;

revoke all on function private.create_notification_from_audit() from public;

drop trigger if exists create_notification_from_audit on public.organization_audit_logs;
create trigger create_notification_from_audit
after insert on public.organization_audit_logs
for each row execute function private.create_notification_from_audit();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'organization_notifications'
    ) then
    alter publication supabase_realtime add table public.organization_notifications;
  end if;
end
$$;

commit;
