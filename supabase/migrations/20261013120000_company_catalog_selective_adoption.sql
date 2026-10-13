-- Union World: catálogo oficial por segmento, adoção seletiva na empresa.
-- Não preenche equipamentos automaticamente e não importa modelos.
create table if not exists public.organization_catalog_equipment_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_equipment_type_id uuid not null references public.catalog_equipment_types(id),
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id, catalog_equipment_type_id),
  unique (organization_id, equipment_type_id)
);

create table if not exists public.organization_catalog_brand_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_equipment_type_id uuid not null,
  catalog_brand_id uuid not null,
  equipment_brand_id uuid not null references public.equipment_brands(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id, catalog_equipment_type_id, catalog_brand_id),
  unique (organization_id, equipment_brand_id),
  foreign key (catalog_equipment_type_id, catalog_brand_id)
    references public.catalog_equipment_brands(equipment_type_id, brand_id)
);

create index if not exists organization_catalog_equipment_links_type_idx
  on public.organization_catalog_equipment_links (equipment_type_id);
create index if not exists organization_catalog_brand_links_brand_idx
  on public.organization_catalog_brand_links (equipment_brand_id);

alter table public.organization_catalog_equipment_links enable row level security;
alter table public.organization_catalog_brand_links enable row level security;
revoke all on public.organization_catalog_equipment_links,
  public.organization_catalog_brand_links from anon, authenticated;

