begin;

alter table public.organization_company_settings
  add column if not exists menu_logo_media_id uuid
  references public.media(id) on delete set null;

create index if not exists organization_company_settings_menu_logo_idx
  on public.organization_company_settings(menu_logo_media_id)
  where menu_logo_media_id is not null;

create or replace function private.validate_company_settings_logo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media_id uuid;
  v_media_organization_id uuid;
  v_bucket_id text;
begin
  foreach v_media_id in array array[new.logo_media_id, new.menu_logo_media_id]
  loop
    if v_media_id is null then
      continue;
    end if;

    select media.organization_id, media.bucket_id
      into v_media_organization_id, v_bucket_id
    from public.media media
    where media.id = v_media_id;

    if not found then
      raise exception 'Logo não encontrada.' using errcode = '23503';
    end if;

    if v_media_organization_id is distinct from new.organization_id then
      raise exception 'A logo selecionada pertence a outra empresa.'
        using errcode = '42501';
    end if;

    if v_bucket_id is distinct from 'public-assets' then
      raise exception 'A logo da empresa deve estar no bucket public-assets.'
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists organization_company_settings_validate_logo
  on public.organization_company_settings;
create trigger organization_company_settings_validate_logo
before insert or update of organization_id, logo_media_id, menu_logo_media_id
on public.organization_company_settings
for each row execute function private.validate_company_settings_logo();

