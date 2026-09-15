-- Perfis de checklist por equipamento e execução por OS.
-- Esta migration corresponde ao schema aplicado em produção em 2026-09-15.

insert into public.system_modules (key, name, description, category, sort_order, is_active)
values ('checklists', 'Checklists', 'Perfis e execução de checklists técnicos por equipamento e OS.', 'operation', 65, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.organization_modules (organization_id, module_key, is_enabled, limits, settings, enabled_at)
select distinct organization_id, 'checklists', true, '{}'::jsonb, '{}'::jsonb, now()
from public.organization_modules
where module_key in ('equipment', 'orders') and is_enabled
on conflict (organization_id, module_key) do nothing;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('checklists.view', 'Visualizar checklists', 'Permite visualizar perfis de checklist.', 'Checklists', 2830),
  ('checklists.manage', 'Gerenciar checklists', 'Permite criar, editar, versionar e ativar/inativar perfis de checklist.', 'Checklists', 2831),
  ('orders.section.checklists', 'Visualizar checklists da OS', 'Permite visualizar os checklists vinculados à ordem de serviço.', 'Ordens de Serviço — Barra de ferramentas', 1117),
  ('orders.checklists.manage', 'Preencher checklists da OS', 'Permite responder itens, anexar fotos e concluir etapas do checklist da OS.', 'Ordens de Serviço — Checklists', 1260),
  ('orders.checklists.reopen', 'Reabrir etapas de checklist', 'Permite reabrir uma etapa de checklist já concluída.', 'Ordens de Serviço — Checklists', 1261)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id = rp.permission_id
join public.permissions target on target.key = 'checklists.view'
where source.key = 'equipment.view'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id = rp.permission_id
join public.permissions target on target.key = 'checklists.manage'
where source.key = 'equipment.edit'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id = rp.permission_id
join public.permissions target on target.key = 'orders.section.checklists'
where source.key in ('orders.details.view', 'orders.view_all')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id = rp.permission_id
join public.permissions target on target.key = 'orders.checklists.manage'
where source.key in ('orders.edit', 'orders.solve')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id = rp.permission_id
join public.permissions target on target.key = 'orders.checklists.reopen'
where source.key = 'orders.complete'
on conflict do nothing;

create table if not exists public.checklist_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  description text,
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index if not exists checklist_profiles_org_active_idx on public.checklist_profiles (organization_id, is_active, name);

create table if not exists public.checklist_profile_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null,
  code text not null,
  stage_type text not null check (stage_type in ('entry','diagnosis','qc','custom')),
  name text not null,
  situation_id uuid references public.os_situations(id) on delete restrict,
  block_situation_exit boolean not null default false,
  block_resolution boolean not null default false,
  block_completion boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (profile_id, code),
  constraint checklist_profile_stages_profile_tenant_fkey foreign key (profile_id, organization_id)
    references public.checklist_profiles(id, organization_id) on delete cascade
);
create index if not exists checklist_profile_stages_profile_idx on public.checklist_profile_stages (profile_id, sort_order);

create table if not exists public.checklist_profile_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  stage_id uuid not null,
  title text not null,
  description text,
  response_type text not null check (response_type in ('conformity','yes_no','confirmation','text','number')),
  allow_na boolean not null default false,
  is_required boolean not null default true,
  photo_requirement text not null default 'none' check (photo_requirement in ('none','optional','required','required_on_failure')),
  observation_requirement text not null default 'none' check (observation_requirement in ('none','optional','required','required_on_failure')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint checklist_profile_items_stage_tenant_fkey foreign key (stage_id, organization_id)
    references public.checklist_profile_stages(id, organization_id) on delete cascade
);
create index if not exists checklist_profile_items_stage_idx on public.checklist_profile_items (stage_id, sort_order);

alter table public.equipment_types add column if not exists checklist_profile_id uuid;
alter table public.equipment_types drop constraint if exists equipment_types_checklist_profile_tenant_fkey;
alter table public.equipment_types add constraint equipment_types_checklist_profile_tenant_fkey
  foreign key (checklist_profile_id, organization_id)
  references public.checklist_profiles(id, organization_id) on delete set null;
create index if not exists equipment_types_checklist_profile_idx on public.equipment_types (organization_id, checklist_profile_id);

