-- Union World: revisões explícitas e templates técnicos oficiais (sem importação em massa).
alter table public.organization_catalog_equipment_links
  add column if not exists official_name_snapshot text,
  add column if not exists reviewed_at timestamptz;
alter table public.organization_catalog_brand_links
  add column if not exists official_name_snapshot text,
  add column if not exists reviewed_at timestamptz;

create or replace function private.capture_union_catalog_name_on_adoption()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='organization_catalog_equipment_links' then
    select name into new.official_name_snapshot
      from public.catalog_equipment_types where id=new.catalog_equipment_type_id;
  elsif tg_table_name='organization_catalog_brand_links' then
    select name into new.official_name_snapshot
      from public.catalog_brands where id=new.catalog_brand_id;
  end if;
  new.reviewed_at := now();
  return new;
end; $$;

drop trigger if exists catalog_equipment_snapshot_on_insert on public.organization_catalog_equipment_links;
create trigger catalog_equipment_snapshot_on_insert
before insert on public.organization_catalog_equipment_links for each row
execute function private.capture_union_catalog_name_on_adoption();

drop trigger if exists catalog_brand_snapshot_on_insert on public.organization_catalog_brand_links;
create trigger catalog_brand_snapshot_on_insert
before insert on public.organization_catalog_brand_links for each row
execute function private.capture_union_catalog_name_on_adoption();

-- O preenchimento de snapshots antigos não altera os cadastros operacionais.
update public.organization_catalog_equipment_links l
   set official_name_snapshot=(select name from public.catalog_equipment_types c where c.id=l.catalog_equipment_type_id),
       reviewed_at=coalesce(l.reviewed_at,now())
 where l.official_name_snapshot is null;
update public.organization_catalog_brand_links l
   set official_name_snapshot=(select name from public.catalog_brands c where c.id=l.catalog_brand_id),
       reviewed_at=coalesce(l.reviewed_at,now())
 where l.official_name_snapshot is null;

create table if not exists public.catalog_technical_field_templates (
  id uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null references public.catalog_equipment_types(id),
  field_key text not null check (field_key ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  label text not null check (char_length(btrim(label)) between 2 and 120),
  field_type text not null check (field_type in ('text','number')),
  required boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_type_id,field_key)
);
create index if not exists catalog_technical_template_equipment_idx
  on public.catalog_technical_field_templates(equipment_type_id,is_active,sort_order);

create table if not exists public.catalog_checklist_item_templates (
  id uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null references public.catalog_equipment_types(id),
  stage_code text not null check (stage_code ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 2 and 180),
  description text,
  response_type text not null default 'conformity'
    check(response_type in ('conformity','yes_no','confirmation','text','number')),
  allow_na boolean not null default false,
  is_required boolean not null default true,
  photo_requirement text not null default 'none'
    check(photo_requirement in ('none','optional','required','required_on_failure')),
  observation_requirement text not null default 'none'
    check(observation_requirement in ('none','optional','required','required_on_failure')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists catalog_checklist_template_equipment_idx
 on public.catalog_checklist_item_templates(equipment_type_id,is_active,stage_code,sort_order);

alter table public.catalog_technical_field_templates enable row level security;
alter table public.catalog_checklist_item_templates enable row level security;
revoke all on public.catalog_technical_field_templates,public.catalog_checklist_item_templates from anon,authenticated;

create or replace function public.list_union_catalog_templates_v1(p_catalog_equipment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.has_platform_permission('platform.catalog.view') then
    raise exception 'Sem acesso aos templates oficiais.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'technical',coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort_order,t.label)
      from public.catalog_technical_field_templates t where t.equipment_type_id=p_catalog_equipment_id
    ),'[]'::jsonb),
    'checklists',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.stage_code,c.sort_order,c.title)
      from public.catalog_checklist_item_templates c where c.equipment_type_id=p_catalog_equipment_id
    ),'[]'::jsonb)
  );
end; $$;

