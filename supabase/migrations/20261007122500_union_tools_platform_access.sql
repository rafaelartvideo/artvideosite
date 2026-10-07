-- A Union World e a operadora da plataforma: qualquer ferramenta liberada para
-- empresas parceiras precisa poder ser administrada primeiro pela Union.

begin;

create or replace function private.permission_belongs_to_organization(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_situation_text text;
  v_situation_id uuid;
  v_required_modules text[];
  v_is_platform boolean;
begin
  if p_organization_id is null or p_permission_key is null then
    return false;
  end if;

  v_is_platform := private.is_platform_organization(p_organization_id);

  if private.is_platform_only_permission_key(p_permission_key)
     and not v_is_platform then
    return false;
  end if;

  if private.is_artvideo_only_permission_key(p_permission_key)
     and not private.is_artvideo_site_organization(p_organization_id)
     and not (v_is_platform and p_permission_key = 'tools.uniq.use') then
    return false;
  end if;

  if not v_is_platform then
    v_required_modules := private.permission_required_module_keys(p_permission_key);

    if cardinality(v_required_modules) > 0
       and not exists (
         select 1
         from public.organization_modules organization_module
         where organization_module.organization_id = p_organization_id
           and organization_module.is_enabled
           and organization_module.module_key = any(v_required_modules)
       ) then
      return false;
    end if;
  end if;

  v_situation_text := substring(
    p_permission_key
    from '^orders\.images\.situation\.([0-9a-fA-F-]{36})\.upload$'
  );

  if v_situation_text is null then
    return true;
  end if;

  begin
    v_situation_id := v_situation_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.os_situations situation
    where situation.id = v_situation_id
      and situation.organization_id = p_organization_id
  );
end;
$$;

revoke all on function private.permission_belongs_to_organization(uuid,text) from public;

insert into public.role_permissions (role_id, permission_id)
select distinct role.id, target.id
from public.roles role
join public.role_permissions tools_access
  on tools_access.role_id = role.id
join public.permissions tools_permission
  on tools_permission.id = tools_access.permission_id
 and tools_permission.key = 'tools.view'
cross join public.permissions target
where private.is_platform_organization(role.organization_id)
  and target.key in (
    'queue.view',
    'pbx.view',
    'marketplace.view',
    'ai.view',
    'sac_digital.view',
    'sac_digital.messages.view',
    'sac_digital.messages.send',
    'tools.uniq.use'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct role.id, target.id
from public.roles role
join public.role_permissions settings_access
  on settings_access.role_id = role.id
join public.permissions settings_permission
  on settings_permission.id = settings_access.permission_id
 and settings_permission.key = 'settings.update'
cross join public.permissions target
where private.is_platform_organization(role.organization_id)
  and target.key in (
    'queue.manage',
    'sac_digital.protocols.manage',
    'sac_digital.settings.manage'
  )
on conflict (role_id, permission_id) do nothing;

comment on function private.permission_belongs_to_organization(uuid,text)
is 'Valida escopo Union/tenant; a Union ignora bloqueios por modulo contratado e pode usar ferramentas da plataforma conforme permissoes da funcao.';

commit;
