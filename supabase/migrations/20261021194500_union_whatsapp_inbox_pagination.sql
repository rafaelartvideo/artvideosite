begin;

-- Conjuntos paginados: fila FIFO, demais por atividade e mensagens
-- com desempate estável para não perder registros com datas iguais.
create index if not exists union_whatsapp_paged_inbox_idx
  on public.union_whatsapp_conversations
  (organization_id,channel_id,account_phone,status,last_message_at desc,id desc);
create index if not exists union_whatsapp_paged_messages_idx
  on public.union_whatsapp_messages(conversation_id,sent_at desc,id desc);
create index if not exists union_whatsapp_paged_protocols_idx
  on public.union_whatsapp_protocols(conversation_id,opened_at desc,id desc);

-- Contadores em uma consulta, usando RLS existente (não SECURITY DEFINER).
-- O acesso entre empresas/conexões permanece controlado pela política de
-- union_whatsapp_conversations, inclusive encaminhamentos ao remetente.
create or replace function public.union_whatsapp_inbox_counts(
  p_organization uuid,p_channel uuid,p_account_phone text)
returns table(
  waiting_count bigint,
  in_att_count bigint,
  forwarded_count bigint,
  finished_count bigint,
  total_count bigint,
  unread_count bigint
)
language sql stable security invoker
set search_path='pg_catalog','public'
as $$
  select
    count(*) filter (where status='waiting' and forwarded_at is null),
    count(*) filter (where status='in_att' and forwarded_at is null),
    count(*) filter (where forwarded_at is not null
      and status not in ('finished','abandoned')),
    count(*) filter (where status='finished'),
    count(*),
    count(*) filter (where unread_count>0)
  from public.union_whatsapp_conversations
  where organization_id=p_organization
    and channel_id=p_channel
    and account_phone=p_account_phone
$$;
revoke all on function public.union_whatsapp_inbox_counts(uuid,uuid,text)
  from public,anon;
grant execute on function public.union_whatsapp_inbox_counts(uuid,uuid,text)
  to authenticated;

commit;