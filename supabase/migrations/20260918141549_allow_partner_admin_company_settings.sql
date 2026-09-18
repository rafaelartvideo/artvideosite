-- Permite que administradores da própria empresa parceira editem os dados
-- cadastrais de Configurações > Dados da empresa. O acesso continua protegido
-- por settings.update via RLS. Mantém organizations sincronizada com os dados
-- editados na configuração da empresa.

begin;

drop trigger if exists restrict_partner_company_settings_mutation
  on public.organization_company_settings;

drop function if exists private.restrict_partner_company_settings_mutation();

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

  select organization.organization_type
    into v_organization_type
  from public.organizations organization
  where organization.id = new.organization_id;

  if v_organization_type <> 'partner' then
    return new;
  end if;

  update public.organizations organization
  set
    name = new.name,
    legal_name = new.legal_name,
    document = new.document,
    settings = coalesce(organization.settings, '{}'::jsonb)
      || jsonb_build_object(
        'phone', new.phone,
        'email', new.email,
        'zip_code', new.zip_code,
        'street', new.street,
        'number', new.number,
        'complement', new.complement,
        'neighborhood', new.neighborhood,
        'city', new.city,
        'state', new.state,
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
after update of
  name,
  legal_name,
  document,
  phone,
  email,
  zip_code,
  street,
  number,
  complement,
  neighborhood,
  city,
  state,
  logo_media_id,
  menu_logo_media_id
on public.organization_company_settings
for each row
execute function private.sync_partner_company_editable_fields_to_organization();

commit;
