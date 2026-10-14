-- Painel do Técnico: permissões independentes, leitura mínima, GPS e fotos privadas.
-- Execute depois de 20261014090000_service_order_item_technician_tasks.sql.
begin;

insert into public.permissions (key,label,description,module_name,sort_order) values
 ('technician_panel.view','Acessar painel técnico','Exibe apenas serviços atribuídos ao próprio funcionário.','Painel do Técnico',4600),
 ('technician_panel.data.customer','Ver nome do cliente','Exibe o nome do cliente vinculado ao serviço.','Painel do Técnico',4610),
 ('technician_panel.data.contact','Ver contato do cliente','Exibe telefone ou WhatsApp do cliente.','Painel do Técnico',4620),
 ('technician_panel.data.equipment','Ver equipamento','Exibe tipo de equipamento vinculado à OS.','Painel do Técnico',4630),
 ('technician_panel.data.diagnosis','Ver diagnóstico','Exibe diagnóstico registrado na OS.','Painel do Técnico',4640),
 ('technician_panel.data.schedule','Ver agendamento','Exibe data de agendamento da OS.','Painel do Técnico',4650),
 ('technician_panel.data.location','Ver localizações da execução','Exibe as coordenadas registradas ao iniciar e finalizar o serviço.','Painel do Técnico',4660),
 ('technician_panel.data.photos','Ver fotos da execução','Permite consultar evidências fotográficas dos próprios serviços.','Painel do Técnico',4670),
 ('technician_panel.actions.start','Iniciar serviço','Registra início e GPS obrigatório.','Painel do Técnico',4680),
 ('technician_panel.actions.complete','Finalizar serviço','Registra descrição obrigatória e GPS obrigatório.','Painel do Técnico',4690),
 ('technician_panel.actions.photo','Enviar fotos','Anexa evidências a serviços atribuídos e iniciados.','Painel do Técnico',4700)
on conflict (key) do update set label=excluded.label,description=excluded.description,
  module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Proprietários existentes podem habilitar as permissões nas funções.
insert into public.role_permissions(role_id,permission_id)
select distinct member.role_id, permission.id
from public.organization_members member
cross join public.permissions permission
where member.is_owner and member.status='active' and member.role_id is not null
  and permission.key like 'technician_panel.%'
on conflict(role_id,permission_id) do nothing;

alter table public.service_order_item_tasks
  add column if not exists started_lat numeric(10,7),
  add column if not exists started_lng numeric(10,7),
  add column if not exists started_accuracy_m numeric(10,2),
  add column if not exists started_location_at timestamptz,
  add column if not exists completed_lat numeric(10,7),
  add column if not exists completed_lng numeric(10,7),
  add column if not exists completed_accuracy_m numeric(10,2),
  add column if not exists completed_location_at timestamptz,
  add column if not exists execution_report text,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null;

-- Nenhuma atualização de status pode inaugurar uma execução sem GPS.
create or replace function private.require_task_start_location()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'in_progress'
      and (new.started_lat is null or new.started_lng is null
           or new.started_accuracy_m is null or new.started_location_at is null) then
      raise exception 'O início da execução exige captura de localização.' using errcode='22023';
    end if;
  elsif new.status = 'in_progress' and old.status is distinct from 'in_progress'
    and (new.started_lat is null or new.started_lng is null
         or new.started_accuracy_m is null or new.started_location_at is null) then
    raise exception 'O início da execução exige captura de localização.' using errcode='22023';
  end if;
  return new;
end;
$$;
drop trigger if exists require_task_start_location on public.service_order_item_tasks;
create trigger require_task_start_location
before insert or update of status on public.service_order_item_tasks
for each row execute function private.require_task_start_location();

create table if not exists public.service_order_item_task_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.service_order_items(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (item_id,storage_path)
);
create index if not exists service_order_item_task_photos_item_idx
  on public.service_order_item_task_photos (item_id,created_at);
alter table public.service_order_item_task_photos enable row level security;
revoke all on public.service_order_item_task_photos from public, anon, authenticated;

