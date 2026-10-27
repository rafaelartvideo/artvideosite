begin;

-- Colaboradores são independentes do atendente responsável.
-- Operadores solicitantes não recebem acesso à conversa até serem aprovados.
create table if not exists public.union_whatsapp_conversation_participants (
  organization_id uuid not null,
  conversation_id uuid not null references public.union_whatsapp_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested','active','rejected','removed')),
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id,user_id)
);
create index if not exists union_whatsapp_participants_user_idx
  on public.union_whatsapp_conversation_participants(organization_id,user_id,status,updated_at desc);
create index if not exists union_whatsapp_participants_pending_idx
  on public.union_whatsapp_conversation_participants(conversation_id,status)
  where status='requested';
alter table public.union_whatsapp_conversation_participants enable row level security;
revoke all on public.union_whatsapp_conversation_participants from anon,authenticated;
grant select on public.union_whatsapp_conversation_participants to authenticated;

drop policy if exists union_whatsapp_participants_self_read on public.union_whatsapp_conversation_participants;
create policy union_whatsapp_participants_self_read
  on public.union_whatsapp_conversation_participants for select to authenticated
  using (user_id=(select auth.uid()) and
    private.union_whatsapp_allowed(organization_id,'view_assigned'));

-- Mantém as restrições existentes de conta/canal/organização; amplia
-- apenas a leitura das conversas cuja participação está ativa.
do $$
declare previous_qual text;
begin
  select qual into previous_qual from pg_policies
    where schemaname='public' and tablename='union_whatsapp_conversations'
      and policyname='union_whatsapp_conversations_read';
  if previous_qual is null then
    raise exception 'Política de acesso das conversas não encontrada';
  end if;
  if position('union_whatsapp_conversation_participants' in previous_qual)=0 then
    execute format('alter policy union_whatsapp_conversations_read on public.union_whatsapp_conversations using ((%s) or (private.union_whatsapp_active_account_visible(organization_id,channel_id,account_phone) and exists (select 1 from public.union_whatsapp_conversation_participants participant where participant.organization_id=union_whatsapp_conversations.organization_id and participant.conversation_id=union_whatsapp_conversations.id and participant.user_id=(select auth.uid()) and participant.status=''active'')))',previous_qual);
  end if;
end $$;

insert into public.union_whatsapp_permission_definitions
 (key,label,category,manager_default,operator_default,sort_order)
 values ('collaborate','Participar de conversas com outros operadores','Conversas',true,true,18)
on conflict (key) do nothing;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename='union_whatsapp_conversation_participants') then
    alter publication supabase_realtime add table public.union_whatsapp_conversation_participants;
  end if;
end $$;

commit;
