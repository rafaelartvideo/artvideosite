-- Compromissos e Tarefas: modulo independente, multiempresa e com lembretes no servidor.
begin;

insert into public.system_modules(key,name,description,category,sort_order,is_active)
values ('work_items','Compromissos e Tarefas','Gerenciamento de tarefas e promessas com prazos, responsaveis, historico e alertas.','operation',26,true)
on conflict(key) do update set name=excluded.name,description=excluded.description,category=excluded.category,is_active=true;

insert into public.organization_modules(organization_id,module_key,is_enabled,enabled_at,updated_at)
select o.id,'work_items',true,now(),now() from public.organizations o
where o.status='active' and (
  coalesce(o.settings->>'is_artvideo_tenant','false')='true'
  or coalesce(o.settings->>'is_platform_operator','false')='true'
)
on conflict(organization_id,module_key) do nothing;

insert into public.permissions(key,label,description,module_name,sort_order) values
('work_items.view','Visualizar compromissos e tarefas','Consultar as tarefas e os compromissos da empresa.','Compromissos e Tarefas',3260),
('work_items.create','Criar compromissos e tarefas','Registrar compromissos e tarefas da empresa.','Compromissos e Tarefas',3261),
('work_items.edit','Editar e acompanhar tarefas','Atualizar tarefas, andamento, resultados e listas de verificacao.','Compromissos e Tarefas',3262),
('work_items.manage','Gerenciar tarefas da equipe','Acompanhar e distribuir tarefas para outros funcionarios.','Compromissos e Tarefas',3263)
on conflict(key) do update set label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.organization_modules om on om.organization_id=r.organization_id and om.module_key='work_items' and om.is_enabled
cross join public.permissions p
where r.is_active and lower(btrim(r.name)) in ('gestor','proprietario','proprietário')
  and p.key in ('work_items.view','work_items.create','work_items.edit','work_items.manage')
  and private.permission_belongs_to_organization(r.organization_id,p.key)