-- Todas as operações consultam a empresa e o funcionário na base, nunca só no navegador.
create or replace function private.is_my_technician_task(p_item_id uuid,p_permission text default 'technician_panel.view')
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1
    from public.service_order_item_tasks task
    join public.employees employee
      on employee.id=task.assigned_employee_id
     and employee.organization_id=task.organization_id
    join public.service_order_items item
      on item.id=task.item_id and item.service_order_id=task.service_order_id
       and item.organization_id=task.organization_id and item.item_type in ('service','custom_service')
    join public.service_orders ord
      on ord.id=task.service_order_id and ord.organization_id=task.organization_id
    where task.item_id=p_item_id
      and exists(
        select 1 from public.organization_modules module
        where module.organization_id=task.organization_id
          and module.module_key='orders' and module.is_enabled
      )
      and employee.profile_id=(select auth.uid())
      and employee.is_active
      and private.has_effective_organization_permission(task.organization_id,'technician_panel.view')
      and private.has_effective_organization_permission(task.organization_id,p_permission)
  );
$$;
revoke all on function private.is_my_technician_task(uuid,text) from public,anon;
grant execute on function private.is_my_technician_task(uuid,text) to authenticated;

create or replace function public.list_my_technician_tasks_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user is null or not private.has_effective_organization_permission(p_organization_id,'technician_panel.view')
    or not exists(select 1 from public.organization_modules module
      where module.organization_id=p_organization_id and module.module_key='orders' and module.is_enabled)
    then raise exception 'Acesso negado ao Painel do Técnico.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', task.item_id,
      'service_order_id', task.service_order_id,
      'os_number', ord.os_number,
      'title', item.title_snapshot,
      'description', item.description_snapshot,
      'status', task.status,
      'started_at', task.started_at,
      'completed_at', task.completed_at,
      'execution_report', task.execution_report,
      'customer_name',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.customer')
         then customer.full_name else null end,
      'customer_contact',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.contact')
         then coalesce(nullif(customer.whatsapp,''),customer.phone) else null end,
      'equipment',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.equipment')
         then equipment.name else null end,
      'diagnosis',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.diagnosis')
         then ord.diagnosis else null end,
      'scheduled_at',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.schedule')
         then ord.scheduled_at else null end,
      'start_location',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.location')
         then jsonb_build_object('lat',task.started_lat,'lng',task.started_lng,'accuracy_m',task.started_accuracy_m,'captured_at',task.started_location_at) else null end,
      'finish_location',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.location')
         then jsonb_build_object('lat',task.completed_lat,'lng',task.completed_lng,'accuracy_m',task.completed_accuracy_m,'captured_at',task.completed_location_at) else null end
    ) order by case task.status when 'in_progress' then 0 when 'pending' then 1 when 'completed' then 2 else 3 end,
       ord.os_number desc, task.updated_at desc
  ),'[]'::jsonb)
  into v_result
  from public.service_order_item_tasks task
  join public.employees employee
    on employee.id=task.assigned_employee_id and employee.organization_id=task.organization_id
  join public.service_order_items item
    on item.id=task.item_id and item.service_order_id=task.service_order_id
       and item.organization_id=task.organization_id and item.item_type in ('service','custom_service')
  join public.service_orders ord
    on ord.id=task.service_order_id and ord.organization_id=task.organization_id
  left join public.customers customer
    on customer.id=ord.customer_id and customer.organization_id=p_organization_id
  left join public.equipment_types equipment
    on equipment.id=ord.equipment_type_id and equipment.organization_id=p_organization_id
  where task.organization_id=p_organization_id
    and employee.profile_id=v_user and employee.is_active;
  return v_result;
end;
$$;

-- Gestão da OS: leitura de execução, sem acesso direto à tabela de tarefas.
create or replace function public.list_order_service_tasks_v1(p_service_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not private.can_view_service_order(p_service_order_id) then
    raise exception 'Sem permissão para consultar os serviços desta OS.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',task.item_id,
    'assigned_employee_id',task.assigned_employee_id,
    'technician_name',employee.full_name,
    'status',task.status,
    'started_at',task.started_at,'completed_at',task.completed_at,
    'cancelled_at',task.cancelled_at,'updated_at',task.updated_at,
    'execution_report',task.execution_report,
    'start_location',jsonb_build_object('lat',task.started_lat,'lng',task.started_lng,
      'accuracy_m',task.started_accuracy_m,'captured_at',task.started_location_at),
    'finish_location',jsonb_build_object('lat',task.completed_lat,'lng',task.completed_lng,
      'accuracy_m',task.completed_accuracy_m,'captured_at',task.completed_location_at)
  ) order by task.updated_at,task.item_id),'[]'::jsonb)
  into v_result
  from public.service_order_item_tasks task
  left join public.employees employee
    on employee.id=task.assigned_employee_id and employee.organization_id=task.organization_id
  where task.service_order_id=p_service_order_id;
  return v_result;
