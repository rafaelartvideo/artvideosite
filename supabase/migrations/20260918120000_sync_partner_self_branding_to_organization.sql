begin;

create or replace function private.sync_partner_company_editable_fields_to_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_type text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.phone is not distinct from old.phone
     and new.email is not distinct from old.email
     and new.logo_media_id is not distinct from old.logo_media_id
     and new.menu_logo_media_id is not distinct from old.menu_logo_media_id then
    return new;
  end if;

  select organization.organization_type
    into v_organization_type
  from public.organizations organization
  where organization.id = new.organization_id;

  if v_organization_type <> 'partner' then
    return new;
  end if;

  update public.organizations organization
  set
    settings = coalesce(organization.settings, '{}'::jsonb)
      || jsonb_build_object(
        'phone', new.phone,
        'email', new.email,
        'company_logo_media_id', new.logo_media_id,
        'menu_logo_media_id', new.menu_logo_media_id
      ),
    updated_at = now()
  where organization.id = new.organization_id;

  return new;
end;
$$;

revoke all on function private.sync_partner_company_editable_fields_to_organization() from public;

drop trigger if exists sync_partner_company_contacts_to_organization
  on public.organization_company_settings;
drop trigger if exists sync_partner_company_editable_fields_to_organization
  on public.organization_company_settings;

create trigger sync_partner_company_editable_fields_to_organization
after update of phone, email, logo_media_id, menu_logo_media_id
on public.organization_company_settings
for each row
execute function private.sync_partner_company_editable_fields_to_organization();

commit;
