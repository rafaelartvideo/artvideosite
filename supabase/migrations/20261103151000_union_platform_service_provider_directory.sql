-- Directory owned exclusively by Union World (never by a partner tenant).
begin;

insert into public.permissions(key, label, description, module_name, sort_order)
values
 ('platform.providers.view','Visualizar prestadores','Consultar prestadores e serviços da Union World.','Prestadores de Serviços',987),
 ('platform.providers.manage','Gerenciar prestadores','Cadastrar e alterar prestadores, catálogo e anexos da Union World.','Prestadores de Serviços',988)
on conflict (key) do nothing;

-- Default manager access only in the platform's own organization.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.organization_id = public.platform_operator_organization_id()
  and lower(r.name) = 'gestor'
  and p.key in ('platform.providers.view','platform.providers.manage')
on conflict do nothing;

create table if not exists public.platform_provider_services (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.platform_operator_organization_id() references public.organizations(id),
 name text not null check (char_length(btrim(name)) between 2 and 120),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,organization_id)
);
create unique index if not exists platform_provider_services_unique_name
  on public.platform_provider_services(organization_id,lower(btrim(name)));

create table if not exists public.platform_service_providers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.platform_operator_organization_id() references public.organizations(id),
 name text not null check (char_length(btrim(name)) between 2 and 160),
 document text,
 phone text,
 whatsapp text,
 email text,
 state text not null check (state ~ '^[A-Z]{2}$'),
 city text not null check (char_length(btrim(city)) between 2 and 120),
 neighborhood text,
 street text,
 street_number text,
 zip_code text,
 notes text,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,organization_id)
);
create index if not exists platform_providers_location_idx
  on public.platform_service_providers(organization_id,state,city);
create index if not exists platform_providers_name_idx
  on public.platform_service_providers(organization_id,name);

create table if not exists public.platform_provider_service_links (
 organization_id uuid not null default public.platform_operator_organization_id(),
 provider_id uuid not null,
 service_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(provider_id,service_id),
 foreign key (provider_id,organization_id) references public.platform_service_providers(id,organization_id) on delete cascade,
 foreign key (service_id,organization_id) references public.platform_provider_services(id,organization_id)
);
create index if not exists platform_provider_service_lookup_idx
  on public.platform_provider_service_links(service_id,provider_id);

create table if not exists public.platform_provider_attachments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.platform_operator_organization_id(),
 provider_id uuid not null,
 storage_path text not null unique,
 file_name text not null,
 mime_type text,
 file_size bigint not null check(file_size between 0 and 10485760),
 created_at timestamptz not null default now(),
 foreign key(provider_id,organization_id) references public.platform_service_providers(id,organization_id) on delete cascade
);
create index if not exists platform_provider_attachments_provider_idx
  on public.platform_provider_attachments(provider_id);

-- The organization itself and the active platform membership are both checked.
-- Permission to another company's CRM never grants access here.
do $$
declare t text;
begin
 foreach t in array array['platform_provider_services','platform_service_providers','platform_provider_service_links','platform_provider_attachments']
 loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on table public.%I from public, anon, authenticated',t);
   execute format('grant select, insert, update, delete on table public.%I to authenticated',t);
   execute format('create policy %I on public.%I for select to authenticated using (organization_id = (select public.platform_operator_organization_id()) and (select private.has_organization_permission(public.platform_operator_organization_id(), %L)))',t||'_read',t,'platform.providers.view');
   execute format('create policy %I on public.%I for insert to authenticated with check (organization_id = (select public.platform_operator_organization_id()) and (select private.has_organization_permission(public.platform_operator_organization_id(), %L)))',t||'_insert',t,'platform.providers.manage');
   execute format('create policy %I on public.%I for update to authenticated using (organization_id = (select public.platform_operator_organization_id()) and (select private.has_organization_permission(public.platform_operator_organization_id(), %L))) with check (organization_id = (select public.platform_operator_organization_id()) and (select private.has_organization_permission(public.platform_operator_organization_id(), %L)))',t||'_update',t,'platform.providers.manage','platform.providers.manage');
   execute format('create policy %I on public.%I for delete to authenticated using (organization_id = (select public.platform_operator_organization_id()) and (select private.has_organization_permission(public.platform_operator_organization_id(), %L)))',t||'_delete',t,'platform.providers.manage');
 end loop;
end $$;

-- Seed the catalog once; user-created specialties remain editable.
insert into public.platform_provider_services (organization_id,name)
select public.platform_operator_organization_id(), specialty
from unnest(array[
'Ajudante de obras','Azulejista','Bombeiro hidráulico','Carpinteiro','Chaveiro',
'Eletricista','Encanador','Gesseiro','Instalador de ar-condicionado',
'Instalador de câmeras','Instalador de energia solar','Jardineiro',
'Marceneiro','Mecânico','Montador de móveis','Pedreiro','Pintor',
'Serralheiro','Técnico de refrigeração','Vidraceiro'
]::text[]) specialty
on conflict do nothing;