on conflict(role_id,permission_id) do nothing;

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'task' check (kind in ('task','commitment')),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  description text not null default '',
  status text not null default 'pending' check (status in ('pending','in_progress','waiting','completed','cancelled')),
  outcome text check (outcome in ('fulfilled','not_fulfilled','no_show','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  category text not null default '',
  starts_at timestamptz,
  due_at timestamptz,
  reminder_minutes integer[] not null default array[1440,60]::integer[],
  assigned_employee_ids uuid[] not null default '{}'::uuid[],
  customer_id uuid references public.customers(id) on delete set null,
  service_order_id uuid references public.service_orders(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_items_date_order check (starts_at is null or due_at is null or starts_at <= due_at),
  constraint work_items_reminder_safe check (cardinality(reminder_minutes) <= 8)
);

create index if not exists work_items_org_due_idx on public.work_items(organization_id,due_at);
create index if not exists work_items_org_status_idx on public.work_items(organization_id,status,created_at desc);
create index if not exists work_items_assignees_idx on public.work_items using gin(assigned_employee_ids);

create table if not exists public.work_item_checklist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 220),
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists work_item_checklist_item_idx on public.work_item_checklist(work_item_id,sort_order);

create table if not exists public.work_item_activity (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists work_item_activity_item_idx on public.work_item_activity(work_item_id,created_at desc);

create table if not exists public.work_item_reminders (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  remind_at timestamptz not null,
  sent_at timestamptz,
  unique(work_item_id,remind_at)
);
create index if not exists work_item_reminders_unsent_idx on public.work_item_reminders(remind_at)
where sent_at is null;

create or replace function private.work_item_before_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Campos protegidos nao podem ser alterados.' using errcode='42501';
  end if;
  if new.customer_id is not null and not exists (
    select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id
  ) then raise exception 'Cliente pertence a outra empresa.' using errcode='23514'; end if;
  if new.service_order_id is not null and not exists (
    select 1 from public.service_orders so where so.id=new.service_order_id
      and so.organization_id=new.organization_id and so.customer_id=new.customer_id
  ) then raise exception 'A OS deve pertencer ao cliente vinculado e a empresa ativa.' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.created_by is distinct from auth.uid()
    and not private.has_tenant_module_permission(new.organization_id,'work_items','work_items.manage')
    and (
      new.assigned_employee_ids is distinct from old.assigned_employee_ids
      or new.customer_id is distinct from old.customer_id
      or new.service_order_id is distinct from old.service_order_id
    ) then
    raise exception 'Somente o criador ou gestor pode redistribuir responsaveis e vinculos.' using errcode='42501';
  end if;
  if exists (
    select 1 from unnest(new.assigned_employee_ids) as assigned(employee_id)
    where not exists(select 1 from public.employees e where e.id=assigned.employee_id and e.organization_id=new.organization_id and e.is_active)
  ) then raise exception 'Responsavel invalido para a empresa.' using errcode='23514'; end if;
  if exists(select 1 from unnest(new.reminder_minutes) x where x < 0 or x > 525600) then
    raise exception 'Intervalo de lembrete invalido.' using errcode='23514';
  end if;
  if new.status='completed' then
    if new.kind='commitment' and new.outcome is null then
      raise exception 'Informe o resultado do compromisso.' using errcode='23514';
    end if;
    new.completed_at := coalesce(case when tg_op='UPDATE' and old.status='completed' then old.completed_at end,now());
    new.completed_by := coalesce(case when tg_op='UPDATE' and old.status='completed' then old.completed_by end,auth.uid());
  else
    new.completed_at := null;
    new.completed_by := null;
    if new.status <> 'cancelled' then new.outcome := null; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.work_item_before_write() from public,anon,authenticated;

create trigger work_item_before_write before insert or update on public.work_items
for each row execute function private.work_item_before_write();

create or replace function private.work_item_after_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_employee uuid;
  v_profile uuid;
  v_minutes int;
begin
  insert into public.work_item_activity(organization_id,work_item_id,actor_user_id,action,note)
  values(new.organization_id,new.id,auth.uid(),
    case when tg_op='INSERT' then 'created'
    when new.status is distinct from old.status then 'status:'||new.status
    when new.due_at is distinct from old.due_at then 'rescheduled'
    when new.assigned_employee_ids is distinct from old.assigned_employee_ids then 'assigned'
    else 'updated' end,
    case when new.kind='commitment' and new.status='completed' then new.outcome else null end);

  if new.due_at is null or new.status in ('completed','cancelled') then
    delete from public.work_item_reminders where work_item_id=new.id and sent_at is null;
  elsif tg_op='INSERT' or new.due_at is distinct from old.due_at
    or new.reminder_minutes is distinct from old.reminder_minutes
    or new.status is distinct from old.status then
    delete from public.work_item_reminders where work_item_id=new.id and sent_at is null;
    foreach v_minutes in array new.reminder_minutes loop
      insert into public.work_item_reminders(organization_id,work_item_id,remind_at)
      values(new.organization_id,new.id,new.due_at-make_interval(mins=>v_minutes))
      on conflict(work_item_id,remind_at) do nothing;
    end loop;
  end if;

  if tg_op='INSERT' or new.assigned_employee_ids is distinct from old.assigned_employee_ids then
    foreach v_employee in array new.assigned_employee_ids loop
      if tg_op='INSERT' or not (v_employee=any(old.assigned_employee_ids)) then
        select e.profile_id into v_profile from public.employees e where e.id=v_employee and e.organization_id=new.organization_id;
        if v_profile is not null and v_profile is distinct from auth.uid() then
          insert into public.organization_notifications
            (organization_id,recipient_user_id,actor_user_id,module_key,event_type,entity_type,entity_id,title,message,route,visibility_permissions)
          values(new.organization_id,v_profile,auth.uid(),'workItems','created','work_item',new.id::text,
            'Nova atividade atribuida',new.title,'/admin/work-items?item='||new.id::text,array['work_items.view']);
        end if;
      end if;
    end loop;
  end if;

  -- Notifica os envolvidos quando o andamento muda, sem duplicar o alerta para quem alterou.
  if tg_op='UPDATE' and new.status is distinct from old.status then
    for v_profile in
      select distinct participants.user_id
      from (
        select new.created_by as user_id
        union all
        select e.profile_id from public.employees e
        where e.organization_id=new.organization_id
          and e.id=any(new.assigned_employee_ids)
      ) participants
      where participants.user_id is not null and participants.user_id is distinct from auth.uid()
    loop
      insert into public.organization_notifications
        (organization_id,recipient_user_id,actor_user_id,module_key,event_type,entity_type,entity_id,
         title,message,route,visibility_permissions)
      values (new.organization_id,v_profile,auth.uid(),'workItems','updated','work_item',new.id::text,
        'Andamento atualizado',new.title,'/admin/work-items?item='||new.id::text,array['work_items.view']);
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.work_item_after_write() from public,anon,authenticated;
create trigger work_item_after_write after insert or update on public.work_items
for each row execute function private.work_item_after_write();

create or replace function private.work_item_checklist_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_organization uuid;
begin
  select organization_id into v_organization from public.work_items where id=new.work_item_id;
  if v_organization is null or new.organization_id<>v_organization then
    raise exception 'Checklist fora da empresa.' using errcode='23514';
  end if;
  if tg_op='UPDATE' and (new.organization_id is distinct from old.organization_id or new.work_item_id is distinct from old.work_item_id) then
    raise exception 'Vinculo do checklist nao pode ser alterado.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.work_item_checklist_guard() from public,anon,authenticated;
create trigger work_item_checklist_guard before insert or update on public.work_item_checklist
for each row execute function private.work_item_checklist_guard();

create or replace function private.work_item_checklist_audit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row record;
begin
  if tg_op='DELETE' then
    insert into public.work_item_activity(organization_id,work_item_id,actor_user_id,action,note)
    values(old.organization_id,old.work_item_id,auth.uid(),'checklist_removed',old.label);
    return old;
  end if;
  if tg_op='INSERT' then
    insert into public.work_item_activity(organization_id,work_item_id,actor_user_id,action,note)
    values(new.organization_id,new.work_item_id,auth.uid(),'checklist_added',new.label);
  elsif new.done is distinct from old.done then
    insert into public.work_item_activity(organization_id,work_item_id,actor_user_id,action,note)
    values(new.organization_id,new.work_item_id,auth.uid(),
      case when new.done then 'checklist_done' else 'checklist_reopened' end,new.label);
  end if;
  return new;
end;
$$;
revoke all on function private.work_item_checklist_audit() from public,anon,authenticated;
create trigger work_item_checklist_audit after insert or update or delete on public.work_item_checklist
for each row execute function private.work_item_checklist_audit();

alter table public.work_items enable row level security;
alter table public.work_item_checklist enable row level security;
alter table public.work_item_activity enable row level security;
alter table public.work_item_reminders enable row level security;

-- Funcionarios veem atividades criadas ou atribuídas a eles; gestores veem a equipe.
create or replace function private.is_work_item_assignee(p_organization_id uuid,p_employee_ids uuid[])
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.employees e
    where e.organization_id=p_organization_id
      and e.profile_id=(select auth.uid()) and e.id=any(p_employee_ids)
  );
$$;
revoke all on function private.is_work_item_assignee(uuid,uuid[]) from public,anon,authenticated;
grant execute on function private.is_work_item_assignee(uuid,uuid[]) to authenticated;

create policy work_items_select on public.work_items for select to authenticated
using (
  private.has_tenant_module_permission(organization_id,'work_items','work_items.view')
  and (
    private.has_tenant_module_permission(organization_id,'work_items','work_items.manage')
    or created_by=(select auth.uid())
    or private.is_work_item_assignee(work_items.organization_id,work_items.assigned_employee_ids)
  )
);
create policy work_items_insert on public.work_items for insert to authenticated
with check (created_by=auth.uid() and private.has_tenant_module_permission(organization_id,'work_items','work_items.create'));
create policy work_items_update on public.work_items for update to authenticated
using (
  private.has_tenant_module_permission(organization_id,'work_items','work_items.edit')
  and (
    private.has_tenant_module_permission(organization_id,'work_items','work_items.manage')
    or created_by=(select auth.uid())
    or private.is_work_item_assignee(work_items.organization_id,work_items.assigned_employee_ids)
  )
)
with check (
  private.has_tenant_module_permission(organization_id,'work_items','work_items.edit')
  and (
    private.has_tenant_module_permission(organization_id,'work_items','work_items.manage')
    or created_by=(select auth.uid())
    or private.is_work_item_assignee(work_items.organization_id,work_items.assigned_employee_ids)
  )
);

create policy work_item_checklist_select on public.work_item_checklist for select to authenticated
using (exists (select 1 from public.work_items w
  where w.id=work_item_id and w.organization_id=work_item_checklist.organization_id));
create policy work_item_checklist_insert on public.work_item_checklist for insert to authenticated
with check (
  private.has_tenant_module_permission(organization_id,'work_items','work_items.edit')
  and exists (select 1 from public.work_items w
    where w.id=work_item_id and w.organization_id=work_item_checklist.organization_id)
);
create policy work_item_checklist_update on public.work_item_checklist for update to authenticated
using (
  private.has_tenant_module_permission(organization_id,'work_items','work_items.edit')
  and exists (select 1 from public.work_items w where w.id=work_item_id and w.organization_id=work_item_checklist.organization_id)
)
with check (
  private.has_tenant_module_permission(organization_id,'work_items','work_items.edit')
  and exists (select 1 from public.work_items w where w.id=work_item_id and w.organization_id=work_item_checklist.organization_id)
);
create policy work_item_checklist_delete on public.work_item_checklist for delete to authenticated
using (
  private.has_tenant_module_permission(organization_id,'work_items','work_items.edit')
  and exists (select 1 from public.work_items w where w.id=work_item_id and w.organization_id=work_item_checklist.organization_id)
);
create policy work_item_activity_select on public.work_item_activity for select to authenticated
using (exists (select 1 from public.work_items w
  where w.id=work_item_id and w.organization_id=work_item_activity.organization_id));
-- Historico apenas por triggers: nao se permite reescrever eventos.

-- Consultas restritas evitam conceder acesso amplo a dados de funcionarios e OS.
create or replace function public.list_work_item_employees_v1(p_organization_id uuid)
returns table(id uuid,full_name text,profile_id uuid)
language sql stable security definer set search_path='' as $$
  select e.id,e.full_name::text,e.profile_id
  from public.employees e
  where e.organization_id=p_organization_id and e.is_active
    and (select auth.uid()) is not null
    and private.has_tenant_module_permission(p_organization_id,'work_items','work_items.view')
  order by e.full_name;
$$;
revoke all on function public.list_work_item_employees_v1(uuid) from public,anon;
grant execute on function public.list_work_item_employees_v1(uuid) to authenticated;

create or replace function public.list_work_item_customer_orders_v1(p_organization_id uuid,p_customer_id uuid)
returns table(id uuid,os_number text)
language sql stable security definer set search_path='' as $$
  select s.id,s.os_number::text from public.service_orders s
  where s.organization_id=p_organization_id and s.customer_id=p_customer_id
    and (select auth.uid()) is not null
    and private.has_tenant_module_permission(p_organization_id,'work_items','work_items.view')
  order by s.created_at desc limit 15;
$$;
revoke all on function public.list_work_item_customer_orders_v1(uuid,uuid) from public,anon;
grant execute on function public.list_work_item_customer_orders_v1(uuid,uuid) to authenticated;

-- A busca do cliente no modal nao exige habilitacao de Cadastros.
create policy customers_work_items_read on public.customers for select to authenticated
using (private.has_tenant_module_permission(organization_id,'work_items','work_items.view'));

revoke all on public.work_items,public.work_item_checklist,public.work_item_activity,public.work_item_reminders from public,anon;
grant select,insert,update on public.work_items to authenticated;
grant select,insert,update,delete on public.work_item_checklist to authenticated;
grant select on public.work_item_activity to authenticated;

create or replace function private.dispatch_work_item_reminders()
returns integer language plpgsql security definer set search_path='' as $$
declare reminder record; recipient uuid; count_sent integer:=0;
begin
  for reminder in
    select r.id,r.organization_id,r.work_item_id,w.title,w.created_by,w.assigned_employee_ids,w.status
    from public.work_item_reminders r
    join public.work_items w on w.id=r.work_item_id and w.organization_id=r.organization_id
    where r.sent_at is null and r.remind_at<=now()
    order by r.remind_at
    limit 150
    for update of r skip locked
  loop
    if reminder.status not in ('completed','cancelled') then
      for recipient in
        select distinct x.profile_id from (
          select reminder.created_by as profile_id
          union all
          select e.profile_id from public.employees e where e.organization_id=reminder.organization_id
          and e.id=any(reminder.assigned_employee_ids)
        ) x
        where x.profile_id is not null
      loop
        insert into public.organization_notifications
          (organization_id,recipient_user_id,module_key,event_type,entity_type,entity_id,title,message,route,visibility_permissions)
        values(reminder.organization_id,recipient,'workItems','created','work_item',reminder.work_item_id::text,
          'Lembrete de atividade',reminder.title,'/admin/work-items?item='||reminder.work_item_id::text,array['work_items.view']);
      end loop;
      count_sent:=count_sent+1;
    end if;
    update public.work_item_reminders set sent_at=now() where id=reminder.id;
  end loop;
  return count_sent;
end;
$$;
revoke all on function private.dispatch_work_item_reminders() from public,anon,authenticated;

select cron.schedule('work-items-reminders-5min','*/5 * * * *',
  'select private.dispatch_work_item_reminders();');
commit;