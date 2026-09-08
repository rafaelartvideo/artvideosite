-- Dados compartilhados de empresas parceiras com a ArtVideo passam a ser
-- estritamente de consulta. A ArtVideo pode receber nenhum acesso, resumo ou
-- leitura detalhada, mas nunca acesso de escrita por compartilhamento.
--
-- Membros diretos da própria empresa continuam podendo gerenciar seus dados
-- normalmente conforme módulos e permissões da organização.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:partner_shared_data_read_only', 0)
);

-- Normaliza configurações legadas da ArtVideo que ainda estejam em `manage`.
update public.organization_data_shares
set access_level = 'read',
    updated_at = now()
where parent_organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and access_level = 'manage';

-- Compartilhamento nunca concede escrita. Para membros diretos, a primeira
-- condição continua liberando a operação normal da própria empresa.
create or replace function private.can_access_shared_organization_resource(
  p_organization_id uuid,
  p_resource_key text,
  p_required_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_organization_member(p_organization_id)
    or exists (
      select 1
      from public.organization_data_shares data_share
      where data_share.child_organization_id = p_organization_id
        and private.is_platform_organization(data_share.parent_organization_id)
        and private.has_organization_permission(
          data_share.parent_organization_id,
          'organizations.view'
        )
        and data_share.resource_key = p_resource_key
        and case p_required_access_level
          when 'summary' then data_share.access_level in ('summary', 'read', 'manage')
          when 'read' then data_share.access_level in ('read', 'manage')
          when 'manage' then false
          else false
        end
    );
$$;

revoke all on function private.can_access_shared_organization_resource(uuid, text, text) from public;
grant execute on function private.can_access_shared_organization_resource(uuid, text, text) to authenticated;

comment on function private.can_access_shared_organization_resource(uuid, text, text) is
  'Autoriza compartilhamento entre empresas somente para resumo ou leitura. Escrita nunca é concedida por compartilhamento; membros diretos continuam usando as permissões da própria organização.';

-- Mantém a mesma assinatura da RPC já utilizada pelo frontend, mas não aceita
-- mais o nível `manage`. O fluxo de UPDATE + INSERT preserva a correção da
-- ambiguidade de resource_key aplicada anteriormente.
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

  if p_access_level not in ('none', 'summary', 'read') then
    raise exception 'Nível de acesso inválido: %.', p_access_level
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organizations as organization
    where organization.id = p_owner_organization_id
      and organization.id <> v_platform_organization_id
      and organization.organization_type = 'partner'
  ) then
    raise exception 'Empresa parceira não encontrada.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'artvideo:partner-data-share:' || p_owner_organization_id::text || ':' || p_resource_key,
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
grant execute on function public.set_partner_data_share(uuid, text, text) to authenticated;

comment on function public.set_partner_data_share(uuid, text, text) is
  'Configura e audita acesso somente de resumo ou leitura da ArtVideo a Clientes, OS/Operação ou Estoque de uma empresa parceira independente.';

commit;