create table if not exists public.equipment_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  stage_code text not null,
  title text not null,
  description text,
  response_type text not null check (response_type in ('conformity','yes_no','confirmation','text','number')),
  allow_na boolean not null default false,
  is_required boolean not null default true,
  photo_requirement text not null default 'none' check (photo_requirement in ('none','optional','required','required_on_failure')),
  observation_requirement text not null default 'none' check (observation_requirement in ('none','optional','required','required_on_failure')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists equipment_checklist_items_equipment_idx on public.equipment_checklist_items (organization_id, equipment_type_id, stage_code, sort_order);

create table if not exists public.service_order_checklists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  equipment_type_id uuid references public.equipment_types(id) on delete set null,
  source_profile_id uuid references public.checklist_profiles(id) on delete set null,
  profile_name_snapshot text not null,
  profile_version_snapshot integer not null,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','superseded')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  superseded_at timestamptz,
  unique (id, organization_id)
);
create unique index if not exists service_order_checklists_one_active_idx on public.service_order_checklists (service_order_id) where status <> 'superseded';
create index if not exists service_order_checklists_order_idx on public.service_order_checklists (organization_id, service_order_id, created_at desc);

create table if not exists public.service_order_checklist_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  checklist_id uuid not null,
  source_stage_id uuid,
  stage_code_snapshot text not null,
  stage_type_snapshot text not null check (stage_type_snapshot in ('entry','diagnosis','qc','custom')),
  name_snapshot text not null,
  situation_id_snapshot uuid,
  situation_name_snapshot text,
  block_situation_exit_snapshot boolean not null default false,
  block_resolution_snapshot boolean not null default false,
  block_completion_snapshot boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','reopened')),
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  unique (id, organization_id),
  constraint service_order_checklist_stages_checklist_tenant_fkey foreign key (checklist_id, organization_id)
    references public.service_order_checklists(id, organization_id) on delete cascade
);
create index if not exists service_order_checklist_stages_checklist_idx on public.service_order_checklist_stages (checklist_id, sort_order);
create index if not exists service_order_checklist_stages_gate_idx on public.service_order_checklist_stages (checklist_id, situation_id_snapshot, status);

create table if not exists public.service_order_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  stage_id uuid not null,
  source_item_id uuid,
  source_kind text not null check (source_kind in ('profile','equipment_extra')),
  title_snapshot text not null,
  description_snapshot text,
  response_type_snapshot text not null check (response_type_snapshot in ('conformity','yes_no','confirmation','text','number')),
  allow_na_snapshot boolean not null default false,
  is_required_snapshot boolean not null default true,
  photo_requirement_snapshot text not null default 'none' check (photo_requirement_snapshot in ('none','optional','required','required_on_failure')),
  observation_requirement_snapshot text not null default 'none' check (observation_requirement_snapshot in ('none','optional','required','required_on_failure')),
  sort_order integer not null default 0,
  response_code text,
  response_text text,
  response_number numeric,
  observation text,
  answered_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint service_order_checklist_items_stage_tenant_fkey foreign key (stage_id, organization_id)
    references public.service_order_checklist_stages(id, organization_id) on delete cascade
);
create index if not exists service_order_checklist_items_stage_idx on public.service_order_checklist_items (stage_id, sort_order);

create table if not exists public.service_order_checklist_item_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  item_id uuid not null,
  media_id uuid not null references public.media(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (item_id, media_id),
  constraint service_order_checklist_item_media_item_tenant_fkey foreign key (item_id, organization_id)
    references public.service_order_checklist_items(id, organization_id) on delete cascade
);
create index if not exists service_order_checklist_item_media_item_idx on public.service_order_checklist_item_media (item_id, created_at);

create table if not exists public.service_order_checklist_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  checklist_id uuid not null,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  stage_id uuid,
  item_id uuid,
  event_type text not null check (event_type in ('snapshot_created','item_changed','media_attached','stage_completed','stage_reopened','checklist_superseded')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint service_order_checklist_events_checklist_tenant_fkey foreign key (checklist_id, organization_id)
    references public.service_order_checklists(id, organization_id) on delete cascade
);
create index if not exists service_order_checklist_events_order_idx on public.service_order_checklist_events (service_order_id, created_at desc);

alter table public.checklist_profiles enable row level security;
alter table public.checklist_profile_stages enable row level security;
alter table public.checklist_profile_items enable row level security;
alter table public.equipment_checklist_items enable row level security;
alter table public.service_order_checklists enable row level security;
alter table public.service_order_checklist_stages enable row level security;
alter table public.service_order_checklist_items enable row level security;
alter table public.service_order_checklist_item_media enable row level security;
alter table public.service_order_checklist_events enable row level security;

revoke all on table public.checklist_profiles, public.checklist_profile_stages, public.checklist_profile_items,
  public.equipment_checklist_items, public.service_order_checklists, public.service_order_checklist_stages,
  public.service_order_checklist_items, public.service_order_checklist_item_media, public.service_order_checklist_events from anon;