create or replace function public.load_company_catalog_suggestions_v1(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=''
as $$
begin
  if auth.uid() is null
    or not exists (
      select 1
      from public.organization_members om
      join public.organizations o on o.id=om.organization_id
      where om.user_id=auth.uid()
        and om.organization_id=p_organization_id
        and om.status='active' and o.status='active'
    )
    or not private.can_manage_own_operation_config(
      p_organization_id, 'equipment', 'equipment.view'
    )
  then
    raise exception 'Sem permissão para consultar o catálogo sugerido.' using errcode='42501';
  end if;

  return jsonb_build_object(
    'hasSegments', exists(
      select 1 from public.organization_segments os
      where os.organization_id=p_organization_id
    ),
    'equipmentTypes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.name) from (
        select distinct
          t.id,t.code,t.name,
          link.equipment_type_id as local_equipment_type_id,
          local_type.name as local_name,
          local_type.is_active as local_is_active
        from public.catalog_equipment_types t
        join public.segment_equipment_types ste on ste.equipment_type_id=t.id
        join public.organization_segments os
          on os.segment_id=ste.segment_id
          and os.organization_id=p_organization_id
        join public.business_segments s on s.id=os.segment_id and s.is_active
        left join public.organization_catalog_equipment_links link
          on link.organization_id=p_organization_id
          and link.catalog_equipment_type_id=t.id
        left join public.equipment_types local_type on local_type.id=link.equipment_type_id
        where t.is_active
      ) x
    ), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.equipment_type_id,x.name) from (
        select distinct
          cb.equipment_type_id,
          b.id,b.name,
          lb.equipment_brand_id as local_equipment_brand_id,
          local_brand.name as local_name,
          local_brand.is_active as local_is_active
        from public.catalog_equipment_types t
        join public.segment_equipment_types ste on ste.equipment_type_id=t.id
        join public.organization_segments os
          on os.segment_id=ste.segment_id
          and os.organization_id=p_organization_id
        join public.business_segments s on s.id=os.segment_id and s.is_active
        join public.catalog_equipment_brands cb on cb.equipment_type_id=t.id
        join public.catalog_brands b on b.id=cb.brand_id and b.is_active
        left join public.organization_catalog_brand_links lb
          on lb.organization_id=p_organization_id
          and lb.catalog_equipment_type_id=t.id
          and lb.catalog_brand_id=b.id
        left join public.equipment_brands local_brand on local_brand.id=lb.equipment_brand_id
        where t.is_active
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.adopt_union_catalog_equipment_v1(
  p_organization_id uuid, p_catalog_equipment_type_id uuid
)
returns uuid
language plpgsql security definer
set search_path=''
as $$
declare
  v_catalog public.catalog_equipment_types%rowtype;
  v_equipment_id uuid;
begin
  if auth.uid() is null
    or not exists (
      select 1 from public.organization_members om
      join public.organizations o on o.id=om.organization_id
      where om.user_id=auth.uid() and om.organization_id=p_organization_id
        and om.status='active' and o.status='active'
        and not private.is_platform_organization(o.id)
    )
    or not private.can_manage_own_operation_config(
      p_organization_id,'equipment','equipment.create'
    )
  then
    raise exception 'Sem permissão para adicionar equipamentos.' using errcode='42501';
  end if;

  select t.* into v_catalog
  from public.catalog_equipment_types t
  where t.id=p_catalog_equipment_type_id and t.is_active
    and exists(
      select 1
      from public.segment_equipment_types ste
      join public.organization_segments os on os.segment_id=ste.segment_id
      join public.business_segments s on s.id=os.segment_id
      where ste.equipment_type_id=t.id and os.organization_id=p_organization_id
        and s.is_active
    );
  if not found then
    raise exception 'Equipamento não disponível para os segmentos desta empresa.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':union-type:'||p_catalog_equipment_type_id::text,0
  ));
  select link.equipment_type_id into v_equipment_id
  from public.organization_catalog_equipment_links link
  where link.organization_id=p_organization_id
    and link.catalog_equipment_type_id=p_catalog_equipment_type_id;

  if v_equipment_id is not null then
    return v_equipment_id;
  end if;

  select t.id into v_equipment_id
  from public.equipment_types t
  where t.organization_id=p_organization_id
    and lower(public.normalize_visual_text(t.name)) =
        lower(public.normalize_visual_text(v_catalog.name))
  limit 1;

  if v_equipment_id is null then
    insert into public.equipment_types(organization_id,name,slug,is_active,sort_order)
      values(
        p_organization_id,v_catalog.name,
        'union-'||replace(v_catalog.id::text,'-',''),true,v_catalog.sort_order
      )
      on conflict do nothing
      returning id into v_equipment_id;

    if v_equipment_id is null then
      select t.id into v_equipment_id
      from public.equipment_types t
      where t.organization_id=p_organization_id
        and lower(public.normalize_visual_text(t.name)) =
            lower(public.normalize_visual_text(v_catalog.name))
      limit 1;
    end if;
  end if;

  if v_equipment_id is null then
    raise exception 'Não foi possível vincular o equipamento ao cadastro local.' using errcode='23505';
  end if;

  insert into public.organization_catalog_equipment_links(
    organization_id,catalog_equipment_type_id,equipment_type_id,created_by
  ) values(
    p_organization_id,p_catalog_equipment_type_id,v_equipment_id,auth.uid()
  ) on conflict do nothing;

  if not exists (
    select 1 from public.organization_catalog_equipment_links
    where organization_id=p_organization_id
      and catalog_equipment_type_id=p_catalog_equipment_type_id
      and equipment_type_id=v_equipment_id
  ) then
    raise exception 'Já existe outro vínculo oficial para este cadastro local.' using errcode='23505';
  end if;
  return v_equipment_id;
end;
$$;

create or replace function public.adopt_union_catalog_brand_v1(
  p_organization_id uuid,
  p_catalog_equipment_type_id uuid,
  p_catalog_brand_id uuid
)
returns uuid
language plpgsql security definer
set search_path=''
as $$
declare
  v_type_id uuid;
  v_brand public.catalog_brands%rowtype;
  v_local_brand_id uuid;
