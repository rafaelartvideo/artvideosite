begin;

alter table public.union_whatsapp_conversations
  add column if not exists forwarded_by uuid references auth.users(id) on delete set null,
  add column if not exists forwarded_to uuid references auth.users(id) on delete set null,
  add column if not exists forwarded_to_department uuid references public.union_whatsapp_departments(id) on delete set null,
  add column if not exists forwarded_by_name text,
  add column if not exists forwarded_to_name text,
  add column if not exists forwarded_at timestamptz;

create index if not exists union_whatsapp_forwarded_by_idx
 on public.union_whatsapp_conversations(organization_id,forwarded_by,forwarded_at desc)
 where forwarded_by is not null;
create index if not exists union_whatsapp_forwarded_to_idx
 on public.union_whatsapp_conversations(organization_id,forwarded_to,forwarded_at desc)
 where forwarded_to is not null;

create table if not exists public.union_whatsapp_queue_settings(
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 warning_minutes integer not null default 5 check(warning_minutes between 1 and 720),
 critical_minutes integer not null default 15 check(critical_minutes between 2 and 1440),
 show_wait_time boolean not null default true,
 show_queue_position boolean not null default true,
 show_forward_badges boolean not null default true,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 constraint union_whatsapp_queue_threshold_order check(critical_minutes>warning_minutes)
);
alter table public.union_whatsapp_queue_settings enable row level security;
revoke all on public.union_whatsapp_queue_settings from public,anon,authenticated;

-- Somente quem participou do encaminhamento como remetente (e tem permissão
-- de visualizar atendimentos atribuídos) continua a ver a conversa.
-- Não concede permissão para enviar mensagens nem operar o atendimento.
drop policy if exists union_whatsapp_conversations_read on public.union_whatsapp_conversations;
create policy union_whatsapp_conversations_read on public.union_whatsapp_conversations
for select to authenticated
using (
 private.union_whatsapp_active_account_visible(organization_id,channel_id,account_phone)
 and (
   private.union_whatsapp_allowed(organization_id,'view_all')
   or (assigned_to=(select auth.uid()) and private.union_whatsapp_allowed(organization_id,'view_assigned'))
   or (forwarded_by=(select auth.uid()) and forwarded_at is not null
       and private.union_whatsapp_allowed(organization_id,'view_assigned'))
   or (status='waiting' and assigned_to is null
       and private.union_whatsapp_allowed(organization_id,'view_queues')
       and (department_id is null or exists(
         select 1 from public.union_whatsapp_department_members member
         where member.organization_id=union_whatsapp_conversations.organization_id
           and member.department_id=union_whatsapp_conversations.department_id
           and member.user_id=(select auth.uid())
       )))
 )
);

-- O retorno de um cliente após a conclusão inicia um novo protocolo.
-- Não herda etiqueta de encaminhamento de atendimentos encerrados.
create or replace function private.union_whatsapp_clear_forward_on_new_request()
returns trigger language plpgsql security invoker set search_path='pg_catalog','public' as $$
begin
 if old.status in ('finished','abandoned') and new.status='waiting' then
   new.forwarded_by=null;new.forwarded_to=null;
   new.forwarded_to_department=null;new.forwarded_at=null;
   new.forwarded_by_name=null;new.forwarded_to_name=null;
 end if;
 return new;
end;
$$;
revoke all on function private.union_whatsapp_clear_forward_on_new_request() from public,anon,authenticated;
create trigger union_whatsapp_clear_forward_new_request
before update of status on public.union_whatsapp_conversations
for each row when(old.status in ('finished','abandoned') and new.status='waiting')
execute function private.union_whatsapp_clear_forward_on_new_request();

commit;