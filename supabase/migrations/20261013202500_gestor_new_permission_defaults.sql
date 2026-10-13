-- Concede automaticamente permissões NOVAS ao cargo Gestor dos módulos habilitados.
-- Nunca habilita módulos nem ultrapassa o escopo da empresa (site/Union).
-- Concessões são iniciais: o administrador ainda pode remover acessos do cargo.

create or replace function private.provision_gestor_role_permissions(
  p_organization_id uuid default null,
  p_permission_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.role_permissions (role_id, permission_id)
  select role_row.id, permission_row.id
  from public.roles role_row
  join public.organizations organization
    on organization.id = role_row.organization_id
  cross join public.permissions permission_row
  where (p_organization_id is null or role_row.organization_id = p_organization_id)
    and (p_permission_id is null or permission_row.id = p_permission_id)
    and lower(btrim(role_row.name)) = 'gestor'
    and role_row.is_active
    and organization.status = 'active'
    and private.permission_belongs_to_organization(role_row.organization_id, permission_row.key)
  on conflict (role_id, permission_id) do nothing;
end;
$$;

revoke all on function private.provision_gestor_role_permissions(uuid,uuid)
from public, anon, authenticated;

create or replace function private.provision_gestor_on_permission_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.provision_gestor_role_permissions(null, new.id);
  return new;
end;
$$;

revoke all on function private.provision_gestor_on_permission_insert()
from public, anon, authenticated;

drop trigger if exists grant_new_permissions_to_gestors on public.permissions;
create trigger grant_new_permissions_to_gestors
after insert on public.permissions
for each row
execute function private.provision_gestor_on_permission_insert();

create or replace function private.provision_gestor_on_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(new.name)) = 'gestor' and new.is_active then
    if tg_op = 'INSERT' then
      perform private.provision_gestor_role_permissions(new.organization_id, null);
    elsif old.name is distinct from new.name
       or old.is_active is distinct from new.is_active then
      perform private.provision_gestor_role_permissions(new.organization_id, null);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.provision_gestor_on_role_change()
from public, anon, authenticated;

drop trigger if exists grant_permissions_to_new_gestor_role on public.roles;
create trigger grant_permissions_to_new_gestor_role
after insert or update of name, is_active on public.roles
for each row
execute function private.provision_gestor_on_role_change();

create or replace function private.provision_gestor_on_module_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_enabled then
    if tg_op = 'INSERT' then
      perform private.provision_gestor_role_permissions(new.organization_id, null);
    elsif old.is_enabled is distinct from new.is_enabled
       or old.module_key is distinct from new.module_key then
      perform private.provision_gestor_role_permissions(new.organization_id, null);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.provision_gestor_on_module_activation()
from public, anon, authenticated;

drop trigger if exists grant_permissions_to_gestors_on_module_activation on public.organization_modules;
create trigger grant_permissions_to_gestors_on_module_activation
after insert or update of is_enabled, module_key on public.organization_modules
for each row
execute function private.provision_gestor_on_module_activation();

-- Backfill idempotente das permissões de Gestores já existentes.
select private.provision_gestor_role_permissions(null, null);