begin
  if auth.uid() is null
    or not exists (
      select 1 from public.organization_members om
      join public.organizations o on o.id=om.organization_id
      where om.user_id=auth.uid() and om.organization_id=p_organization_id
        and om.status='active' and o.status='active'
        and not private.is_platform_organization(o.id)
    )
    or not private.can_manage_own_operation_config(
      p_organization_id,'equipment','equipment.create'
    )
  then
    raise exception 'Sem permissão para adicionar marcas.' using errcode='42501';
  end if;

  select et.equipment_type_id into v_type_id
  from public.organization_catalog_equipment_links et
  join public.catalog_equipment_types cet
    on cet.id=et.catalog_equipment_type_id and cet.is_active
  join public.equipment_types local_t
    on local_t.id=et.equipment_type_id and local_t.organization_id=p_organization_id
  where et.organization_id=p_organization_id
    and et.catalog_equipment_type_id=p_catalog_equipment_type_id
    and exists(
      select 1
      from public.segment_equipment_types ste
      join public.organization_segments os on os.segment_id=ste.segment_id
      join public.business_segments s on s.id=os.segment_id and s.is_active
      where ste.equipment_type_id=cet.id and os.organization_id=p_organization_id
    );
  if v_type_id is null then
    raise exception 'Adicione primeiro o equipamento oficial à empresa.' using errcode='22023';
  end if;

  select b.* into v_brand
  from public.catalog_brands b
  join public.catalog_equipment_brands ceb on ceb.brand_id=b.id
  where b.id=p_catalog_brand_id and ceb.equipment_type_id=p_catalog_equipment_type_id
    and b.is_active;
  if not found then
    raise exception 'Marca não disponível para este equipamento.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':union-brand:'||
      p_catalog_equipment_type_id::text||':'||p_catalog_brand_id::text,0
  ));
  select link.equipment_brand_id into v_local_brand_id
  from public.organization_catalog_brand_links link
  where link.organization_id=p_organization_id
    and link.catalog_equipment_type_id=p_catalog_equipment_type_id
    and link.catalog_brand_id=p_catalog_brand_id;
  if v_local_brand_id is not null then
    return v_local_brand_id;
  end if;

  select b.id into v_local_brand_id
  from public.equipment_brands b
  where b.organization_id=p_organization_id and b.equipment_type_id=v_type_id
    and lower(public.normalize_visual_text(b.name)) =
        lower(public.normalize_visual_text(v_brand.name))
  limit 1;

  if v_local_brand_id is null then
    insert into public.equipment_brands(
      organization_id,equipment_type_id,name,slug,is_active,sort_order
    ) values(
      p_organization_id,v_type_id,v_brand.name,
      'union-'||replace(v_brand.id::text,'-',''),true,0
    ) on conflict do nothing
    returning id into v_local_brand_id;

    if v_local_brand_id is null then
      select b.id into v_local_brand_id
      from public.equipment_brands b
      where b.organization_id=p_organization_id and b.equipment_type_id=v_type_id
        and lower(public.normalize_visual_text(b.name)) =
            lower(public.normalize_visual_text(v_brand.name))
      limit 1;
    end if;
  end if;

  if v_local_brand_id is null then
    raise exception 'Não foi possível vincular a marca ao cadastro local.' using errcode='23505';
  end if;
  insert into public.organization_catalog_brand_links(
    organization_id,catalog_equipment_type_id,catalog_brand_id,equipment_brand_id,created_by
  ) values(
    p_organization_id,p_catalog_equipment_type_id,p_catalog_brand_id,v_local_brand_id,auth.uid()
  ) on conflict do nothing;

  if not exists (
    select 1 from public.organization_catalog_brand_links
    where organization_id=p_organization_id
      and catalog_equipment_type_id=p_catalog_equipment_type_id
      and catalog_brand_id=p_catalog_brand_id
      and equipment_brand_id=v_local_brand_id
  ) then
    raise exception 'Já existe outro vínculo oficial para esta marca local.' using errcode='23505';
  end if;
  return v_local_brand_id;
end;
$$;

revoke all on function public.load_company_catalog_suggestions_v1(uuid) from public,anon;
revoke all on function public.adopt_union_catalog_equipment_v1(uuid,uuid) from public,anon;
revoke all on function public.adopt_union_catalog_brand_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.load_company_catalog_suggestions_v1(uuid) to authenticated;
grant execute on function public.adopt_union_catalog_equipment_v1(uuid,uuid) to authenticated;
grant execute on function public.adopt_union_catalog_brand_v1(uuid,uuid,uuid) to authenticated;
