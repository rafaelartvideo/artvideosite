begin;

alter table public.roles
  drop constraint if exists roles_name_key;

alter table public.roles
  drop constraint if exists roles_organization_name_key;

alter table public.roles
  add constraint roles_organization_name_key unique (organization_id, name);

create or replace function private.ensure_partner_default_roles(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null
     or p_organization_id = '00000000-0000-4000-8000-000000000001'::uuid
     or not exists (
       select 1
       from public.organizations organization
       where organization.id = p_organization_id
         and organization.organization_type = 'partner'
     ) then
    return;
  end if;

  insert into public.roles (
    organization_id,
    name,
    description,
    is_active,
    is_system,
    sort_order
  )
  select
    p_organization_id,
    template_role.name,
    template_role.description,
    template_role.is_active,
    template_role.is_system,
    template_role.sort_order
  from public.roles template_role
  where template_role.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  on conflict (organization_id, name) do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select
    partner_role.id,
    template_permission.permission_id
  from public.roles partner_role
  join public.roles template_role
    on template_role.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
   and template_role.name = partner_role.name
  join public.role_permissions template_permission
    on template_permission.role_id = template_role.id
  join public.permissions permission
    on permission.id = template_permission.permission_id
  where partner_role.organization_id = p_organization_id
    and permission.key not like 'organizations.%'
  on conflict (role_id, permission_id) do nothing;
end;
$$;

revoke all on function private.ensure_partner_default_roles(uuid) from public;

create or replace function private.provision_partner_default_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_type <> 'partner'
     or new.id = '00000000-0000-4000-8000-000000000001'::uuid then
    return new;
  end if;

  if tg_op = 'INSERT'
     or old.organization_type is distinct from new.organization_type then
    perform private.ensure_partner_default_roles(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists provision_partner_default_roles on public.organizations;
create trigger provision_partner_default_roles
after insert or update of organization_type
on public.organizations
for each row
execute function private.provision_partner_default_roles();

do $$
declare
  partner record;
begin
  for partner in
    select id
    from public.organizations
    where organization_type = 'partner'
      and id <> '00000000-0000-4000-8000-000000000001'::uuid
  loop
    perform private.ensure_partner_default_roles(partner.id);
  end loop;
end;
$$;

update public.organization_members member
set
  role_id = partner_role.id,
  updated_at = now()
from public.roles platform_role
join public.roles partner_role
  on partner_role.name = platform_role.name
where member.role_id = platform_role.id
  and platform_role.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and member.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
  and partner_role.organization_id = member.organization_id;

update public.employees employee
set
  role_id = partner_role.id,
  updated_at = now()
from public.roles platform_role
join public.roles partner_role
  on partner_role.name = platform_role.name
where employee.role_id = platform_role.id
  and platform_role.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and employee.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
  and partner_role.organization_id = employee.organization_id;

update public.entity_employee_details detail
set
  role_id = partner_role.id,
  updated_at = now()
from public.entities entity,
     public.roles platform_role
join public.roles partner_role
  on partner_role.name = platform_role.name
where detail.entity_id = entity.id
  and detail.role_id = platform_role.id
  and platform_role.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and entity.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
  and partner_role.organization_id = entity.organization_id;

with single_membership as (
  select
    member.user_id,
    min(member.role_id::text)::uuid as role_id
  from public.organization_members member
  where member.status = 'active'
  group by member.user_id
  having count(*) = 1
)
update public.profiles profile
set
  role_id = single_membership.role_id,
  updated_at = now()
from single_membership
where profile.id = single_membership.user_id
  and profile.role_id is distinct from single_membership.role_id;

commit;
