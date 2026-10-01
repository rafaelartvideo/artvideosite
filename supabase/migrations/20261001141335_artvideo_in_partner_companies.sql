create or replace function private.is_union_managed_company(
  p_organization_id uuid,
  p_require_active boolean default false
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.id <> public.platform_operator_organization_id()
      and (
        organization.organization_type = 'partner'
        or organization.id = public.artvideo_organization_id()
      )
      and (not p_require_active or organization.status = 'active')
  );
$$;

revoke all on function private.is_union_managed_company(uuid, boolean) from public;
grant execute on function private.is_union_managed_company(uuid, boolean) to authenticated;

comment on function private.is_union_managed_company(uuid, boolean) is
  'Identifica empresas administradas pela Union World: parceiras comuns e o tenant ArtVideo, sem incluir a própria operadora.';

create or replace function public.set_partner_data_share(
  p_owner_organization_id uuid,
  p_resource_key text,
  p_access_level text
)
returns table (
  share_id uuid,
  resource_key text,
  access_level text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_platform_organization_id constant uuid := public.platform_operator_organization_id();
  v_previous_access_level text;
  v_share public.organization_data_shares%rowtype;
begin
  if v_actor_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_platform_permission('organizations.data_shares.manage') then
    raise exception 'Sem permissão para gerenciar compartilhamentos de empresas.'
      using errcode = '42501';
  end if;

  if p_resource_key not in ('customers', 'orders', 'inventory') then
    raise exception 'Recurso de compartilhamento não permitido: %.', p_resource_key
      using errcode = '22023';
  end if;

  if p_access_level not in ('none', 'summary', 'read') then
    raise exception 'Nível de acesso inválido: %.', p_access_level
      using errcode = '22023';
  end if;

  if not private.is_union_managed_company(p_owner_organization_id, false) then
    raise exception 'Empresa administrada não encontrada.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'unionworld:managed-company-data-share:' || p_owner_organization_id::text || ':' || p_resource_key,
      0
    )
  );

  select data_share.access_level
    into v_previous_access_level
  from public.organization_data_shares as data_share
  where data_share.parent_organization_id = v_platform_organization_id
    and data_share.child_organization_id = p_owner_organization_id
    and data_share.resource_key = p_resource_key;

  update public.organization_data_shares as data_share
  set
    access_level = p_access_level,
    granted_by = v_actor_user_id,
    updated_at = now()
  where data_share.parent_organization_id = v_platform_organization_id
    and data_share.child_organization_id = p_owner_organization_id
    and data_share.resource_key = p_resource_key
  returning data_share.* into v_share;

  if not found then
    insert into public.organization_data_shares as data_share (
      parent_organization_id,
      child_organization_id,
      resource_key,
      access_level,
      granted_by,
      updated_at
    )
    values (
      v_platform_organization_id,
      p_owner_organization_id,
      p_resource_key,
      p_access_level,
      v_actor_user_id,
      now()
    )
    returning data_share.* into v_share;
  end if;

  insert into public.organization_audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_owner_organization_id,
    v_actor_user_id,
    'partner_data_share.updated',
    'organization_data_share',
    v_share.id::text,
    jsonb_build_object(
      'receiver_organization_id', v_platform_organization_id,
      'resource_key', p_resource_key,
      'previous_access_level', coalesce(v_previous_access_level, 'none'),
      'access_level', p_access_level,
      'read_only', true
    )
  );

  return query
  select
    v_share.id,
    v_share.resource_key,
    v_share.access_level,
    v_share.updated_at;
end;
$$;

revoke all on function public.set_partner_data_share(uuid, text, text) from public;
revoke all on function public.set_partner_data_share(uuid, text, text) from anon;
grant execute on function public.set_partner_data_share(uuid, text, text) to authenticated;

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
    raise exception 'Sem permissão para configurar o monitoramento de OS.'
      using errcode = '42501';
  end if;

  if not private.is_union_managed_company(p_organization_id, true) then
    raise exception 'Empresa administrada ativa não encontrada.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.service_types service_type
    where service_type.id = p_service_type_id
      and service_type.organization_id = p_organization_id
  ) then
    raise exception 'O tipo de atendimento não pertence à empresa informada.'
      using errcode = '22023';
  end if;

  insert into public.service_type_monitoring (
    organization_id,
    service_type_id,
    created_by
  )
  values (
    p_organization_id,
    p_service_type_id,
    (select auth.uid())
  )
  on conflict (organization_id, service_type_id) do nothing;

  insert into public.organization_audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
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
    raise exception 'Sem permissão para configurar o monitoramento de OS.'
      using errcode = '42501';
  end if;

  if not private.is_union_managed_company(p_organization_id, true) then
    raise exception 'Empresa administrada ativa não encontrada.'
      using errcode = '22023';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Informe o nome do tipo de atendimento.'
      using errcode = '23502';
  end if;

  if p_forecast_days is not null and p_forecast_days < 0 then
    raise exception 'A previsão não pode ser negativa.'
      using errcode = '22023';
  end if;

  select coalesce(max(service_type.sort_order), -1) + 1
    into v_sort_order
  from public.service_types service_type
  where service_type.organization_id = p_organization_id;

  insert into public.service_types (
    organization_id,
    title,
    description,
    forecast_days,
    is_active,
    sort_order
  )
  values (
    p_organization_id,
    trim(p_title),
    nullif(trim(p_description), ''),
    p_forecast_days,
    true,
    v_sort_order
  )
  returning id into v_service_type_id;

  insert into public.service_type_monitoring (
    organization_id,
    service_type_id,
    created_by
  )
  values (
    p_organization_id,
    v_service_type_id,
    (select auth.uid())
  );

  insert into public.organization_audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
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

comment on function public.set_partner_data_share(uuid, text, text) is
  'Configura compartilhamento somente leitura de uma empresa administrada com a Union World.';
comment on function public.add_partner_monitored_service_type(uuid, uuid) is
  'Adiciona ao monitoramento da Union World um tipo de atendimento de empresa administrada, incluindo o tenant ArtVideo.';
comment on function public.create_partner_monitored_service_type(uuid, text, text, integer) is
  'Cria e monitora um tipo de atendimento em empresa administrada pela Union World, incluindo o tenant ArtVideo.';
