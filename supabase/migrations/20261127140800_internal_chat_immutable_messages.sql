begin;
-- Published text is immutable. Older clients and direct RPC requests cannot edit it.
create or replace function private.internal_chat_edit(p_org uuid,p_id uuid,p_body text,p_delete boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Não é permitido editar ou excluir mensagens do chat interno' using errcode='42501';
end;
$$;
revoke all on function private.internal_chat_edit(uuid,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.internal_chat_edit_v1(uuid,uuid,text,boolean) from public,anon,authenticated;
revoke update(body,edited_at,deleted_at,mentions) on public.internal_chat_messages from public,anon,authenticated;
commit;
