-- Fechamento multiempresa dos registros auxiliares da OS.
--
-- As tabelas abaixo já possuem organization_id e herdam a empresa da OS pelas
-- migrations anteriores. Esta migration substitui policies authenticated
-- legadas/globais por verificações específicas da empresa proprietária da OS.
-- Policies anon/public (ex.: acompanhamento público) são preservadas.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_order_auxiliary_scope', 0)
);

create or replace function private.can_access_service_order_child(
  p_service_order_id uuid,
  p_permission_key text,
  p_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and private.is_organization_module_enabled(
        service_order.organization_id,
        'orders'
      )
      and private.can_view_service_order(service_order.id)
      and private.can_access_shared_organization_resource(
        service_order.organization_id,
        'orders',
        p_access_level
      )
      and private.has_effective_organization_permission(
        service_order.organization_id,
        p_permission_key
      )
  );
$$;

revoke all on function private.can_access_service_order_child(uuid, text, text) from public;
grant execute on function private.can_access_service_order_child(uuid, text, text) to authenticated;

-- Remove somente policies do papel authenticated nas tabelas tratadas aqui.
-- Policies anon/public são mantidas para não quebrar o acompanhamento público.
do $$
declare
  v_table text;
  v_policy record;
  v_tables constant text[] := array[
    'service_order_status_history',
    'service_order_history_notes',
    'service_order_media',
    'service_order_technical_values',
    'service_order_technicians',
    'service_order_sellers'
  ];
begin
  foreach v_table in array v_tables
  loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table);

    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and 'authenticated' = any (roles)
    loop
      execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Histórico automático de status
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.service_order_status_history') is null then
    return;
  end if;

  create policy service_order_status_history_tenant_select
  on public.service_order_status_history
  for select
  to authenticated
  using (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.section.history',
      'read'
    )
  );

  create policy service_order_status_history_tenant_insert
  on public.service_order_status_history
  for insert
  to authenticated
  with check (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.status.change',
      'manage'
    )
  );

  grant select, insert on public.service_order_status_history to authenticated;
  revoke update, delete on public.service_order_status_history from authenticated;
end
$$;

-- ---------------------------------------------------------------------------
-- Registros manuais do histórico
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.service_order_history_notes') is null then
    return;
  end if;

  create policy service_order_history_notes_tenant_select
  on public.service_order_history_notes
  for select
  to authenticated
  using (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.section.history',
      'read'
    )
  );

  create policy service_order_history_notes_tenant_insert
  on public.service_order_history_notes
  for insert
  to authenticated
  with check (
    organization_id is not null
    and author_id = (select auth.uid())
    and private.can_access_service_order_child(
      service_order_id,
      'orders.history.create',
      'manage'
    )
  );

  grant select, insert on public.service_order_history_notes to authenticated;
  revoke update, delete on public.service_order_history_notes from authenticated;
end
$$;

-- ---------------------------------------------------------------------------
-- Mídias legadas da OS / imagens da solução
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.service_order_media') is null then
    return;
  end if;

  create policy service_order_media_tenant_select
  on public.service_order_media
  for select
  to authenticated
  using (
    organization_id is not null
    and (
      private.can_access_service_order_child(
        service_order_id,
        'orders.section.images',
        'read'
      )
      or private.can_access_service_order_child(
        service_order_id,
        'orders.section.solution',
        'read'
      )
    )
  );

  create policy service_order_media_tenant_insert
  on public.service_order_media
  for insert
  to authenticated
  with check (
    organization_id is not null
    and (
      private.can_access_service_order_child(
        service_order_id,
        'orders.section.images',
        'manage'
      )
      or private.can_access_service_order_child(
        service_order_id,
        'orders.solve',
        'manage'
      )
    )
  );

  create policy service_order_media_tenant_update
  on public.service_order_media
  for update
  to authenticated
  using (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.section.images',
      'manage'
    )
  )
  with check (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.section.images',
      'manage'
    )
  );

  create policy service_order_media_tenant_delete
  on public.service_order_media
  for delete
  to authenticated
  using (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.section.images',
      'manage'
    )
  );

  grant select, insert, update, delete on public.service_order_media to authenticated;
end
$$;

-- ---------------------------------------------------------------------------
-- Valores técnicos do equipamento na OS
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.service_order_technical_values') is null then
    return;
  end if;

  create policy service_order_technical_values_tenant_select
  on public.service_order_technical_values
  for select
  to authenticated
  using (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.section.information',
      'read'
    )
  );

  create policy service_order_technical_values_tenant_insert
  on public.service_order_technical_values
  for insert
  to authenticated
  with check (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.edit',
      'manage'
    )
  );

  create policy service_order_technical_values_tenant_update
  on public.service_order_technical_values
  for update
  to authenticated
  using (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.edit',
      'manage'
    )
  )
  with check (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.edit',
      'manage'
    )
  );

  grant select, insert, update on public.service_order_technical_values to authenticated;
  revoke delete on public.service_order_technical_values from authenticated;
end
$$;

-- ---------------------------------------------------------------------------
-- Técnicos vinculados à OS
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.service_order_technicians') is null then
    return;
  end if;

  create policy service_order_technicians_tenant_select
  on public.service_order_technicians
  for select
  to authenticated
  using (
    organization_id is not null
    and private.can_view_service_order(service_order_id)
    and private.can_access_shared_organization_resource(
      organization_id,
      'orders',
      'read'
    )
  );

  create policy service_order_technicians_tenant_insert
  on public.service_order_technicians
  for insert
  to authenticated
  with check (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.edit',
      'manage'
    )
  );

  create policy service_order_technicians_tenant_delete
  on public.service_order_technicians
  for delete
  to authenticated
  using (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.edit',
      'manage'
    )
  );

  grant select, insert, delete on public.service_order_technicians to authenticated;
  revoke update on public.service_order_technicians from authenticated;
end
$$;

-- ---------------------------------------------------------------------------
-- Vendedores vinculados à OS
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.service_order_sellers') is null then
    return;
  end if;

  create policy service_order_sellers_tenant_select
  on public.service_order_sellers
  for select
  to authenticated
  using (
    organization_id is not null
    and private.can_view_service_order(service_order_id)
    and private.can_access_shared_organization_resource(
      organization_id,
      'orders',
      'read'
    )
  );

  create policy service_order_sellers_tenant_insert
  on public.service_order_sellers
  for insert
  to authenticated
  with check (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.edit',
      'manage'
    )
  );

  create policy service_order_sellers_tenant_delete
  on public.service_order_sellers
  for delete
  to authenticated
  using (
    organization_id is not null
    and private.can_access_service_order_child(
      service_order_id,
      'orders.edit',
      'manage'
    )
  );

  grant select, insert, delete on public.service_order_sellers to authenticated;
  revoke update on public.service_order_sellers from authenticated;
end
$$;

comment on function private.can_access_service_order_child(uuid, text, text) is
  'Valida módulo, visibilidade da OS, compartilhamento explícito e permissão efetiva na empresa proprietária antes de acessar um registro filho da OS.';

commit;
