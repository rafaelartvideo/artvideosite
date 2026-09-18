-- Restaura a regra original das empresas parceiras:
-- dados cadastrais oficiais permanecem somente leitura para a parceira.
-- Telefone, e-mail e identidade visual continuam editáveis conforme settings.update.

begin;

create or replace function private.restrict_partner_company_settings_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_type text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select organization.organization_type
    into v_organization_type
  from public.organizations organization
  where organization.id = new.organization_id;

  if v_organization_type <> 'partner'
     or private.has_platform_permission('organizations.edit') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Os dados cadastrais da empresa parceira são definidos pela ArtVideo.'
      using errcode = '42501';
  end if;

  if new.name is distinct from old.name
     or new.legal_name is distinct from old.legal_name
     or new.document is distinct from old.document
     or new.zip_code is distinct from old.zip_code
     or new.street is distinct from old.street
     or new.number is distinct from old.number
     or new.complement is distinct from old.complement
     or new.neighborhood is distinct from old.neighborhood
     or new.city is distinct from old.city
     or new.state is distinct from old.state then
    raise exception 'Nesta empresa, somente telefone, e-mail e logos podem ser alterados.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.restrict_partner_company_settings_mutation() from public;

drop trigger if exists restrict_partner_company_settings_mutation
  on public.organization_company_settings;

create trigger restrict_partner_company_settings_mutation
before insert or update on public.organization_company_settings
for each row
execute function private.restrict_partner_company_settings_mutation();

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

drop trigger if exists sync_partner_company_editable_fields_to_organization
  on public.organization_company_settings;

create trigger sync_partner_company_editable_fields_to_organization
after update of phone, email, logo_media_id, menu_logo_media_id
on public.organization_company_settings
for each row
execute function private.sync_partner_company_editable_fields_to_organization();

commit;