create or replace function public.save_union_catalog_template_v1(
  p_kind text, p_id uuid, p_catalog_equipment_id uuid, p_payload jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_key text := btrim(coalesce(p_payload->>'field_key',''));
  v_label text := btrim(coalesce(p_payload->>'label',''));
  v_title text := btrim(coalesce(p_payload->>'title',''));
  v_stage text := btrim(coalesce(p_payload->>'stage_code',''));
  v_type text := coalesce(p_payload->>'field_type','text');
  v_response text := coalesce(p_payload->>'response_type','conformity');
  v_order integer := coalesce((p_payload->>'sort_order')::integer,0);
  v_active boolean := coalesce((p_payload->>'is_active')::boolean,true);
  v_required boolean := coalesce((p_payload->>'required')::boolean,false);
begin
  if auth.uid() is null or not private.has_platform_permission('platform.catalog.manage') then
    raise exception 'Sem permissão para editar os templates oficiais.' using errcode='42501';
  end if;
  if not exists(select 1 from public.catalog_equipment_types where id=p_catalog_equipment_id) then
    raise exception 'Equipamento oficial não encontrado.' using errcode='P0002';
  end if;
  if v_order < 0 or v_order > 1000000 then
    raise exception 'Ordenação inválida.' using errcode='22023';
  end if;

  if p_kind='technical' then
    if v_key !~ '^[a-z0-9]+([_-][a-z0-9]+)*$' or
      length(v_label) not between 2 and 120 or v_type not in ('text','number') then
      raise exception 'Campo técnico inválido.' using errcode='22023';
    end if;
    if p_id is null then
      insert into public.catalog_technical_field_templates(
        equipment_type_id,field_key,label,field_type,required,sort_order,is_active)
        values(p_catalog_equipment_id,v_key,v_label,v_type,v_required,v_order,v_active)
        returning id into v_id;
    else
      update public.catalog_technical_field_templates
        set label=v_label,field_type=v_type,required=v_required,
          sort_order=v_order,is_active=v_active,updated_at=now()
        where id=p_id and equipment_type_id=p_catalog_equipment_id
        returning id into v_id;
    end if;
  elsif p_kind='checklist' then
    if v_stage !~ '^[a-z0-9]+([_-][a-z0-9]+)*$'
      or length(v_title) not between 2 and 180
      or v_response not in ('conformity','yes_no','confirmation','text','number')
      or coalesce(p_payload->>'photo_requirement','none') not in ('none','optional','required','required_on_failure')
      or coalesce(p_payload->>'observation_requirement','none') not in ('none','optional','required','required_on_failure') then
      raise exception 'Item de checklist inválido.' using errcode='22023';
    end if;
    if p_id is null then
      insert into public.catalog_checklist_item_templates(
        equipment_type_id,stage_code,title,description,response_type,allow_na,is_required,
        photo_requirement,observation_requirement,sort_order,is_active)
      values(p_catalog_equipment_id,v_stage,v_title,nullif(btrim(p_payload->>'description'),''),
        v_response,coalesce((p_payload->>'allow_na')::boolean,false),
        coalesce((p_payload->>'is_required')::boolean,true),
        coalesce(p_payload->>'photo_requirement','none'),
        coalesce(p_payload->>'observation_requirement','none'),v_order,v_active)
      returning id into v_id;
    else
      update public.catalog_checklist_item_templates
        set title=v_title,description=nullif(btrim(p_payload->>'description'),''),
          response_type=v_response,allow_na=coalesce((p_payload->>'allow_na')::boolean,false),
          is_required=coalesce((p_payload->>'is_required')::boolean,true),
          photo_requirement=coalesce(p_payload->>'photo_requirement','none'),
          observation_requirement=coalesce(p_payload->>'observation_requirement','none'),
          sort_order=v_order,is_active=v_active,updated_at=now()
      where id=p_id and equipment_type_id=p_catalog_equipment_id
      returning id into v_id;
    end if;
  else
    raise exception 'Tipo de template inválido.' using errcode='22023';
  end if;
  if v_id is null then
    raise exception 'Template não encontrado.' using errcode='P0002';
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Este campo técnico já existe no equipamento oficial.' using errcode='23505';
end; $$;

create or replace function public.load_company_catalog_templates_v1(
  p_organization_id uuid, p_catalog_equipment_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_local_type uuid;
begin
  if auth.uid() is null or not exists(
    select 1 from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.user_id=auth.uid() and om.organization_id=p_organization_id
      and om.status='active' and o.status='active'
  ) or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.view') then
    raise exception 'Sem acesso aos templates de equipamento.' using errcode='42501';
  end if;
  select l.equipment_type_id into v_local_type
  from public.organization_catalog_equipment_links l
  where l.organization_id=p_organization_id and l.catalog_equipment_type_id=p_catalog_equipment_id;
  if v_local_type is null then
    raise exception 'Adicione primeiro o equipamento oficial.' using errcode='22023';
  end if;

  return jsonb_build_object(
    'technical',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'field_key',t.field_key,'label',t.label,'field_type',t.field_type,
        'required',t.required,'sort_order',t.sort_order,
        'applied',exists(
          select 1 from public.technical_fields f
          join public.equipment_type_technical_fields link
            on link.technical_field_id=f.id and link.equipment_type_id=v_local_type
          where f.organization_id=p_organization_id and f.field_key=t.field_key
        )
      ) order by t.sort_order,t.label)
      from public.catalog_technical_field_templates t
      where t.equipment_type_id=p_catalog_equipment_id and t.is_active
    ),'[]'::jsonb),
    'checklists',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'stage_code',c.stage_code,'title',c.title,
        'response_type',c.response_type,'is_required',c.is_required
      ) order by c.stage_code,c.sort_order,c.title)
      from public.catalog_checklist_item_templates c
      where c.equipment_type_id=p_catalog_equipment_id and c.is_active
    ),'[]'::jsonb)
  );
