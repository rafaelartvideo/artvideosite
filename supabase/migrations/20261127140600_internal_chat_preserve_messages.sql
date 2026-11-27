begin;

-- Preserve published messages, including when a stale frontend requests deletion.
-- Existing historical tombstones remain unchanged; their original text is not recoverable here.
create or replace function private.internal_chat_edit(p_org uuid,p_id uuid,p_body text,p_delete boolean)
returns void language plpgsql security definer set search_path='' as $$
declare m public.internal_chat_messages;
begin
 if not private.internal_chat_allowed(p_org,'internal_chat.use') then raise exception 'Sem acesso' using errcode='42501';end if;
 if p_delete is distinct from false then raise exception 'Não é permitido excluir mensagens do chat interno' using errcode='42501';end if;
 select * into m from public.internal_chat_messages where id=p_id and organization_id=p_org and sender_id=auth.uid() for update;
 if not found or m.kind<>'text' or m.deleted_at is not null or (m.group_id is not null and not private.internal_chat_group_member(p_org,m.group_id)) then raise exception 'Mensagem indisponível' using errcode='42501';end if;
 if m.attachment_path is null and char_length(btrim(coalesce(p_body,''))) between 1 and 4000 then
   update public.internal_chat_messages set body=btrim(p_body),edited_at=now(),mentions='{}' where id=p_id;
 else raise exception 'Mensagem inválida' using errcode='22023';end if;
end;
$$;
revoke all on function private.internal_chat_edit(uuid,uuid,text,boolean) from public,anon;
grant execute on function private.internal_chat_edit(uuid,uuid,text,boolean) to authenticated;
revoke delete on public.internal_chat_messages from public,anon,authenticated;
revoke update(deleted_at) on public.internal_chat_messages from public,anon,authenticated;

commit;
