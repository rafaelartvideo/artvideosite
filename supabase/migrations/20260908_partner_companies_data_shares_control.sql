-- Permite à organização operadora configurar, de forma explícita e auditável,
-- o nível de acesso concedido pela empresa parceira aos recursos já isolados
-- no núcleo multiempresa. Não cria hierarquia e não libera módulos não migrados.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:partner_companies_data_shares_control', 0)
);

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
  v_platform_organization_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_previous_access_level text;
  v_share public.organization_data_shares%rowtype;
begin
  if v_actor_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_platform_permission('organizations.data_shares.manage') then
    raise exception 'Sem permissão para gerenciar compartilhamentos de empresas parceiras.'
      using errcode = '42501';
  end if;

  if p_resource_key not in ('customers', 'orders', 'inventory') then
    raise exception 'Recurso de compartilhamento não permitido: %.', p_resource_key
      using errcode = '22023';
  end if;

  if p_access_level not in ('none', 'summary', 'read', 'manage') then
    raise exception 'Nível de acesso inválido: %.', p_access_level
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organizations organization
    where organization.id = p_owner_organization_id
      and organization.id <> v_platform_organization_id
      and organization.organization_type = 'partner'
  ) then
    raise exception 'Empresa parceira não encontrada.' using errcode = 'P0002';
  end if;

  select data_share.access_level
    into v_previous_access_level
  from public.organization_data_shares data_share
  where data_share.parent_organization_id = v_platform_organization_id
    and data_share.child_organization_id = p_owner_organization_id
    and data_share.resource_key = p_resource_key;

  insert into public.organization_data_shares (
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
  on conflict (parent_organization_id, child_organization_id, resource_key)
  do update set
    access_level = excluded.access_level,
    granted_by = excluded.granted_by,
    updated_at = excluded.updated_at
  returning * into v_share;

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
      'access_level', p_access_level
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
grant execute on function public.set_partner_data_share(uuid, text, text) to authenticated;

comment on function public.set_partner_data_share(uuid, text, text) is
  'Configura de forma explícita e auditável o acesso da ArtVideo a Clientes, OS/Operação ou Estoque de uma empresa parceira independente.';

commit;
