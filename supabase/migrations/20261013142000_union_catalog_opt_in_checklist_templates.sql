-- Aplicação individual de checklists oficiais somente em etapas válidas.
-- Não altera itens existentes, perfis, modelos nem OS.
create table if not exists public.organization_catalog_checklist_template_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_equipment_type_id uuid not null references public.catalog_equipment_types(id),
  catalog_template_id uuid not null references public.catalog_checklist_item_templates(id),
  equipment_checklist_item_id uuid not null references public.equipment_checklist_items(id) on delete cascade,
  applied_by uuid,
  applied_at timestamptz not null default now(),
  primary key (organization_id,catalog_equipment_type_id,catalog_template_id),
  unique (organization_id,equipment_checklist_item_id)
);
alter table public.organization_catalog_checklist_template_links enable row level security;
revoke all on public.organization_catalog_checklist_template_links from anon,authenticated;

create or replace function public.load_company_catalog_templates_v1(
  p_organization_id uuid, p_catalog_equipment_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_local_type uuid; v_profile uuid;
begin
  if auth.uid() is null or not exists(
    select 1 from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.user_id=auth.uid() and om.organization_id=p_organization_id
      and om.status='active' and o.status='active'
  ) or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.view') then
    raise exception 'Sem acesso aos templates de equipamento.' using errcode='42501';
  end if;
  select l.equipment_type_id,e.checklist_profile_id into v_local_type,v_profile
  from public.organization_catalog_equipment_links l
  join public.equipment_types e on e.id=l.equipment_type_id
    and e.organization_id=l.organization_id
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
        'response_type',c.response_type,'is_required',c.is_required,
        'applied',exists (
          select 1 from public.organization_catalog_checklist_template_links link
          where link.organization_id=p_organization_id
            and link.catalog_equipment_type_id=p_catalog_equipment_id
            and link.catalog_template_id=c.id
        ),
        'can_apply',exists (
          select 1 from public.checklist_profile_stages stage
          where stage.organization_id=p_organization_id
            and stage.profile_id=v_profile and stage.code=c.stage_code and stage.is_active
        )
      ) order by c.stage_code,c.sort_order,c.title)
      from public.catalog_checklist_item_templates c
      where c.equipment_type_id=p_catalog_equipment_id and c.is_active
    ),'[]'::jsonb)
  );
end; $$;

create or replace function public.adopt_company_catalog_checklist_item_v1(
  p_organization_id uuid,p_catalog_equipment_id uuid,p_catalog_template_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_equipment_id uuid;
  v_profile_id uuid;
  v_template public.catalog_checklist_item_templates%rowtype;
  v_local_item_id uuid;
begin
  if auth.uid() is null or not exists(
    select 1 from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.user_id=auth.uid() and om.organization_id=p_organization_id
      and om.status='active' and o.status='active'
      and not private.is_platform_organization(o.id)
  ) or not private.can_manage_own_operation_config(p_organization_id,'checklists','checklists.manage')
    or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.edit')
  then
    raise exception 'Sem permissão para adicionar checklists.' using errcode='42501';
  end if;
  select et.id,et.checklist_profile_id into v_equipment_id,v_profile_id
    from public.organization_catalog_equipment_links l
    join public.equipment_types et on et.id=l.equipment_type_id and et.organization_id=p_organization_id
    where l.organization_id=p_organization_id and l.catalog_equipment_type_id=p_catalog_equipment_id;
  if v_equipment_id is null then
    raise exception 'Vincule primeiro o equipamento oficial à empresa.' using errcode='22023';
  end if;
  select * into v_template from public.catalog_checklist_item_templates
  where id=p_catalog_template_id and equipment_type_id=p_catalog_equipment_id and is_active;
  if not found then
    raise exception 'O template de checklist está indisponível.' using errcode='22023';
  end if;
  if v_profile_id is null or not exists(
    select 1 from public.checklist_profile_stages s
    where s.profile_id=v_profile_id and s.organization_id=p_organization_id
      and s.code=v_template.stage_code and s.is_active
  ) then
    raise exception 'Configure no equipamento um perfil de checklist com a etapa % antes de adicionar este item.',v_template.stage_code
      using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':checklist-template:'||p_catalog_template_id::text,0
  ));
  select link.equipment_checklist_item_id into v_local_item_id
    from public.organization_catalog_checklist_template_links link
    where link.organization_id=p_organization_id and link.catalog_equipment_type_id=p_catalog_equipment_id
      and link.catalog_template_id=p_catalog_template_id;
  if v_local_item_id is not null then return v_local_item_id; end if;

  select i.id into v_local_item_id
  from public.equipment_checklist_items i
  where i.organization_id=p_organization_id
    and i.equipment_type_id=v_equipment_id and i.stage_code=v_template.stage_code
    and lower(public.normalize_visual_text(i.title))=
      lower(public.normalize_visual_text(v_template.title))
  limit 1;
  if v_local_item_id is null then
    insert into public.equipment_checklist_items(
      organization_id,equipment_type_id,stage_code,title,description,response_type,
      allow_na,is_required,photo_requirement,observation_requirement,
      sort_order,is_active
    ) values(
      p_organization_id,v_equipment_id,v_template.stage_code,v_template.title,
      v_template.description,v_template.response_type,v_template.allow_na,
      v_template.is_required,v_template.photo_requirement,
      v_template.observation_requirement,v_template.sort_order,true
    ) returning id into v_local_item_id;
  end if;

  insert into public.organization_catalog_checklist_template_links(
    organization_id,catalog_equipment_type_id,catalog_template_id,
    equipment_checklist_item_id,applied_by
  ) values(
    p_organization_id,p_catalog_equipment_id,p_catalog_template_id,
    v_local_item_id,auth.uid()
  ) on conflict do nothing;
  if not exists(
    select 1 from public.organization_catalog_checklist_template_links link
    where link.organization_id=p_organization_id and link.catalog_template_id=p_catalog_template_id
      and link.catalog_equipment_type_id=p_catalog_equipment_id
      and link.equipment_checklist_item_id=v_local_item_id
  ) then
    raise exception 'Este item local já está vinculado a outro template oficial.' using errcode='23505';
  end if;
  return v_local_item_id;
end; $$;

revoke all on function public.adopt_company_catalog_checklist_item_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.adopt_company_catalog_checklist_item_v1(uuid,uuid,uuid) to authenticated;
