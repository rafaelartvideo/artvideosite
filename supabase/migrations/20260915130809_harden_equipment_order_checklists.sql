alter table public.equipment_types
  drop constraint if exists equipment_types_checklist_profile_tenant_fkey;
alter table public.equipment_types
  add constraint equipment_types_checklist_profile_tenant_fkey
  foreign key (checklist_profile_id, organization_id)
  references public.checklist_profiles(id, organization_id)
  on delete restrict;

create or replace function public.save_checklist_profile(
  p_organization_id uuid,
  p_profile_id uuid,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_stages jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_stage jsonb;
  v_item jsonb;
  v_stage_id uuid;
  v_situation_id uuid;
  v_code text;
begin
  if auth.uid() is null or not private.can_manage_own_operation_config(p_organization_id, 'checklists', 'checklists.manage') then
    raise exception 'Você não possui permissão para gerenciar checklists.' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Informe o nome do perfil de checklist.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_stages, '[]'::jsonb)) <> 'array' then
    raise exception 'Etapas inválidas.' using errcode = '22023';
  end if;

  if p_profile_id is null then
    insert into public.checklist_profiles (organization_id, name, description, is_active, created_by)
    values (p_organization_id, btrim(p_name), nullif(btrim(p_description), ''), coalesce(p_is_active, true), auth.uid())
    returning id into v_profile_id;
  else
    update public.checklist_profiles
       set name = btrim(p_name),
           description = nullif(btrim(p_description), ''),
           is_active = coalesce(p_is_active, true),
           version = version + 1,
           updated_at = now()
     where id = p_profile_id and organization_id = p_organization_id
     returning id into v_profile_id;
    if v_profile_id is null then
      raise exception 'Perfil de checklist não encontrado.' using errcode = 'P0002';
    end if;
    delete from public.checklist_profile_stages where profile_id = v_profile_id and organization_id = p_organization_id;
  end if;

  for v_stage in select value from jsonb_array_elements(coalesce(p_stages, '[]'::jsonb))
  loop
    if nullif(btrim(v_stage->>'name'), '') is null then
      raise exception 'Toda etapa precisa de um nome.' using errcode = '22023';
    end if;
    v_situation_id := nullif(v_stage->>'situation_id', '')::uuid;
    if v_situation_id is not null and not exists (
      select 1 from public.os_situations s where s.id = v_situation_id and s.organization_id = p_organization_id
    ) then
      raise exception 'A situação selecionada não pertence à empresa ativa.' using errcode = '23514';
    end if;
    if coalesce((v_stage->>'block_situation_exit')::boolean, false) and v_situation_id is null then
      raise exception 'Selecione uma Situação da OS para usar o bloqueio de saída da etapa "%".', btrim(v_stage->>'name') using errcode = '22023';
    end if;
    v_code := lower(regexp_replace(coalesce(nullif(btrim(v_stage->>'code'), ''), 'stage_' || coalesce(v_stage->>'sort_order', '0')), '[^a-zA-Z0-9_]+', '_', 'g'));

    insert into public.checklist_profile_stages (
      organization_id, profile_id, code, stage_type, name, situation_id,
      block_situation_exit, block_resolution, block_completion, sort_order, is_active
    ) values (
      p_organization_id, v_profile_id, v_code,
      coalesce(nullif(v_stage->>'stage_type', ''), 'custom'),
      btrim(v_stage->>'name'), v_situation_id,
      coalesce((v_stage->>'block_situation_exit')::boolean, false),
      coalesce((v_stage->>'block_resolution')::boolean, false),
      coalesce((v_stage->>'block_completion')::boolean, false),
      coalesce((v_stage->>'sort_order')::integer, 0),
      coalesce((v_stage->>'is_active')::boolean, true)
    ) returning id into v_stage_id;

    for v_item in select value from jsonb_array_elements(coalesce(v_stage->'items', '[]'::jsonb))
    loop
      if nullif(btrim(v_item->>'title'), '') is null then
        raise exception 'Todo item precisa de um título.' using errcode = '22023';
      end if;
      insert into public.checklist_profile_items (
        organization_id, stage_id, title, description, response_type, allow_na, is_required,
        photo_requirement, observation_requirement, sort_order, is_active
      ) values (
        p_organization_id, v_stage_id, btrim(v_item->>'title'), nullif(btrim(v_item->>'description'), ''),
        coalesce(nullif(v_item->>'response_type', ''), 'conformity'),
        coalesce((v_item->>'allow_na')::boolean, false),
        coalesce((v_item->>'is_required')::boolean, true),
        coalesce(nullif(v_item->>'photo_requirement', ''), 'none'),
        coalesce(nullif(v_item->>'observation_requirement', ''), 'none'),
        coalesce((v_item->>'sort_order')::integer, 0),
        coalesce((v_item->>'is_active')::boolean, true)
      );
    end loop;
  end loop;

  return v_profile_id;
