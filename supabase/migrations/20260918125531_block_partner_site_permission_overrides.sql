begin;

create or replace function private.enforce_partner_user_permission_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission_key text;
begin
  select permission.key
    into v_permission_key
  from public.permissions permission
  where permission.id = new.permission_id;

  if new.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
     and (
       v_permission_key like 'products.%'
       or v_permission_key like 'categories.%'
       or v_permission_key like 'brands.%'
       or v_permission_key like 'services.%'
       or v_permission_key like 'filters.%'
       or v_permission_key like 'site.%'
       or v_permission_key like 'site_settings.%'
       or v_permission_key like 'contact.%'
     ) then
    raise exception 'Permissões do site são exclusivas da ArtVideo.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_partner_user_permission_scope() from public;

drop trigger if exists enforce_partner_user_permission_scope
  on public.user_permission_overrides;
create trigger enforce_partner_user_permission_scope
before insert or update of organization_id, permission_id
on public.user_permission_overrides
for each row
execute function private.enforce_partner_user_permission_scope();

commit;