end; $$;

create or replace function public.adopt_company_catalog_technical_field_v1(
  p_organization_id uuid,p_catalog_equipment_id uuid,p_template_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_type_id uuid; v_template public.catalog_technical_field_templates%rowtype; v_field uuid; v_local_type text;
begin
  if auth.uid() is null
    or not exists(select 1 from public.organization_members om
      join public.organizations o on o.id=om.organization_id
      where om.user_id=auth.uid() and om.organization_id=p_organization_id
        and om.status='active' and o.status='active' and not private.is_platform_organization(o.id))
    or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.technical_fields.manage')
    or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.edit')
  then
    raise exception 'Sem permissão para adicionar campos técnicos.' using errcode='42501';
  end if;
  select l.equipment_type_id into v_type_id from public.organization_catalog_equipment_links l
   join public.equipment_types et on et.id=l.equipment_type_id and et.organization_id=p_organization_id
   where l.organization_id=p_organization_id and l.catalog_equipment_type_id=p_catalog_equipment_id;
  if v_type_id is null then raise exception 'Equipamento local não vinculado ao catálogo.' using errcode='22023'; end if;

  select * into v_template from public.catalog_technical_field_templates
   where id=p_template_id and equipment_type_id=p_catalog_equipment_id and is_active;
  if not found then raise exception 'Template técnico indisponível.' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':field:'||v_template.field_key,0));
  select f.id,f.field_type into v_field,v_local_type from public.technical_fields f
   where f.organization_id=p_organization_id and f.field_key=v_template.field_key;
  if v_field is not null and v_local_type <> v_template.field_type then
    raise exception 'Já existe um campo com esta chave, mas com tipo diferente. Ajuste manualmente antes de associar.' using errcode='22023';
  end if;
  if v_field is null then
    insert into public.technical_fields(organization_id,field_key,label,field_type,is_active,sort_order)
      values(p_organization_id,v_template.field_key,v_template.label,v_template.field_type,true,v_template.sort_order)
      returning id into v_field;
  end if;
  insert into public.equipment_type_technical_fields(organization_id,equipment_type_id,technical_field_id,required,sort_order)
    values(p_organization_id,v_type_id,v_field,v_template.required,v_template.sort_order)
    on conflict (equipment_type_id,technical_field_id) do nothing;
  return v_field;
end; $$;

create or replace function public.load_company_catalog_name_updates_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.user_id=auth.uid() and om.organization_id=p_organization_id
      and om.status='active' and o.status='active'
  ) or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.view') then
    raise exception 'Sem permissão para consultar atualizações oficiais.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'equipment',coalesce((
      select jsonb_agg(jsonb_build_object('id',l.catalog_equipment_type_id,
         'official_name',c.name,'previous_name',l.official_name_snapshot,'local_name',local_t.name)
      order by c.name)
      from public.organization_catalog_equipment_links l
      join public.catalog_equipment_types c on c.id=l.catalog_equipment_type_id
      join public.equipment_types local_t on local_t.id=l.equipment_type_id
      where l.organization_id=p_organization_id and c.name is distinct from l.official_name_snapshot
    ),'[]'::jsonb),
    'brands',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',l.catalog_brand_id,'equipment_id',l.catalog_equipment_type_id,
        'official_name',b.name,'previous_name',l.official_name_snapshot,'local_name',lb.name)
      order by b.name)
      from public.organization_catalog_brand_links l
      join public.catalog_brands b on b.id=l.catalog_brand_id
      join public.equipment_brands lb on lb.id=l.equipment_brand_id
      where l.organization_id=p_organization_id and b.name is distinct from l.official_name_snapshot
    ),'[]'::jsonb)
  );
