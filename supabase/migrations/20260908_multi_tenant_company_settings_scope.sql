-- Multiempresa: Dados da empresa por organização.
-- Separa informações institucionais das configurações do site e permite que
-- documentos de uma OS usem sempre os dados da empresa proprietária.

-- ---------------------------------------------------------------------------
-- 1/3: tabela, helpers e validação da logo.
-- ---------------------------------------------------------------------------
begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_company_settings_scope:schema', 0)
);

create table if not exists public.organization_company_settings (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  name text not null default '',
  legal_name text,
  document text,
  phone text,
  email text,
  zip_code text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  logo_media_id uuid references public.media(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_company_settings_name_not_blank
    check (btrim(name) <> ''),
  constraint organization_company_settings_state_check
    check (state is null or btrim(state) = '' or btrim(state) ~ '^[A-Za-z]{2}$')
);

create index if not exists organization_company_settings_logo_idx
  on public.organization_company_settings (logo_media_id)
  where logo_media_id is not null;

create or replace function private.can_read_company_settings(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and (
      (
        private.is_organization_member(p_organization_id)
        and (
          private.has_effective_organization_permission(
            p_organization_id,
            'settings.view'
          )
          or private.has_effective_organization_permission(
            p_organization_id,
            'documents.print'
          )
        )
      )
      or (
        private.can_access_shared_organization_resource(
          p_organization_id,
          'orders',
          'read'
        )
        and private.has_effective_organization_permission(
          p_organization_id,
          'documents.print'
        )
      )
    );
$$;

create or replace function private.can_manage_company_settings(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and private.is_organization_member(p_organization_id)
    and private.is_organization_module_enabled(
      p_organization_id,
      'company_settings'
    )
    and private.has_effective_organization_permission(
      p_organization_id,
      'settings.update'
    );
$$;

create or replace function private.validate_company_settings_logo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media_organization_id uuid;
  v_bucket_id text;
begin
  if new.logo_media_id is null then
    return new;
  end if;

  select media.organization_id, media.bucket_id
    into v_media_organization_id, v_bucket_id
  from public.media media
  where media.id = new.logo_media_id;

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

  return new;
end;
$$;

revoke all on function private.can_read_company_settings(uuid) from public;
revoke all on function private.can_manage_company_settings(uuid) from public;
revoke all on function private.validate_company_settings_logo() from public;
grant execute on function private.can_read_company_settings(uuid) to authenticated;
grant execute on function private.can_manage_company_settings(uuid) to authenticated;

drop trigger if exists organization_company_settings_validate_logo
  on public.organization_company_settings;
create trigger organization_company_settings_validate_logo
before insert or update of organization_id, logo_media_id
on public.organization_company_settings
for each row execute function private.validate_company_settings_logo();

commit;

-- ---------------------------------------------------------------------------
-- 2/3: backfill. Empresas parceiras usam os dados já cadastrados em
-- organizations; a ArtVideo também recebe os antigos company_* de site_settings.
-- ---------------------------------------------------------------------------
begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_company_settings_scope:backfill', 0)
);

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
  state
)
select
  organization.id,
  coalesce(nullif(btrim(organization.name), ''), 'Empresa'),
  nullif(btrim(coalesce(organization.legal_name, '')), ''),
  nullif(btrim(coalesce(organization.document, '')), ''),
  nullif(btrim(coalesce(organization.settings ->> 'phone', '')), ''),
  nullif(btrim(coalesce(organization.settings ->> 'email', '')), ''),
  nullif(btrim(coalesce(organization.settings ->> 'zip_code', '')), ''),
  nullif(btrim(coalesce(organization.settings ->> 'street', '')), ''),
  nullif(btrim(coalesce(organization.settings ->> 'number', '')), ''),
  nullif(btrim(coalesce(organization.settings ->> 'complement', '')), ''),
  nullif(btrim(coalesce(organization.settings ->> 'neighborhood', '')), ''),
  nullif(btrim(coalesce(organization.settings ->> 'city', '')), ''),
  nullif(upper(btrim(coalesce(organization.settings ->> 'state', ''))), '')
from public.organizations organization
on conflict (organization_id) do nothing;

with legacy as (
  select
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_name') as company_name,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_legal_name') as company_legal_name,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_cnpj') as company_cnpj,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_phone') as company_phone,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_email') as company_email,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_zip_code') as company_zip_code,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_street') as company_street,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_number') as company_number,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_complement') as company_complement,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_neighborhood') as company_neighborhood,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_city') as company_city,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_state') as company_state,
    max(to_jsonb(setting.setting_value) #>> '{}') filter (where setting.setting_key = 'company_logo_media_id') as company_logo_media_id
  from public.site_settings setting
  where setting.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
), normalized as (
  select
    nullif(btrim(company_name), '') as company_name,
    nullif(btrim(company_legal_name), '') as company_legal_name,
    nullif(btrim(company_cnpj), '') as company_cnpj,
    nullif(btrim(company_phone), '') as company_phone,
    nullif(btrim(company_email), '') as company_email,
    nullif(btrim(company_zip_code), '') as company_zip_code,
    nullif(btrim(company_street), '') as company_street,
    nullif(btrim(company_number), '') as company_number,
    nullif(btrim(company_complement), '') as company_complement,
    nullif(btrim(company_neighborhood), '') as company_neighborhood,
    nullif(btrim(company_city), '') as company_city,
    nullif(upper(btrim(company_state)), '') as company_state,
    case
      when company_logo_media_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then company_logo_media_id::uuid
      else null
    end as company_logo_media_id
  from legacy
)
update public.organization_company_settings company
set
  name = coalesce(normalized.company_name, company.name),
  legal_name = coalesce(normalized.company_legal_name, company.legal_name),
  document = coalesce(normalized.company_cnpj, company.document),
  phone = coalesce(normalized.company_phone, company.phone),
  email = coalesce(normalized.company_email, company.email),
  zip_code = coalesce(normalized.company_zip_code, company.zip_code),
  street = coalesce(normalized.company_street, company.street),
  number = coalesce(normalized.company_number, company.number),
  complement = coalesce(normalized.company_complement, company.complement),
  neighborhood = coalesce(normalized.company_neighborhood, company.neighborhood),
  city = coalesce(normalized.company_city, company.city),
  state = coalesce(normalized.company_state, company.state),
  logo_media_id = coalesce(normalized.company_logo_media_id, company.logo_media_id),
  updated_at = now()