revoke insert, update, delete on table public.checklist_profiles, public.checklist_profile_stages, public.checklist_profile_items,
  public.equipment_checklist_items, public.service_order_checklists, public.service_order_checklist_stages,
  public.service_order_checklist_items, public.service_order_checklist_item_media, public.service_order_checklist_events from authenticated;
grant select on table public.checklist_profiles, public.checklist_profile_stages, public.checklist_profile_items,
  public.equipment_checklist_items, public.service_order_checklists, public.service_order_checklist_stages,
  public.service_order_checklist_items, public.service_order_checklist_item_media, public.service_order_checklist_events to authenticated;

create or replace function private.can_view_order_checklist(p_checklist_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_order_checklists c
    where c.id = p_checklist_id
      and private.can_access_service_order_child(c.service_order_id, 'orders.section.checklists', 'read')
  );
$$;

create or replace function private.can_view_order_checklist_stage(p_stage_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_order_checklist_stages s
    where s.id = p_stage_id and private.can_view_order_checklist(s.checklist_id)
  );
$$;

create or replace function private.can_view_order_checklist_item(p_item_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_order_checklist_items i
    where i.id = p_item_id and private.can_view_order_checklist_stage(i.stage_id)
  );
$$;

create policy checklist_profiles_select on public.checklist_profiles for select to authenticated
using (private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.view') or private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.manage'));
create policy checklist_profile_stages_select on public.checklist_profile_stages for select to authenticated
using (private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.view') or private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.manage'));
create policy checklist_profile_items_select on public.checklist_profile_items for select to authenticated
using (private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.view') or private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.manage'));
create policy equipment_checklist_items_select on public.equipment_checklist_items for select to authenticated
using (private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.view') or private.can_manage_own_operation_config(organization_id, 'checklists', 'checklists.manage') or private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.view'));
create policy service_order_checklists_select on public.service_order_checklists for select to authenticated
using (private.can_access_service_order_child(service_order_id, 'orders.section.checklists', 'read'));
create policy service_order_checklist_stages_select on public.service_order_checklist_stages for select to authenticated
using (private.can_view_order_checklist(checklist_id));
create policy service_order_checklist_items_select on public.service_order_checklist_items for select to authenticated
using (private.can_view_order_checklist_stage(stage_id));
create policy service_order_checklist_item_media_select on public.service_order_checklist_item_media for select to authenticated
using (private.can_view_order_checklist_item(item_id));
create policy service_order_checklist_events_select on public.service_order_checklist_events for select to authenticated
using (private.can_view_order_checklist(checklist_id));

create or replace function public.save_checklist_profile(
  p_organization_id uuid, p_profile_id uuid, p_name text, p_description text, p_is_active boolean, p_stages jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid; v_stage jsonb; v_item jsonb; v_stage_id uuid; v_situation_id uuid; v_code text;
begin
  if auth.uid() is null or not private.can_manage_own_operation_config(p_organization_id, 'checklists', 'checklists.manage') then
    raise exception 'Você não possui permissão para gerenciar checklists.' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Informe o nome do perfil de checklist.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_stages, '[]'::jsonb)) <> 'array' then raise exception 'Etapas inválidas.' using errcode = '22023'; end if;

  if p_profile_id is null then
    insert into public.checklist_profiles (organization_id, name, description, is_active, created_by)
    values (p_organization_id, btrim(p_name), nullif(btrim(p_description), ''), coalesce(p_is_active, true), auth.uid())
    returning id into v_profile_id;
  else
    update public.checklist_profiles set name=btrim(p_name), description=nullif(btrim(p_description), ''), is_active=coalesce(p_is_active,true), version=version+1, updated_at=now()
    where id=p_profile_id and organization_id=p_organization_id returning id into v_profile_id;
    if v_profile_id is null then raise exception 'Perfil de checklist não encontrado.' using errcode='P0002'; end if;
    delete from public.checklist_profile_stages where profile_id=v_profile_id and organization_id=p_organization_id;
  end if;

  for v_stage in select value from jsonb_array_elements(coalesce(p_stages,'[]'::jsonb)) loop
    if nullif(btrim(v_stage->>'name'),'') is null then raise exception 'Toda etapa precisa de um nome.' using errcode='22023'; end if;
    v_situation_id := nullif(v_stage->>'situation_id','')::uuid;
    if v_situation_id is not null and not exists (select 1 from public.os_situations where id=v_situation_id and organization_id=p_organization_id) then
      raise exception 'A situação selecionada não pertence à empresa ativa.' using errcode='23514';
    end if;
    v_code := lower(regexp_replace(coalesce(nullif(btrim(v_stage->>'code'),''),'stage_'||coalesce(v_stage->>'sort_order','0')),'[^a-zA-Z0-9_]+','_','g'));
    insert into public.checklist_profile_stages (organization_id,profile_id,code,stage_type,name,situation_id,block_situation_exit,block_resolution,block_completion,sort_order,is_active)
    values (p_organization_id,v_profile_id,v_code,coalesce(nullif(v_stage->>'stage_type',''),'custom'),btrim(v_stage->>'name'),v_situation_id,
      coalesce((v_stage->>'block_situation_exit')::boolean,false),coalesce((v_stage->>'block_resolution')::boolean,false),coalesce((v_stage->>'block_completion')::boolean,false),
      coalesce((v_stage->>'sort_order')::integer,0),coalesce((v_stage->>'is_active')::boolean,true)) returning id into v_stage_id;
    for v_item in select value from jsonb_array_elements(coalesce(v_stage->'items','[]'::jsonb)) loop
      if nullif(btrim(v_item->>'title'),'') is null then raise exception 'Todo item precisa de um título.' using errcode='22023'; end if;
      insert into public.checklist_profile_items (organization_id,stage_id,title,description,response_type,allow_na,is_required,photo_requirement,observation_requirement,sort_order,is_active)
      values (p_organization_id,v_stage_id,btrim(v_item->>'title'),nullif(btrim(v_item->>'description'),''),coalesce(nullif(v_item->>'response_type',''),'conformity'),
        coalesce((v_item->>'allow_na')::boolean,false),coalesce((v_item->>'is_required')::boolean,true),coalesce(nullif(v_item->>'photo_requirement',''),'none'),
        coalesce(nullif(v_item->>'observation_requirement',''),'none'),coalesce((v_item->>'sort_order')::integer,0),coalesce((v_item->>'is_active')::boolean,true));
    end loop;
  end loop;
  return v_profile_id;