end;
$$;

-- Coordenadas são obrigatórias e recentes; GPS de navegador não é prova anti-fraude.
create or replace function private.validate_technician_gps(
  p_lat numeric,p_lng numeric,p_accuracy numeric,p_captured_at timestamptz
) returns void language plpgsql set search_path = '' as $$
begin
  if p_lat is null or p_lat < -90 or p_lat > 90
    or p_lng is null or p_lng < -180 or p_lng > 180
    or p_accuracy is null or p_accuracy <= 0 or p_accuracy > 10000
    or p_captured_at is null
    or p_captured_at > now() + interval '2 minutes'
    or p_captured_at < now() - interval '10 minutes' then
    raise exception 'Ative a localização e obtenha coordenadas recentes para continuar.' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.validate_technician_gps(numeric,numeric,numeric,timestamptz) from public,anon;

create or replace function public.start_my_technician_task_v1(
  p_item_id uuid,p_lat numeric,p_lng numeric,p_accuracy_m numeric,p_captured_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_task public.service_order_item_tasks%rowtype;
begin
  if not private.is_my_technician_task(p_item_id,'technician_panel.actions.start') then
    raise exception 'Você não possui permissão ou atribuição para iniciar este serviço.' using errcode='42501';
  end if;
  perform private.validate_technician_gps(p_lat,p_lng,p_accuracy_m,p_captured_at);
  select * into v_task from public.service_order_item_tasks where item_id=p_item_id for update;
  if not private.is_my_technician_task(p_item_id,'technician_panel.actions.start') then
    raise exception 'A atribuição ou permissão deste serviço mudou.' using errcode='42501';
  end if;
  if v_task.status <> 'pending' then
    raise exception 'Somente serviços pendentes podem ser iniciados.' using errcode='22023';
  end if;
  if exists(select 1 from public.service_orders ord where ord.id=v_task.service_order_id
    and (ord.completed_at is not null or ord.cancelled_at is not null)) then
    raise exception 'Esta OS já está encerrada.' using errcode='22023';
  end if;
  update public.service_order_item_tasks
    set status='in_progress',started_at=now(),started_lat=p_lat,started_lng=p_lng,
    started_accuracy_m=p_accuracy_m,started_location_at=p_captured_at,
    cancelled_at=null,updated_at=now(),updated_by=(select auth.uid())
    where item_id=p_item_id;
  insert into public.service_order_item_task_events(
    item_id,service_order_id,organization_id,actor_id,from_status,to_status,from_employee_id,to_employee_id
  ) values (
    p_item_id,v_task.service_order_id,v_task.organization_id,(select auth.uid()),
    'pending','in_progress',v_task.assigned_employee_id,v_task.assigned_employee_id
  );
  return true;
end;
$$;

create or replace function public.finish_my_technician_task_v1(
  p_item_id uuid,p_report text,p_lat numeric,p_lng numeric,p_accuracy_m numeric,p_captured_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_task public.service_order_item_tasks%rowtype;
begin
  if not private.is_my_technician_task(p_item_id,'technician_panel.actions.complete') then
    raise exception 'Você não possui permissão ou atribuição para finalizar este serviço.' using errcode='42501';
  end if;
  perform private.validate_technician_gps(p_lat,p_lng,p_accuracy_m,p_captured_at);
  if length(btrim(coalesce(p_report,''))) < 10 or length(p_report)>10000 then
    raise exception 'Descreva o serviço realizado com pelo menos 10 caracteres.' using errcode='22023';
  end if;
  select * into v_task from public.service_order_item_tasks where item_id=p_item_id for update;
  if not private.is_my_technician_task(p_item_id,'technician_panel.actions.complete') then
    raise exception 'A atribuição ou permissão deste serviço mudou.' using errcode='42501';
  end if;
  if v_task.status <> 'in_progress' or v_task.started_location_at is null then
    raise exception 'Inicie o serviço com localização antes de finalizá-lo.' using errcode='22023';
  end if;
  if exists(select 1 from public.service_orders ord where ord.id=v_task.service_order_id
     and (ord.completed_at is not null or ord.cancelled_at is not null)) then
    raise exception 'Esta OS já está encerrada.' using errcode='22023';
  end if;
  update public.service_order_item_tasks
    set status='completed',completed_at=now(),completed_lat=p_lat,completed_lng=p_lng,
      completed_accuracy_m=p_accuracy_m,completed_location_at=p_captured_at,
      execution_report=btrim(p_report),completed_by=(select auth.uid()),
      updated_by=(select auth.uid()),updated_at=now()
    where item_id=p_item_id;
  insert into public.service_order_item_task_events(
    item_id,service_order_id,organization_id,actor_id,from_status,to_status,from_employee_id,to_employee_id
  ) values (
    p_item_id,v_task.service_order_id,v_task.organization_id,(select auth.uid()),
    'in_progress','completed',v_task.assigned_employee_id,v_task.assigned_employee_id
  );
  return true;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('technician-task-photos','technician-task-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Pasta: organizacao/item/usuario/foto.ext
drop policy if exists technician_task_photo_insert on storage.objects;
create policy technician_task_photo_insert on storage.objects for insert to authenticated
with check (
  bucket_id='technician-task-photos'
  and (storage.foldername(name))[3]=(select auth.uid())::text
  and exists(
    select 1 from public.service_order_item_tasks task
    where task.organization_id::text=(storage.foldername(name))[1]
      and task.item_id::text=(storage.foldername(name))[2]
      and task.status='in_progress'
      and private.is_my_technician_task(task.item_id,'technician_panel.actions.photo')
  )
);

drop policy if exists technician_task_photo_select on storage.objects;
create policy technician_task_photo_select on storage.objects for select to authenticated
using (
  bucket_id='technician-task-photos'
  and exists(
    select 1 from public.service_order_item_tasks task
    where task.organization_id::text=(storage.foldername(name))[1]
      and task.item_id::text=(storage.foldername(name))[2]
      and private.is_my_technician_task(task.item_id,'technician_panel.data.photos')
  )
);

create or replace function public.register_my_technician_task_photo_v1(
  p_item_id uuid,p_storage_path text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_task public.service_order_item_tasks%rowtype;
  v_id uuid;
begin
  if not private.is_my_technician_task(p_item_id,'technician_panel.actions.photo') then
    raise exception 'Sem permissão para anexar fotos a este serviço.' using errcode='42501';
  end if;
  select * into v_task from public.service_order_item_tasks where item_id=p_item_id for update;
  if v_task.status <> 'in_progress' then
    raise exception 'Fotos só podem ser anexadas durante a execução do serviço.' using errcode='22023';
  end if;
  if p_storage_path not like v_task.organization_id::text || '/' || p_item_id::text || '/' || (select auth.uid())::text || '/%' then
    raise exception 'Caminho de arquivo inválido.' using errcode='22023';
  end if;
  if not exists(select 1 from storage.objects
    where bucket_id='technician-task-photos' and name=p_storage_path) then
    raise exception 'O arquivo informado não existe.' using errcode='P0002';
  end if;
  insert into public.service_order_item_task_photos (
    item_id,service_order_id,organization_id,storage_path,uploaded_by
  ) values(
    p_item_id,v_task.service_order_id,v_task.organization_id,p_storage_path,(select auth.uid())
  ) on conflict(storage_path) do update set storage_path=excluded.storage_path
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_my_technician_task_photos_v1(p_item_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when private.is_my_technician_task(p_item_id,'technician_panel.data.photos')
    then coalesce((
      select jsonb_agg(jsonb_build_object('id',photo.id,'path',photo.storage_path,
        'created_at',photo.created_at) order by photo.created_at)
      from public.service_order_item_task_photos photo
      where photo.item_id=p_item_id
    ),'[]'::jsonb)
    else '[]'::jsonb end
$$;

revoke all on function public.list_my_technician_tasks_v1(uuid) from public,anon,authenticated;
revoke all on function public.start_my_technician_task_v1(uuid,numeric,numeric,numeric,timestamptz) from public,anon,authenticated;
revoke all on function public.finish_my_technician_task_v1(uuid,text,numeric,numeric,numeric,timestamptz) from public,anon,authenticated;
revoke all on function public.register_my_technician_task_photo_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.list_my_technician_task_photos_v1(uuid) from public,anon,authenticated;
grant execute on function public.list_my_technician_tasks_v1(uuid) to authenticated;
grant execute on function public.start_my_technician_task_v1(uuid,numeric,numeric,numeric,timestamptz) to authenticated;
grant execute on function public.finish_my_technician_task_v1(uuid,text,numeric,numeric,numeric,timestamptz) to authenticated;
grant execute on function public.register_my_technician_task_photo_v1(uuid,text) to authenticated;
grant execute on function public.list_my_technician_task_photos_v1(uuid) to authenticated;

commit;