end;
$$;

create or replace function private.ensure_service_order_checklist(p_service_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_equipment_type_id uuid;
  v_profile_id uuid;
  v_profile_name text;
  v_profile_version integer;
  v_existing_id uuid;
  v_existing_equipment uuid;
  v_checklist_id uuid;
  v_stage record;
  v_stage_id uuid;
begin
  select so.organization_id, so.equipment_type_id, et.checklist_profile_id
    into v_org, v_equipment_type_id, v_profile_id
  from public.service_orders so
  left join public.equipment_types et
    on et.id = so.equipment_type_id and et.organization_id = so.organization_id
  where so.id = p_service_order_id;

  if v_org is null then return null; end if;

  select c.id, c.equipment_type_id into v_existing_id, v_existing_equipment
  from public.service_order_checklists c
  where c.service_order_id = p_service_order_id and c.status <> 'superseded'
  limit 1;

  if v_existing_id is not null and v_existing_equipment is not distinct from v_equipment_type_id then
    return v_existing_id;
  end if;

  if v_existing_id is not null then
    update public.service_order_checklists
       set status = 'superseded', superseded_at = now()
     where id = v_existing_id;
    insert into public.service_order_checklist_events (
      organization_id, checklist_id, service_order_id, event_type, payload, created_by
    ) values (
      v_org, v_existing_id, p_service_order_id, 'checklist_superseded',
      jsonb_build_object('previous_equipment_type_id', v_existing_equipment, 'new_equipment_type_id', v_equipment_type_id), auth.uid()
    );
  end if;

  if v_equipment_type_id is null or v_profile_id is null then return null; end if;

  select name, version into v_profile_name, v_profile_version
  from public.checklist_profiles
  where id = v_profile_id and organization_id = v_org;
  if v_profile_name is null then return null; end if;

  insert into public.service_order_checklists (
    organization_id, service_order_id, equipment_type_id, source_profile_id,
    profile_name_snapshot, profile_version_snapshot, status, created_by
  ) values (
    v_org, p_service_order_id, v_equipment_type_id, v_profile_id,
    v_profile_name, v_profile_version, 'pending', auth.uid()
  ) returning id into v_checklist_id;

  for v_stage in
    select s.*, os.name as situation_name
    from public.checklist_profile_stages s
    left join public.os_situations os on os.id = s.situation_id
    where s.profile_id = v_profile_id and s.organization_id = v_org and s.is_active
    order by s.sort_order, s.created_at
  loop
    insert into public.service_order_checklist_stages (
      organization_id, checklist_id, source_stage_id, stage_code_snapshot, stage_type_snapshot,
      name_snapshot, situation_id_snapshot, situation_name_snapshot,
      block_situation_exit_snapshot, block_resolution_snapshot, block_completion_snapshot,
      sort_order, status
    ) values (
      v_org, v_checklist_id, v_stage.id, v_stage.code, v_stage.stage_type,
      v_stage.name, v_stage.situation_id, v_stage.situation_name,
      v_stage.block_situation_exit, v_stage.block_resolution, v_stage.block_completion,
      v_stage.sort_order, 'pending'
    ) returning id into v_stage_id;

    insert into public.service_order_checklist_items (
      organization_id, stage_id, source_item_id, source_kind, title_snapshot, description_snapshot,
      response_type_snapshot, allow_na_snapshot, is_required_snapshot, photo_requirement_snapshot,
      observation_requirement_snapshot, sort_order
    )
    select v_org, v_stage_id, i.id, 'profile', i.title, i.description,
           i.response_type, i.allow_na, i.is_required, i.photo_requirement,
           i.observation_requirement, i.sort_order
    from public.checklist_profile_items i
    where i.stage_id = v_stage.id and i.organization_id = v_org and i.is_active
    order by i.sort_order, i.created_at;

    insert into public.service_order_checklist_items (
      organization_id, stage_id, source_item_id, source_kind, title_snapshot, description_snapshot,
      response_type_snapshot, allow_na_snapshot, is_required_snapshot, photo_requirement_snapshot,
      observation_requirement_snapshot, sort_order
    )
    select v_org, v_stage_id, eci.id, 'equipment_extra', eci.title, eci.description,
           eci.response_type, eci.allow_na, eci.is_required, eci.photo_requirement,
           eci.observation_requirement, 100000 + eci.sort_order
    from public.equipment_checklist_items eci
    where eci.equipment_type_id = v_equipment_type_id
      and eci.organization_id = v_org
      and eci.stage_code = v_stage.code
      and eci.is_active
    order by eci.sort_order, eci.created_at;
  end loop;

  insert into public.service_order_checklist_events (
    organization_id, checklist_id, service_order_id, event_type, payload, created_by
  ) values (
    v_org, v_checklist_id, p_service_order_id, 'snapshot_created',
    jsonb_build_object('profile_id', v_profile_id, 'profile_name', v_profile_name, 'profile_version', v_profile_version, 'equipment_type_id', v_equipment_type_id), auth.uid()
  );

  return v_checklist_id;
end;
$$;

create or replace function public.complete_service_order_checklist_stage(p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.service_order_checklist_stages%rowtype;
  v_checklist public.service_order_checklists%rowtype;
  v_invalid integer;
begin
  select * into v_stage from public.service_order_checklist_stages where id = p_stage_id;
  if not found then raise exception 'Etapa de checklist não encontrada.' using errcode = 'P0002'; end if;
  select * into v_checklist from public.service_order_checklists where id = v_stage.checklist_id;
  if auth.uid() is null or not private.can_access_service_order_child(v_checklist.service_order_id, 'orders.checklists.manage', 'manage') then
    raise exception 'Você não possui permissão para concluir checklists.' using errcode = '42501';
  end if;
  if v_stage.status = 'completed' then return; end if;

  with evaluated as (
    select
      i.*,
      (
        (i.allow_na_snapshot and i.response_code = 'na')
        or (i.response_type_snapshot = 'conformity' and i.response_code in ('ok','not_ok'))
        or (i.response_type_snapshot = 'yes_no' and i.response_code in ('yes','no'))
        or (i.response_type_snapshot = 'confirmation' and i.response_code = 'confirmed')
        or (i.response_type_snapshot = 'text' and nullif(btrim(i.response_text), '') is not null)
        or (i.response_type_snapshot = 'number' and i.response_number is not null)
      ) as has_answer,
      ((i.response_type_snapshot = 'conformity' and i.response_code = 'not_ok')
        or (i.response_type_snapshot = 'yes_no' and i.response_code = 'no')) as is_failure,
      exists (select 1 from public.service_order_checklist_item_media m where m.item_id = i.id) as has_media
    from public.service_order_checklist_items i
    where i.stage_id = p_stage_id
  )
  select count(*) into v_invalid
  from evaluated i
  where
    (i.is_required_snapshot and not i.has_answer)
    or (
      i.has_answer
      and (
        (i.photo_requirement_snapshot = 'required' and not i.has_media)
        or (i.photo_requirement_snapshot = 'required_on_failure' and i.is_failure and not i.has_media)
        or (i.observation_requirement_snapshot = 'required' and nullif(btrim(i.observation), '') is null)
        or (i.observation_requirement_snapshot = 'required_on_failure' and i.is_failure and nullif(btrim(i.observation), '') is null)
      )
    );

  if v_invalid > 0 then
    raise exception 'Checklist possui % item(ns) obrigatório(s) ou requisito(s) pendente(s).', v_invalid using errcode = 'P0001';
  end if;

  update public.service_order_checklist_stages
     set status = 'completed', completed_by = auth.uid(), completed_at = now()
   where id = p_stage_id;

  if not exists (
    select 1 from public.service_order_checklist_stages s
    where s.checklist_id = v_checklist.id and s.id <> p_stage_id and s.status <> 'completed'
  ) then
    update public.service_order_checklists
       set status = 'completed', completed_by = auth.uid(), completed_at = now()
     where id = v_checklist.id;
  else
    update public.service_order_checklists set status = 'in_progress' where id = v_checklist.id;
  end if;

  insert into public.service_order_checklist_events (
    organization_id, checklist_id, service_order_id, stage_id, event_type, payload, created_by
  ) values (
    v_checklist.organization_id, v_checklist.id, v_checklist.service_order_id, p_stage_id,
    'stage_completed', '{}'::jsonb, auth.uid()
  );
end;
$$;