end; $$;

create or replace function public.review_company_catalog_name_update_v1(
 p_organization_id uuid,p_kind text,p_catalog_id uuid,p_equipment_catalog_id uuid,p_action text
)
returns void language plpgsql security definer set search_path='' as $$
declare v_name text; v_local_id uuid;
begin
  if auth.uid() is null or p_action not in ('apply','keep')
    or not exists(select 1 from public.organization_members om
      join public.organizations o on o.id=om.organization_id
      where om.user_id=auth.uid() and om.organization_id=p_organization_id
        and om.status='active' and o.status='active' and not private.is_platform_organization(o.id))
    or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.edit')
  then
    raise exception 'Sem permissão para revisar as atualizações oficiais.' using errcode='42501';
  end if;
  if p_kind='equipment' then
    select c.name,l.equipment_type_id into v_name,v_local_id
    from public.organization_catalog_equipment_links l
    join public.catalog_equipment_types c on c.id=l.catalog_equipment_type_id
    where l.organization_id=p_organization_id and l.catalog_equipment_type_id=p_catalog_id for update of l;
    if v_local_id is null then raise exception 'Vínculo de equipamento não encontrado.' using errcode='P0002'; end if;
    if p_action='apply' then
      update public.equipment_types set name=v_name,updated_at=now()
       where id=v_local_id and organization_id=p_organization_id;
    end if;
    update public.organization_catalog_equipment_links
      set official_name_snapshot=v_name,reviewed_at=now()
      where organization_id=p_organization_id and catalog_equipment_type_id=p_catalog_id;
  elsif p_kind='brand' then
    select b.name,l.equipment_brand_id into v_name,v_local_id
    from public.organization_catalog_brand_links l
    join public.catalog_brands b on b.id=l.catalog_brand_id
    where l.organization_id=p_organization_id and l.catalog_brand_id=p_catalog_id
      and l.catalog_equipment_type_id=p_equipment_catalog_id for update of l;
    if v_local_id is null then raise exception 'Vínculo de marca não encontrado.' using errcode='P0002'; end if;
    if p_action='apply' then
      update public.equipment_brands set name=v_name,updated_at=now()
       where id=v_local_id and organization_id=p_organization_id;
    end if;
    update public.organization_catalog_brand_links
      set official_name_snapshot=v_name,reviewed_at=now()
      where organization_id=p_organization_id and catalog_equipment_type_id=p_equipment_catalog_id
        and catalog_brand_id=p_catalog_id;
  else
    raise exception 'Tipo de cadastro inválido.' using errcode='22023';
  end if;
end; $$;

revoke all on function public.list_union_catalog_templates_v1(uuid) from public,anon;
revoke all on function public.save_union_catalog_template_v1(text,uuid,uuid,jsonb) from public,anon;
revoke all on function public.load_company_catalog_templates_v1(uuid,uuid) from public,anon;
revoke all on function public.adopt_company_catalog_technical_field_v1(uuid,uuid,uuid) from public,anon;
revoke all on function public.load_company_catalog_name_updates_v1(uuid) from public,anon;
revoke all on function public.review_company_catalog_name_update_v1(uuid,text,uuid,uuid,text) from public,anon;
grant execute on function public.list_union_catalog_templates_v1(uuid) to authenticated;
grant execute on function public.save_union_catalog_template_v1(text,uuid,uuid,jsonb) to authenticated;
grant execute on function public.load_company_catalog_templates_v1(uuid,uuid) to authenticated;
grant execute on function public.adopt_company_catalog_technical_field_v1(uuid,uuid,uuid) to authenticated;
grant execute on function public.load_company_catalog_name_updates_v1(uuid) to authenticated;
grant execute on function public.review_company_catalog_name_update_v1(uuid,text,uuid,uuid,text) to authenticated;