-- Atomic insert/update of provider and its selected specialties.
create or replace function public.save_platform_service_provider(
 p_provider_id uuid, p_payload jsonb, p_service_ids uuid[]
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid := public.platform_operator_organization_id();
  v_id uuid := coalesce(p_provider_id,gen_random_uuid());
  v_service_ids uuid[];
  v_name text := btrim(coalesce(p_payload->>'name',''));
  v_state text := upper(btrim(coalesce(p_payload->>'state','')));
  v_city text := btrim(coalesce(p_payload->>'city',''));
begin
  if not private.has_organization_permission(v_org,'platform.providers.manage') then
    raise exception 'Acesso negado ao cadastro de prestadores.' using errcode='42501';
  end if;
  select array_agg(distinct i) into v_service_ids from unnest(coalesce(p_service_ids,array[]::uuid[])) i where i is not null;
  if cardinality(coalesce(v_service_ids,array[]::uuid[])) = 0 then
    raise exception 'Selecione ao menos um serviço.';
  end if;
  if (select count(*) from public.platform_provider_services where organization_id=v_org and id=any(v_service_ids)) <> cardinality(v_service_ids) then
    raise exception 'Um ou mais serviços selecionados não existem.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 160 or v_state !~ '^[A-Z]{2}$'
     or char_length(v_city) < 2 or char_length(v_city) > 120 then
    raise exception 'Informe nome, estado e cidade válidos.';
  end if;
  if nullif(btrim(coalesce(p_payload->>'phone','')),'') is null
     and nullif(btrim(coalesce(p_payload->>'whatsapp','')),'') is null then
    raise exception 'Informe telefone ou WhatsApp.';
  end if;

  if p_provider_id is null then
    insert into public.platform_service_providers
      (id,organization_id,name,document,phone,whatsapp,email,state,city,neighborhood,street,street_number,zip_code,notes,is_active)
    values
      (v_id,v_org,v_name,nullif(btrim(p_payload->>'document'),''),
       nullif(btrim(p_payload->>'phone'),''),nullif(btrim(p_payload->>'whatsapp'),''),
       nullif(btrim(p_payload->>'email'),''),v_state,v_city,
       nullif(btrim(p_payload->>'neighborhood'),''),nullif(btrim(p_payload->>'street'),''),
       nullif(btrim(p_payload->>'street_number'),''),nullif(btrim(p_payload->>'zip_code'),''),
       nullif(btrim(p_payload->>'notes'),''),coalesce((p_payload->>'is_active')::boolean,true));
  else
    update public.platform_service_providers set
      name=v_name, document=nullif(btrim(p_payload->>'document'),''),
      phone=nullif(btrim(p_payload->>'phone'),''),whatsapp=nullif(btrim(p_payload->>'whatsapp'),''),
      email=nullif(btrim(p_payload->>'email'),''),state=v_state,city=v_city,
      neighborhood=nullif(btrim(p_payload->>'neighborhood'),''),
      street=nullif(btrim(p_payload->>'street'),''),
      street_number=nullif(btrim(p_payload->>'street_number'),''),
      zip_code=nullif(btrim(p_payload->>'zip_code'),''),
      notes=nullif(btrim(p_payload->>'notes'),''),
      is_active=coalesce((p_payload->>'is_active')::boolean,true),updated_at=now()
    where id=v_id and organization_id=v_org;
    if not found then
      raise exception 'Prestador não encontrado ou sem permissão.' using errcode='42501';
    end if;
  end if;
  delete from public.platform_provider_service_links
    where organization_id=v_org and provider_id=v_id and not (service_id=any(v_service_ids));
  insert into public.platform_provider_service_links(organization_id,provider_id,service_id)
  select v_org,v_id,i from unnest(v_service_ids) i on conflict do nothing;
  return v_id;
end $$;
revoke all on function public.save_platform_service_provider(uuid,jsonb,uuid[]) from public, anon;
grant execute on function public.save_platform_service_provider(uuid,jsonb,uuid[]) to authenticated;

-- Attachments stored privately with provider-specific prefix, never public URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('platform-provider-documents','platform-provider-documents',false,10485760,
 array['application/pdf','image/jpeg','image/png','image/webp','text/plain',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy platform_provider_files_read on storage.objects
for select to authenticated using (
 bucket_id='platform-provider-documents'
 and (storage.foldername(name))[1] = (select public.platform_operator_organization_id()::text)
 and (select private.has_organization_permission(public.platform_operator_organization_id(),'platform.providers.view'))
);
create policy platform_provider_files_insert on storage.objects
for insert to authenticated with check (
 bucket_id='platform-provider-documents'
 and (storage.foldername(name))[1] = (select public.platform_operator_organization_id()::text)
 and (select private.has_organization_permission(public.platform_operator_organization_id(),'platform.providers.manage'))
 and exists (
   select 1 from public.platform_service_providers p
   where p.id::text=(storage.foldername(name))[2]
     and p.organization_id=(select public.platform_operator_organization_id())
 )
);
create policy platform_provider_files_delete on storage.objects
for delete to authenticated using (
 bucket_id='platform-provider-documents'
 and (storage.foldername(name))[1] = (select public.platform_operator_organization_id()::text)
 and (select private.has_organization_permission(public.platform_operator_organization_id(),'platform.providers.manage'))
);

-- Legacy per-tenant provider roles are disallowed; no existing provider roles were found.
alter table public.entity_roles drop constraint if exists entity_roles_role_check;
alter table public.entity_roles add constraint entity_roles_role_check
  check (role = any(array['customer','employee','supplier']::text[]));

commit;