end;
$$;

create or replace function public.save_equipment_checklist_configuration(p_organization_id uuid,p_equipment_type_id uuid,p_profile_id uuid,p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_stage_code text;
begin
  if auth.uid() is null or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.edit') then
    raise exception 'Você não possui permissão para editar equipamentos.' using errcode='42501';
  end if;
  if not exists (select 1 from public.equipment_types where id=p_equipment_type_id and organization_id=p_organization_id) then raise exception 'Equipamento não encontrado.' using errcode='P0002'; end if;
  if p_profile_id is not null and not exists (select 1 from public.checklist_profiles where id=p_profile_id and organization_id=p_organization_id) then raise exception 'Perfil de checklist inválido para esta empresa.' using errcode='23514'; end if;
  update public.equipment_types set checklist_profile_id=p_profile_id,updated_at=now() where id=p_equipment_type_id and organization_id=p_organization_id;
  delete from public.equipment_checklist_items where organization_id=p_organization_id and equipment_type_id=p_equipment_type_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_stage_code := nullif(btrim(v_item->>'stage_code'),'');
    if p_profile_id is null or v_stage_code is null or not exists (select 1 from public.checklist_profile_stages where profile_id=p_profile_id and organization_id=p_organization_id and code=v_stage_code and is_active) then
      raise exception 'Remapeie os itens adicionais para uma etapa válida do perfil.' using errcode='23514';
    end if;
    if nullif(btrim(v_item->>'title'),'') is null then raise exception 'Todo item adicional precisa de um título.' using errcode='22023'; end if;
    insert into public.equipment_checklist_items (organization_id,equipment_type_id,stage_code,title,description,response_type,allow_na,is_required,photo_requirement,observation_requirement,sort_order,is_active)
    values (p_organization_id,p_equipment_type_id,v_stage_code,btrim(v_item->>'title'),nullif(btrim(v_item->>'description'),''),coalesce(nullif(v_item->>'response_type',''),'conformity'),
      coalesce((v_item->>'allow_na')::boolean,false),coalesce((v_item->>'is_required')::boolean,true),coalesce(nullif(v_item->>'photo_requirement',''),'none'),
      coalesce(nullif(v_item->>'observation_requirement',''),'none'),coalesce((v_item->>'sort_order')::integer,0),coalesce((v_item->>'is_active')::boolean,true));
  end loop;
end;
$$;

-- Snapshot, respostas, mídia, conclusão/reabertura e gates usam as mesmas funções aplicadas em produção.
-- Mantemos abaixo as assinaturas públicas e os triggers para que a migration continue autocontida.

create or replace function private.ensure_service_order_checklist(p_service_order_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_equipment_type_id uuid; v_profile_id uuid; v_profile_name text; v_profile_version integer;
  v_existing_id uuid; v_existing_equipment uuid; v_checklist_id uuid; v_stage record; v_stage_id uuid;
begin
  select so.organization_id,so.equipment_type_id,et.checklist_profile_id into v_org,v_equipment_type_id,v_profile_id
  from public.service_orders so left join public.equipment_types et on et.id=so.equipment_type_id and et.organization_id=so.organization_id
  where so.id=p_service_order_id;
  if v_org is null then return null; end if;
  select id,equipment_type_id into v_existing_id,v_existing_equipment from public.service_order_checklists where service_order_id=p_service_order_id and status<>'superseded' limit 1;
  if v_existing_id is not null and v_existing_equipment is not distinct from v_equipment_type_id then return v_existing_id; end if;
  if v_existing_id is not null then
    update public.service_order_checklists set status='superseded',superseded_at=now() where id=v_existing_id;
    insert into public.service_order_checklist_events (organization_id,checklist_id,service_order_id,event_type,payload,created_by)
    values (v_org,v_existing_id,p_service_order_id,'checklist_superseded',jsonb_build_object('previous_equipment_type_id',v_existing_equipment,'new_equipment_type_id',v_equipment_type_id),auth.uid());
  end if;
  if v_equipment_type_id is null or v_profile_id is null then return null; end if;
  select name,version into v_profile_name,v_profile_version from public.checklist_profiles where id=v_profile_id and organization_id=v_org and is_active;
  if v_profile_name is null then return null; end if;
  insert into public.service_order_checklists (organization_id,service_order_id,equipment_type_id,source_profile_id,profile_name_snapshot,profile_version_snapshot,status,created_by)
  values (v_org,p_service_order_id,v_equipment_type_id,v_profile_id,v_profile_name,v_profile_version,'pending',auth.uid()) returning id into v_checklist_id;
  for v_stage in select s.*,os.name situation_name from public.checklist_profile_stages s left join public.os_situations os on os.id=s.situation_id
    where s.profile_id=v_profile_id and s.organization_id=v_org and s.is_active order by s.sort_order,s.created_at loop
    insert into public.service_order_checklist_stages (organization_id,checklist_id,source_stage_id,stage_code_snapshot,stage_type_snapshot,name_snapshot,situation_id_snapshot,situation_name_snapshot,block_situation_exit_snapshot,block_resolution_snapshot,block_completion_snapshot,sort_order,status)
    values (v_org,v_checklist_id,v_stage.id,v_stage.code,v_stage.stage_type,v_stage.name,v_stage.situation_id,v_stage.situation_name,v_stage.block_situation_exit,v_stage.block_resolution,v_stage.block_completion,v_stage.sort_order,'pending') returning id into v_stage_id;
    insert into public.service_order_checklist_items (organization_id,stage_id,source_item_id,source_kind,title_snapshot,description_snapshot,response_type_snapshot,allow_na_snapshot,is_required_snapshot,photo_requirement_snapshot,observation_requirement_snapshot,sort_order)
    select v_org,v_stage_id,i.id,'profile',i.title,i.description,i.response_type,i.allow_na,i.is_required,i.photo_requirement,i.observation_requirement,i.sort_order
    from public.checklist_profile_items i where i.stage_id=v_stage.id and i.organization_id=v_org and i.is_active order by i.sort_order,i.created_at;
    insert into public.service_order_checklist_items (organization_id,stage_id,source_item_id,source_kind,title_snapshot,description_snapshot,response_type_snapshot,allow_na_snapshot,is_required_snapshot,photo_requirement_snapshot,observation_requirement_snapshot,sort_order)
    select v_org,v_stage_id,e.id,'equipment_extra',e.title,e.description,e.response_type,e.allow_na,e.is_required,e.photo_requirement,e.observation_requirement,100000+e.sort_order
    from public.equipment_checklist_items e where e.equipment_type_id=v_equipment_type_id and e.organization_id=v_org and e.stage_code=v_stage.code and e.is_active order by e.sort_order,e.created_at;
  end loop;
  insert into public.service_order_checklist_events (organization_id,checklist_id,service_order_id,event_type,payload,created_by)
  values (v_org,v_checklist_id,p_service_order_id,'snapshot_created',jsonb_build_object('profile_id',v_profile_id,'profile_name',v_profile_name,'profile_version',v_profile_version,'equipment_type_id',v_equipment_type_id),auth.uid());
  return v_checklist_id;
end;
$$;

create or replace function public.ensure_service_order_checklist(p_service_order_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_access_service_order_child(p_service_order_id,'orders.section.checklists','read') then raise exception 'Você não possui permissão para visualizar o checklist desta OS.' using errcode='42501'; end if;
  return private.ensure_service_order_checklist(p_service_order_id);
end;
$$;

create or replace function public.save_service_order_checklist_item_response(p_item_id uuid,p_response_code text,p_response_text text,p_response_number numeric,p_observation text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.service_order_checklist_items%rowtype; v_stage public.service_order_checklist_stages%rowtype; v_checklist public.service_order_checklists%rowtype; v_code text; v_has_answer boolean;
begin
  select * into v_item from public.service_order_checklist_items where id=p_item_id; if not found then raise exception 'Item de checklist não encontrado.' using errcode='P0002'; end if;
  select * into v_stage from public.service_order_checklist_stages where id=v_item.stage_id; select * into v_checklist from public.service_order_checklists where id=v_stage.checklist_id;
  if auth.uid() is null or not private.can_access_service_order_child(v_checklist.service_order_id,'orders.checklists.manage','manage') then raise exception 'Você não possui permissão para preencher checklists.' using errcode='42501'; end if;
  if v_stage.status='completed' then raise exception 'Reabra a etapa antes de alterar suas respostas.' using errcode='P0001'; end if;
  v_code:=nullif(lower(btrim(p_response_code)),'');
  if v_code='na' and not v_item.allow_na_snapshot then raise exception 'Este item não permite Não se aplica.' using errcode='22023'; end if;
  if v_code is distinct from 'na' then
    if v_item.response_type_snapshot='conformity' and v_code is not null and v_code not in ('ok','not_ok') then raise exception 'Resposta de conformidade inválida.' using errcode='22023';
    elsif v_item.response_type_snapshot='yes_no' and v_code is not null and v_code not in ('yes','no') then raise exception 'Resposta Sim/Não inválida.' using errcode='22023';
    elsif v_item.response_type_snapshot='confirmation' and v_code is not null and v_code<>'confirmed' then raise exception 'Resposta de confirmação inválida.' using errcode='22023'; end if;
  end if;
  if v_item.response_type_snapshot in ('text','number') and v_code is not null and v_code<>'na' then raise exception 'Código de resposta inválido para este tipo de item.' using errcode='22023'; end if;
  v_has_answer := v_code is not null or nullif(btrim(p_response_text),'') is not null or p_response_number is not null or nullif(btrim(p_observation),'') is not null;
  update public.service_order_checklist_items set response_code=v_code,response_text=case when v_code='na' then null else nullif(btrim(p_response_text),'') end,response_number=case when v_code='na' then null else p_response_number end,observation=nullif(btrim(p_observation),''),answered_by=case when v_has_answer then auth.uid() else null end,answered_at=case when v_has_answer then now() else null end,updated_at=now() where id=p_item_id;
  if v_has_answer and v_stage.status in ('pending','reopened') then update public.service_order_checklist_stages set status='in_progress' where id=v_stage.id; end if;
  if v_has_answer and v_checklist.status='pending' then update public.service_order_checklists set status='in_progress' where id=v_checklist.id; end if;
  insert into public.service_order_checklist_events (organization_id,checklist_id,service_order_id,stage_id,item_id,event_type,payload,created_by)
  values (v_checklist.organization_id,v_checklist.id,v_checklist.service_order_id,v_stage.id,v_item.id,'item_changed',jsonb_build_object('response_code',v_code),auth.uid());
end;
$$;

create or replace function public.attach_service_order_checklist_media(p_item_id uuid,p_media_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.service_order_checklist_items%rowtype; v_stage public.service_order_checklist_stages%rowtype; v_checklist public.service_order_checklists%rowtype; v_media_org uuid;
begin
  select * into v_item from public.service_order_checklist_items where id=p_item_id; if not found then raise exception 'Item de checklist não encontrado.' using errcode='P0002'; end if;
  select * into v_stage from public.service_order_checklist_stages where id=v_item.stage_id; select * into v_checklist from public.service_order_checklists where id=v_stage.checklist_id;
  if auth.uid() is null or not private.can_access_service_order_child(v_checklist.service_order_id,'orders.checklists.manage','manage') then raise exception 'Você não possui permissão para anexar fotos ao checklist.' using errcode='42501'; end if;
  if v_stage.status='completed' then raise exception 'Reabra a etapa antes de anexar novas fotos.' using errcode='P0001'; end if;
  select organization_id into v_media_org from public.media where id=p_media_id; if v_media_org is distinct from v_checklist.organization_id then raise exception 'Mídia inválida para esta empresa.' using errcode='23514'; end if;
  insert into public.service_order_checklist_item_media (organization_id,item_id,media_id,created_by) values (v_checklist.organization_id,p_item_id,p_media_id,auth.uid()) on conflict (item_id,media_id) do nothing;
  insert into public.service_order_media (organization_id,service_order_id,media_id,sort_order) values (v_checklist.organization_id,v_checklist.service_order_id,p_media_id,500) on conflict (service_order_id,media_id) do nothing;
  if v_stage.situation_id_snapshot is not null then
    insert into public.service_order_situation_media (organization_id,service_order_id,situation_id,media_id,uploaded_by) values (v_checklist.organization_id,v_checklist.service_order_id,v_stage.situation_id_snapshot,p_media_id,auth.uid()) on conflict (service_order_id,situation_id,media_id) do nothing;
  end if;
  insert into public.service_order_checklist_events (organization_id,checklist_id,service_order_id,stage_id,item_id,event_type,payload,created_by) values (v_checklist.organization_id,v_checklist.id,v_checklist.service_order_id,v_stage.id,v_item.id,'media_attached',jsonb_build_object('media_id',p_media_id),auth.uid());
end;
$$;

create or replace function public.complete_service_order_checklist_stage(p_stage_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_stage public.service_order_checklist_stages%rowtype; v_checklist public.service_order_checklists%rowtype; v_invalid integer;
begin
  select * into v_stage from public.service_order_checklist_stages where id=p_stage_id; if not found then raise exception 'Etapa de checklist não encontrada.' using errcode='P0002'; end if;
  select * into v_checklist from public.service_order_checklists where id=v_stage.checklist_id;
  if auth.uid() is null or not private.can_access_service_order_child(v_checklist.service_order_id,'orders.checklists.manage','manage') then raise exception 'Você não possui permissão para concluir checklists.' using errcode='42501'; end if;
  if v_stage.status='completed' then return; end if;
  select count(*) into v_invalid from public.service_order_checklist_items i where i.stage_id=p_stage_id and i.is_required_snapshot and not (
    ((i.allow_na_snapshot and i.response_code='na') or (i.response_type_snapshot='conformity' and i.response_code in ('ok','not_ok')) or (i.response_type_snapshot='yes_no' and i.response_code in ('yes','no')) or (i.response_type_snapshot='confirmation' and i.response_code='confirmed') or (i.response_type_snapshot='text' and nullif(btrim(i.response_text),'') is not null) or (i.response_type_snapshot='number' and i.response_number is not null))
    and (i.photo_requirement_snapshot in ('none','optional') or (i.photo_requirement_snapshot='required' and exists(select 1 from public.service_order_checklist_item_media m where m.item_id=i.id)) or (i.photo_requirement_snapshot='required_on_failure' and (not ((i.response_type_snapshot='conformity' and i.response_code='not_ok') or (i.response_type_snapshot='yes_no' and i.response_code='no')) or exists(select 1 from public.service_order_checklist_item_media m where m.item_id=i.id))))
    and (i.observation_requirement_snapshot in ('none','optional') or (i.observation_requirement_snapshot='required' and nullif(btrim(i.observation),'') is not null) or (i.observation_requirement_snapshot='required_on_failure' and (not ((i.response_type_snapshot='conformity' and i.response_code='not_ok') or (i.response_type_snapshot='yes_no' and i.response_code='no')) or nullif(btrim(i.observation),'') is not null)))
  );
  if v_invalid>0 then raise exception 'Checklist possui % item(ns) obrigatório(s) pendente(s).',v_invalid using errcode='P0001'; end if;
  update public.service_order_checklist_stages set status='completed',completed_by=auth.uid(),completed_at=now() where id=p_stage_id;
  if not exists(select 1 from public.service_order_checklist_stages where checklist_id=v_checklist.id and id<>p_stage_id and status<>'completed') then
    update public.service_order_checklists set status='completed',completed_by=auth.uid(),completed_at=now() where id=v_checklist.id;
  else update public.service_order_checklists set status='in_progress' where id=v_checklist.id; end if;
  insert into public.service_order_checklist_events (organization_id,checklist_id,service_order_id,stage_id,event_type,payload,created_by) values (v_checklist.organization_id,v_checklist.id,v_checklist.service_order_id,p_stage_id,'stage_completed','{}'::jsonb,auth.uid());
end;
$$;

create or replace function public.reopen_service_order_checklist_stage(p_stage_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_stage public.service_order_checklist_stages%rowtype; v_checklist public.service_order_checklists%rowtype;
begin
  select * into v_stage from public.service_order_checklist_stages where id=p_stage_id; if not found then raise exception 'Etapa de checklist não encontrada.' using errcode='P0002'; end if;
  select * into v_checklist from public.service_order_checklists where id=v_stage.checklist_id;
  if auth.uid() is null or not private.can_access_service_order_child(v_checklist.service_order_id,'orders.checklists.reopen','manage') then raise exception 'Você não possui permissão para reabrir etapas de checklist.' using errcode='42501'; end if;
  if v_stage.status<>'completed' then return; end if;
  update public.service_order_checklist_stages set status='reopened',completed_by=null,completed_at=null,reopened_by=auth.uid(),reopened_at=now() where id=p_stage_id;
  update public.service_order_checklists set status='in_progress',completed_by=null,completed_at=null where id=v_checklist.id;
  insert into public.service_order_checklist_events (organization_id,checklist_id,service_order_id,stage_id,event_type,payload,created_by) values (v_checklist.organization_id,v_checklist.id,v_checklist.service_order_id,p_stage_id,'stage_reopened','{}'::jsonb,auth.uid());
end;
$$;

create or replace function private.service_order_checklist_snapshot_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$ begin perform private.ensure_service_order_checklist(new.id); return new; end; $$;
drop trigger if exists service_orders_checklist_snapshot on public.service_orders;
create trigger service_orders_checklist_snapshot after insert or update of equipment_type_id on public.service_orders for each row execute function private.service_order_checklist_snapshot_trigger();

create or replace function private.validate_service_order_checklist_gates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_checklist_id uuid; v_blocking_name text; v_situation_name text;
begin
  if new.cancelled_at is not null and old.cancelled_at is null then return new; end if;
  v_checklist_id:=private.ensure_service_order_checklist(new.id); if v_checklist_id is null then return new; end if;
  if old.situation_id is distinct from new.situation_id and old.situation_id is not null then
    select s.name_snapshot,coalesce(s.situation_name_snapshot,os.name) into v_blocking_name,v_situation_name
    from public.service_order_checklist_stages s left join public.os_situations os on os.id=old.situation_id
    where s.checklist_id=v_checklist_id and s.situation_id_snapshot=old.situation_id and s.block_situation_exit_snapshot and s.status<>'completed' order by s.sort_order limit 1;
    if v_blocking_name is not null then raise exception 'Conclua o checklist "%" antes de sair da situação "%".',v_blocking_name,coalesce(v_situation_name,'atual') using errcode='P0001'; end if;
  end if;
  if old.is_solved=false and new.is_solved=true then
    select name_snapshot into v_blocking_name from public.service_order_checklist_stages where checklist_id=v_checklist_id and block_resolution_snapshot and status<>'completed' order by sort_order limit 1;
    if v_blocking_name is not null then raise exception 'Conclua o checklist "%" antes de resolver a OS.',v_blocking_name using errcode='P0001'; end if;
  end if;
  if old.completed_at is null and new.completed_at is not null then
    select name_snapshot into v_blocking_name from public.service_order_checklist_stages where checklist_id=v_checklist_id and block_completion_snapshot and status<>'completed' order by sort_order limit 1;
    if v_blocking_name is not null then raise exception 'Conclua o checklist "%" antes de concluir a OS.',v_blocking_name using errcode='P0001'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists service_orders_checklist_gates on public.service_orders;
create trigger service_orders_checklist_gates before update of situation_id,is_solved,completed_at,cancelled_at on public.service_orders for each row execute function private.validate_service_order_checklist_gates();

revoke execute on function public.save_checklist_profile(uuid,uuid,text,text,boolean,jsonb) from public;
revoke execute on function public.save_equipment_checklist_configuration(uuid,uuid,uuid,jsonb) from public;
revoke execute on function public.ensure_service_order_checklist(uuid) from public;
revoke execute on function public.save_service_order_checklist_item_response(uuid,text,text,numeric,text) from public;
revoke execute on function public.attach_service_order_checklist_media(uuid,uuid) from public;
revoke execute on function public.complete_service_order_checklist_stage(uuid) from public;
revoke execute on function public.reopen_service_order_checklist_stage(uuid) from public;
grant execute on function public.save_checklist_profile(uuid,uuid,text,text,boolean,jsonb) to authenticated;
grant execute on function public.save_equipment_checklist_configuration(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.ensure_service_order_checklist(uuid) to authenticated;
grant execute on function public.save_service_order_checklist_item_response(uuid,text,text,numeric,text) to authenticated;
grant execute on function public.attach_service_order_checklist_media(uuid,uuid) to authenticated;
grant execute on function public.complete_service_order_checklist_stage(uuid) to authenticated;
grant execute on function public.reopen_service_order_checklist_stage(uuid) to authenticated;