create or replace function private.sync_partner_company_settings_from_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb := coalesce(new.settings, '{}'::jsonb);
  v_logo_media_id uuid;
  v_menu_logo_media_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.organization_type <> 'partner'
     or new.id = '00000000-0000-4000-8000-000000000001'::uuid then
    return new;
  end if;

  if coalesce(v_settings ->> 'company_logo_media_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_logo_media_id := (v_settings ->> 'company_logo_media_id')::uuid;
  end if;

  if coalesce(v_settings ->> 'menu_logo_media_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_menu_logo_media_id := (v_settings ->> 'menu_logo_media_id')::uuid;
  end if;

  insert into public.organization_company_settings (
    organization_id,
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
    menu_logo_media_id,
    updated_at
  )
  values (
    new.id,
    coalesce(nullif(btrim(new.name), ''), 'Empresa'),
    nullif(btrim(coalesce(new.legal_name, '')), ''),
    nullif(btrim(coalesce(new.document, '')), ''),
    nullif(btrim(coalesce(v_settings ->> 'phone', '')), ''),
    nullif(btrim(coalesce(v_settings ->> 'email', '')), ''),
    nullif(btrim(coalesce(v_settings ->> 'zip_code', '')), ''),
    nullif(btrim(coalesce(v_settings ->> 'street', '')), ''),
    nullif(btrim(coalesce(v_settings ->> 'number', '')), ''),
    nullif(btrim(coalesce(v_settings ->> 'complement', '')), ''),
    nullif(btrim(coalesce(v_settings ->> 'neighborhood', '')), ''),
    nullif(btrim(coalesce(v_settings ->> 'city', '')), ''),
    nullif(upper(btrim(coalesce(v_settings ->> 'state', ''))), ''),
    v_logo_media_id,
    v_menu_logo_media_id,
    now()
  )
  on conflict (organization_id) do update
  set
    name = excluded.name,
    legal_name = excluded.legal_name,
    document = excluded.document,
    phone = excluded.phone,
    email = excluded.email,
    zip_code = excluded.zip_code,
    street = excluded.street,
    number = excluded.number,
    complement = excluded.complement,
    neighborhood = excluded.neighborhood,
    city = excluded.city,
    state = excluded.state,
    logo_media_id = excluded.logo_media_id,
    menu_logo_media_id = excluded.menu_logo_media_id,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_partner_company_settings_from_organization() from public;

drop trigger if exists sync_partner_company_settings_from_organization
  on public.organizations;
create trigger sync_partner_company_settings_from_organization
after insert or update of name, legal_name, document, settings, organization_type
on public.organizations
for each row
execute function private.sync_partner_company_settings_from_organization();

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
     or new.state is distinct from old.state
     or new.logo_media_id is distinct from old.logo_media_id
     or new.menu_logo_media_id is distinct from old.menu_logo_media_id then
    raise exception 'Nesta empresa, somente telefone e e-mail podem ser alterados.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.restrict_partner_company_settings_mutation() from public;

drop trigger if exists restrict_partner_company_settings_mutation
  on public.organization_company_settings;
create trigger restrict_partner_company_settings_mutation
before insert or update
on public.organization_company_settings
for each row
execute function private.restrict_partner_company_settings_mutation();

create or replace function private.sync_partner_company_contacts_to_organization()
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
     and new.email is not distinct from old.email then
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
      || jsonb_build_object('phone', new.phone, 'email', new.email),
    updated_at = now()
  where organization.id = new.organization_id;

  return new;
end;
$$;

revoke all on function private.sync_partner_company_contacts_to_organization() from public;

drop trigger if exists sync_partner_company_contacts_to_organization
  on public.organization_company_settings;
create trigger sync_partner_company_contacts_to_organization
after update of phone, email
on public.organization_company_settings
for each row
execute function private.sync_partner_company_contacts_to_organization();

do $$
declare
  partner public.organizations%rowtype;
begin
  for partner in
    select *
    from public.organizations
    where organization_type = 'partner'
      and id <> '00000000-0000-4000-8000-000000000001'::uuid
  loop
    insert into public.organization_company_settings (
      organization_id, name, legal_name, document, phone, email,
      zip_code, street, number, complement, neighborhood, city, state,
      logo_media_id, menu_logo_media_id, updated_at
    )
    values (
      partner.id,
      coalesce(nullif(btrim(partner.name), ''), 'Empresa'),
      nullif(btrim(coalesce(partner.legal_name, '')), ''),
      nullif(btrim(coalesce(partner.document, '')), ''),
      nullif(btrim(coalesce(partner.settings ->> 'phone', '')), ''),
      nullif(btrim(coalesce(partner.settings ->> 'email', '')), ''),
      nullif(btrim(coalesce(partner.settings ->> 'zip_code', '')), ''),
      nullif(btrim(coalesce(partner.settings ->> 'street', '')), ''),
      nullif(btrim(coalesce(partner.settings ->> 'number', '')), ''),
      nullif(btrim(coalesce(partner.settings ->> 'complement', '')), ''),
      nullif(btrim(coalesce(partner.settings ->> 'neighborhood', '')), ''),
      nullif(btrim(coalesce(partner.settings ->> 'city', '')), ''),
      nullif(upper(btrim(coalesce(partner.settings ->> 'state', ''))), ''),
      case
        when coalesce(partner.settings ->> 'company_logo_media_id', '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (partner.settings ->> 'company_logo_media_id')::uuid
        else null
      end,
      case
        when coalesce(partner.settings ->> 'menu_logo_media_id', '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (partner.settings ->> 'menu_logo_media_id')::uuid
        else null
      end,
      now()
    )
    on conflict (organization_id) do update
    set
      name = excluded.name,
      legal_name = excluded.legal_name,
      document = excluded.document,
      zip_code = excluded.zip_code,
      street = excluded.street,
      number = excluded.number,
      complement = excluded.complement,
      neighborhood = excluded.neighborhood,
      city = excluded.city,
      state = excluded.state,
      logo_media_id = coalesce(excluded.logo_media_id, public.organization_company_settings.logo_media_id),
      menu_logo_media_id = coalesce(excluded.menu_logo_media_id, public.organization_company_settings.menu_logo_media_id),
      phone = coalesce(public.organization_company_settings.phone, excluded.phone),
      email = coalesce(public.organization_company_settings.email, excluded.email),
      updated_at = now();
  end loop;
end;
$$;

commit;
