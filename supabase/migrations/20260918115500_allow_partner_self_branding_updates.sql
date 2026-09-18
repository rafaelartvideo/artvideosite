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

commit;
