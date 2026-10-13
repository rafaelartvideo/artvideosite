-- Union World: estrutura inicial do Catálogo Inteligente.
-- Migração aditiva: não copia, altera ou exclui cadastros de equipamentos existentes.

create table if not exists public.business_segments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  icon_name text not null default 'briefcase-business',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_segments_code_format check (code ~ '^[a-z0-9-]+$')
);

create table if not exists public.organization_segments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  segment_id uuid not null references public.business_segments(id),
  is_primary boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id, segment_id)
);

create unique index if not exists organization_segments_one_primary_uidx
  on public.organization_segments (organization_id) where is_primary;
create index if not exists organization_segments_segment_idx
  on public.organization_segments (segment_id);

-- Catálogo oficial vazio até aprovação da curadoria.
create table if not exists public.catalog_equipment_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.catalog_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.catalog_equipment_brands (
  equipment_type_id uuid not null references public.catalog_equipment_types(id),
  brand_id uuid not null references public.catalog_brands(id),
  primary key (equipment_type_id, brand_id)
);
create table if not exists public.segment_equipment_types (
  segment_id uuid not null references public.business_segments(id),
  equipment_type_id uuid not null references public.catalog_equipment_types(id),
  primary key (segment_id, equipment_type_id)
);
create table if not exists public.catalog_models (
  id uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null,
  brand_id uuid not null,
  name text not null,
  normalized_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (equipment_type_id, brand_id)
    references public.catalog_equipment_brands(equipment_type_id, brand_id),
  unique (equipment_type_id, brand_id, normalized_name)
);
create index if not exists catalog_models_lookup_idx
  on public.catalog_models(equipment_type_id, brand_id, normalized_name);

-- Somente funções autorizadas expõem dados e aplicam alterações de segmentos.
alter table public.business_segments enable row level security;
alter table public.organization_segments enable row level security;
alter table public.catalog_equipment_types enable row level security;
alter table public.catalog_brands enable row level security;
alter table public.catalog_equipment_brands enable row level security;
alter table public.segment_equipment_types enable row level security;
alter table public.catalog_models enable row level security;

revoke all on public.business_segments, public.organization_segments,
  public.catalog_equipment_types, public.catalog_brands,
  public.catalog_equipment_brands, public.segment_equipment_types,
  public.catalog_models from anon, authenticated;

-- Apenas metadados de segmentos. Nenhum equipamento, marca ou modelo é importado.
insert into public.business_segments(code,name,description,icon_name,sort_order) values
 ('assistencia-mobile','Assistência Mobile','Celulares, tablets e dispositivos móveis','smartphone',10),
 ('assistencia-tecnica','Assistência Técnica','Eletrodomésticos e eletrônicos em geral','wrench',20),
 ('climatizacao','Climatização','Ar-condicionado, refrigeração e HVAC','snowflake',30),
 ('informatica','Informática','Computadores, impressoras e periféricos','monitor',40),
 ('oficina-mecanica','Oficina Mecânica','Carros, motos e manutenção automotiva','car-front',50),
 ('energia-solar','Energia Solar','Equipamentos e sistemas fotovoltaicos','sun',60),
 ('personalizado','Personalizado / Outros','Configure um segmento próprio para sua operação','sliders-horizontal',70)
on conflict (code) do nothing;

create or replace function public.get_company_segments_v1(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_segments jsonb;
  v_primary_code text;
  v_additional_codes jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'Sem acesso a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', s.code, 'name', s.name, 'description', s.description, 'icon', s.icon_name
  ) order by s.sort_order, s.name), '[]'::jsonb)
  into v_segments from public.business_segments s where s.is_active = true;

  select s.code into v_primary_code
    from public.organization_segments os
    join public.business_segments s on s.id = os.segment_id
   where os.organization_id = p_organization_id and os.is_primary
   limit 1;

  select coalesce(jsonb_agg(s.code order by s.sort_order), '[]'::jsonb)
    into v_additional_codes
    from public.organization_segments os
    join public.business_segments s on s.id = os.segment_id
   where os.organization_id = p_organization_id and not os.is_primary;

  return jsonb_build_object(
    'segments', v_segments, 'primaryCode', v_primary_code,
    'additionalCodes', v_additional_codes,
    'configured', v_primary_code is not null
  );
end;
$$;

create or replace function public.save_company_segments_v1(
  p_organization_id uuid,
  p_primary_code text,
  p_additional_codes text[] default '{}'::text[]
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_codes text[];
  v_requested_count integer;
  v_available_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid() and m.status = 'active' and m.is_owner = true
  ) then
    raise exception 'Apenas o proprietário pode definir os segmentos.' using errcode = '42501';
  end if;

  select array_agg(distinct code) into v_codes from (
    select unnest(array[p_primary_code] || coalesce(p_additional_codes, '{}'::text[])) as code
  ) requested where code is not null and code <> '';

  v_requested_count := coalesce(array_length(v_codes,1),0);
  if p_primary_code is null or p_primary_code = '' or v_requested_count = 0 or v_requested_count > 7 then
    raise exception 'Selecione um segmento principal válido.' using errcode = '22023';
  end if;
  select count(*) into v_available_count
    from public.business_segments s
    where s.code = any(v_codes) and s.is_active;
  if v_available_count <> v_requested_count then
    raise exception 'Há segmentos inválidos ou desativados.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':segments', 0));
  delete from public.organization_segments where organization_id = p_organization_id;
  insert into public.organization_segments(organization_id, segment_id, is_primary, created_by)
    select p_organization_id, s.id, s.code = p_primary_code, auth.uid()
      from public.business_segments s where s.code = any(v_codes);
end;
$$;

revoke all on function public.get_company_segments_v1(uuid) from public, anon;
revoke all on function public.save_company_segments_v1(uuid,text,text[]) from public, anon;
grant execute on function public.get_company_segments_v1(uuid) to authenticated;
grant execute on function public.save_company_segments_v1(uuid,text,text[]) to authenticated;