from normalized
where company.organization_id = '00000000-0000-4000-8000-000000000001'::uuid;

commit;

-- ---------------------------------------------------------------------------
-- 3/3: RLS. Edição é somente da própria empresa; leitura também é permitida
-- para geração de documentos de OS explicitamente compartilhadas.
-- ---------------------------------------------------------------------------
begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_company_settings_scope:rls', 0)
);

alter table public.organization_company_settings enable row level security;

revoke all on table public.organization_company_settings from anon, authenticated;
grant select, insert, update on table public.organization_company_settings to authenticated;

drop policy if exists organization_company_settings_select
  on public.organization_company_settings;
drop policy if exists organization_company_settings_insert
  on public.organization_company_settings;
drop policy if exists organization_company_settings_update
  on public.organization_company_settings;

create policy organization_company_settings_select
on public.organization_company_settings
for select to authenticated
using (private.can_read_company_settings(organization_id));

create policy organization_company_settings_insert
on public.organization_company_settings
for insert to authenticated
with check (private.can_manage_company_settings(organization_id));

create policy organization_company_settings_update
on public.organization_company_settings
for update to authenticated
using (private.can_manage_company_settings(organization_id))
with check (private.can_manage_company_settings(organization_id));

comment on table public.organization_company_settings is
  'Dados institucionais próprios de cada empresa, usados em documentos e impressões. Não são configurações do site público.';

commit;
