-- Mesmo histórico de registros da OS regular, com escopo estrito à OS técnica atribuída.
begin;
insert into public.permissions (key,label,description,module_name,sort_order)
values ('technician_panel.actions.history.create','Adicionar registro à OS',
  'Permite registrar notas permanentes no histórico da OS atribuída, sem acesso ao financeiro.',
  'Painel do Técnico',4714)
on conflict(key) do update set label=excluded.label,description=excluded.description,
  module_name=excluded.module_name,sort_order=excluded.sort_order;

insert into public.role_permissions(role_id,permission_id)
select distinct r.id,p.id
from public.roles r
join public.permissions p on p.key='technician_panel.actions.history.create'
join public.permissions allowed on allowed.key='technician_panel.data.history'
join public.role_permissions rpa on rpa.role_id=r.id and rpa.permission_id=allowed.id
where r.is_active and private.permission_belongs_to_organization(r.organization_id,p.key)
on conflict (role_id,permission_id) do nothing;

create or replace function public.list_my_technician_order_records_v1(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.data.history') then
    raise exception 'Sem permissão para consultar registros da OS.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',entry.id,'type',entry.type,'authorId',entry.author_id,
    'author',entry.author,'title',entry.title,'content',entry.content,
    'createdAt',entry.created_at
  ) order by entry.created_at desc,entry.id),'[]'::jsonb)
  into v_result
  from (
    select 'note-'||note.id::text id,'note'::text type,
      note.author_id author_id, coalesce(profile.full_name,'Usuário') author,
      'Registro da equipe'::text title,note.content content,note.created_at
    from public.service_order_history_notes note
    left join public.profiles profile on profile.id=note.author_id
    where note.service_order_id=p_order_id
    union all
    select 'situation-'||visit.id::text,'system'::text,null::uuid,'Sistema'::text,
      'Situação da OS'::text,coalesce(visit.situation_name_snapshot,'Situação atualizada')::text,
      visit.entered_at
    from public.service_order_situation_visits visit
    where visit.service_order_id=p_order_id
      and visit.organization_id=(select ord.organization_id from public.service_orders ord where ord.id=p_order_id)
    union all
    select 'execution-'||task.item_id::text,'system'::text,null::uuid,'Sistema'::text,
      'Execução técnica'::text,
      (coalesce(item.title_snapshot,'Serviço')||' — '||
       case task.status when 'pending' then 'Pendente'
         when 'in_progress' then 'Em andamento'
         when 'completed' then 'Concluído' else 'Cancelado' end)::text,
       task.updated_at
    from public.service_order_item_tasks task
    join public.service_order_items item on item.id=task.item_id and item.service_order_id=task.service_order_id
    join public.service_order_item_task_assignees assignee on assignee.item_id=task.item_id and assignee.organization_id=task.organization_id
    join public.employees employee on employee.id=assignee.employee_id and employee.organization_id=task.organization_id
    where task.service_order_id=p_order_id
      and employee.profile_id=(select auth.uid()) and employee.is_active
  ) entry;
  return v_result;
end;
$$;

create or replace function public.create_my_technician_order_record_v1(p_order_id uuid,p_content text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.actions.history.create') then
    raise exception 'Sem permissão para registrar no histórico.' using errcode='42501';
  end if;
  if p_content is null or char_length(btrim(p_content)) not between 1 and 2000 then
    raise exception 'O registro deve ter entre 1 e 2000 caracteres.' using errcode='22023';
  end if;
  insert into public.service_order_history_notes (service_order_id,author_id,content)
  values (p_order_id,(select auth.uid()),btrim(p_content)) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.list_my_technician_order_records_v1(uuid) from public,anon,authenticated;
revoke all on function public.create_my_technician_order_record_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.list_my_technician_order_records_v1(uuid) to authenticated;
grant execute on function public.create_my_technician_order_record_v1(uuid,text) to authenticated;
commit;
