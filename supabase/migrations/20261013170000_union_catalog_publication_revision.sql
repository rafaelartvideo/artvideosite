-- Union World - catálogo versionado e publicação controlada.
-- A Union publica diretamente, sem fluxo de aceite nas empresas parceiras.
-- Itens antigos não são importados ou alterados por esta migração.

alter table public.catalog_equipment_types add column if not exists is_published boolean not null default false;
alter table public.catalog_brands add column if not exists is_published boolean not null default false;
create index if not exists catalog_equipment_published_idx on public.catalog_equipment_types(is_active,is_published,sort_order,name);
create index if not exists catalog_brand_published_idx on public.catalog_brands(is_active,is_published,name);

create table if not exists public.union_catalog_revision_state (
 singleton boolean primary key default true check (singleton),
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.union_catalog_revision_state(singleton,revision) values(true,0) on conflict(singleton) do nothing;
alter table public.union_catalog_revision_state enable row level security;
revoke all on public.union_catalog_revision_state from anon,authenticated;

create or replace function private.bump_union_catalog_revision_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.union_catalog_revision_state set revision=revision+1,updated_at=now() where singleton=true;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;

drop trigger if exists business_segments_revision_bump on public.business_segments;
create trigger business_segments_revision_bump after insert or update or delete on public.business_segments for each row execute function private.bump_union_catalog_revision_v1();
drop trigger if exists catalog_equipment_types_revision_bump on public.catalog_equipment_types;
create trigger catalog_equipment_types_revision_bump after insert or update or delete on public.catalog_equipment_types for each row execute function private.bump_union_catalog_revision_v1();
drop trigger if exists catalog_brands_revision_bump on public.catalog_brands;
create trigger catalog_brands_revision_bump after insert or update or delete on public.catalog_brands for each row execute function private.bump_union_catalog_revision_v1();
drop trigger if exists segment_equipment_types_revision_bump on public.segment_equipment_types;
create trigger segment_equipment_types_revision_bump after insert or update or delete on public.segment_equipment_types for each row execute function private.bump_union_catalog_revision_v1();
drop trigger if exists catalog_equipment_brands_revision_bump on public.catalog_equipment_brands;
create trigger catalog_equipment_brands_revision_bump after insert or update or delete on public.catalog_equipment_brands for each row execute function private.bump_union_catalog_revision_v1();
drop trigger if exists catalog_technical_field_templates_revision_bump on public.catalog_technical_field_templates;
create trigger catalog_technical_field_templates_revision_bump after insert or update or delete on public.catalog_technical_field_templates for each row execute function private.bump_union_catalog_revision_v1();
drop trigger if exists catalog_checklist_item_templates_revision_bump on public.catalog_checklist_item_templates;
create trigger catalog_checklist_item_templates_revision_bump after insert or update or delete on public.catalog_checklist_item_templates for each row execute function private.bump_union_catalog_revision_v1();

-- APIs: consulta só oferece itens publicados; gravação mantém publicação na mesma transação.

create or replace function public.load_union_catalog_admin_v1()
returns jsonb
language plpgsql stable security definer
set search_path=''
as $$
begin
  if auth.uid() is null
     or not private.has_platform_permission('platform.catalog.view')
  then
    raise exception 'Sem permissão para consultar o Catálogo Inteligente da Union.' using errcode='42501';
  end if;

  return jsonb_build_object(
    'revision', coalesce((select revision from public.union_catalog_revision_state where singleton),0),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,
        'description',s.description,'icon_name',s.icon_name,'sort_order',s.sort_order,
        'is_active',s.is_active) order by s.sort_order,s.name)
      from public.business_segments s
    ),'[]'::jsonb),
    'equipmentTypes', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'name',t.name,
        'sort_order',t.sort_order,'is_active',t.is_active,'is_published',t.is_published) order by t.sort_order,t.name)
      from public.catalog_equipment_types t
    ),'[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,
        'is_active',b.is_active,'is_published',b.is_published) order by b.name)
      from public.catalog_brands b
    ),'[]'::jsonb),
    'segmentEquipment', coalesce((
      select jsonb_agg(jsonb_build_object('segment_id',x.segment_id,'equipment_type_id',x.equipment_type_id))
      from public.segment_equipment_types x
    ),'[]'::jsonb),
    'equipmentBrands', coalesce((
      select jsonb_agg(jsonb_build_object('equipment_type_id',x.equipment_type_id,'brand_id',x.brand_id))
      from public.catalog_equipment_brands x
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.save_union_catalog_item_v1(
  p_kind text,
  p_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql security definer
set search_path=''
as $$
declare
 v_id uuid;
 v_name text;
 v_code text;
 v_description text;
 v_icon text;
 v_sort integer;
 v_active boolean;
 v_published boolean;
begin
 if auth.uid() is null
    or not private.has_platform_permission('platform.catalog.manage')
 then
   raise exception 'Sem permissão para gerenciar o Catálogo Inteligente.' using errcode='42501';
 end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
   raise exception 'Dados inválidos.' using errcode='22023';
 end if;

 v_name:=btrim(coalesce(p_payload->>'name',''));
 v_code:=lower(btrim(coalesce(p_payload->>'code','')));
 v_description:=btrim(coalesce(p_payload->>'description',''));
 v_icon:=btrim(coalesce(p_payload->>'icon_name','briefcase-business'));
 v_sort:=coalesce((p_payload->>'sort_order')::integer,0);
 v_active:=coalesce((p_payload->>'is_active')::boolean,true);
 v_published:=coalesce((p_payload->>'is_published')::boolean,false);

 if length(v_name) < 2 or length(v_name) > 120 then
   raise exception 'Informe um nome com 2 a 120 caracteres.' using errcode='22023';
 end if;
 if v_sort < 0 or v_sort > 1000000 then
   raise exception 'A ordem deve estar entre 0 e 1.000.000.' using errcode='22023';
 end if;

 if p_kind = 'segment' then
   if length(v_description) > 350 or length(v_icon) > 60 or v_icon !~ '^[a-z0-9-]+$' then
     raise exception 'Descrição ou ícone inválidos.' using errcode='22023';
   end if;
   if p_id is null then
     if v_code !~ '^[a-z0-9-]{2,60}$' then
       raise exception 'Código de segmento inválido. Use letras minúsculas, números ou hífens.' using errcode='22023';
     end if;
     insert into public.business_segments(code,name,description,icon_name,sort_order,is_active)
       values(v_code,v_name,v_description,v_icon,v_sort,v_active)
       returning id into v_id;
   else
     if not v_active and exists (
       select 1 from public.organization_segments os where os.segment_id=p_id
     ) then
       raise exception 'Não é possível desativar um segmento selecionado por empresas.' using errcode='23503';
     end if;
     update public.business_segments
       set name=v_name,description=v_description,icon_name=v_icon,
           sort_order=v_sort,is_active=v_active,updated_at=now()
       where id=p_id returning id into v_id;
   end if;
 elsif p_kind = 'equipment' then
   if p_id is null then
     if v_code !~ '^[a-z0-9-]{2,60}$' then
       raise exception 'Código de equipamento inválido. Use letras minúsculas, números ou hífens.' using errcode='22023';
     end if;
     insert into public.catalog_equipment_types(code,name,sort_order,is_active,is_published)
       values(v_code,v_name,v_sort,v_active,v_published)
       returning id into v_id;
   else
     update public.catalog_equipment_types
       set name=v_name,sort_order=v_sort,is_active=v_active,is_published=v_published,updated_at=now()
       where id=p_id returning id into v_id;
   end if;
 elsif p_kind = 'brand' then
   if p_id is null then
     insert into public.catalog_brands(name,normalized_name,is_active,is_published)
       values(v_name,lower(public.normalize_visual_text(v_name)),v_active,v_published)
       returning id into v_id;
   else
     update public.catalog_brands
       set name=v_name,normalized_name=lower(public.normalize_visual_text(v_name)),
           is_active=v_active,is_published=v_published,updated_at=now()
       where id=p_id returning id into v_id;
   end if;
 else
   raise exception 'Tipo de cadastro inválido.' using errcode='22023';
 end if;

 if v_id is null then
   raise exception 'Cadastro não encontrado.' using errcode='P0002';
 end if;
 return v_id;
exception
 when unique_violation then
   raise exception 'Já existe um cadastro com este código ou nome.' using errcode='23505';
end;
$$;

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
    'revision', coalesce((select revision from public.union_catalog_revision_state where singleton),0),
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
        where t.is_active and t.is_published
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
        join public.catalog_brands b on b.id=cb.brand_id and b.is_active and b.is_published
        left join public.organization_catalog_brand_links lb
          on lb.organization_id=p_organization_id
          and lb.catalog_equipment_type_id=t.id
          and lb.catalog_brand_id=b.id
        left join public.equipment_brands local_brand on local_brand.id=lb.equipment_brand_id
        where t.is_active and t.is_published
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
  where t.id=p_catalog_equipment_type_id and t.is_active and t.is_published
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
    on cet.id=et.catalog_equipment_type_id and cet.is_active and cet.is_published
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
    and b.is_active and b.is_published;
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
