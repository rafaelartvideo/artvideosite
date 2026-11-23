begin;
-- Espelha os escopos de visibilidade do inbox, inclusive conta ativa,
-- fila/departamento, responsável e participantes. Evita vazamento entre operadores.
CREATE OR REPLACE FUNCTION private.union_wa_future_visible(p_org uuid, p_channel uuid, p_account text, p_conversation uuid, p_created_by uuid, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conversation public.union_whatsapp_conversations%rowtype;
  v_view_all boolean;
begin
  if (select auth.uid()) is null then return false; end if;
  if not exists (
    select 1 from private.union_whatsapp_read_accounts() scope
    where scope.organization_id=p_org and scope.channel_id=p_channel
      and scope.account_phone=p_account
  ) then return false; end if;
  if p_write and not private.union_whatsapp_allowed(p_org,'send') then return false; end if;

  select exists(select 1 from private.union_whatsapp_read_organizations('view_all') o
    where o=p_org) into v_view_all;
  if v_view_all then return true; end if;
  if p_created_by=(select auth.uid())
    and (private.union_whatsapp_allowed(p_org,'view_contacts')
      or private.union_whatsapp_allowed(p_org,'view_assigned')) then return true; end if;

  if p_conversation is null then
    return p_write and private.union_whatsapp_allowed(p_org,'view_contacts');
  end if;
  select c.* into v_conversation
  from public.union_whatsapp_conversations c
  where c.id=p_conversation and c.organization_id=p_org and c.channel_id=p_channel
    and c.account_phone=p_account;
  if not found then return false; end if;
  if v_conversation.assigned_to=(select auth.uid())
    and exists(select 1 from private.union_whatsapp_read_organizations('view_assigned') o
      where o=p_org) then return true; end if;
  if v_conversation.status='waiting' and v_conversation.assigned_to is null
    and (v_conversation.forwarded_at is null
      or v_conversation.forwarded_by is distinct from (select auth.uid()))
    and exists(select 1 from private.union_whatsapp_read_organizations('view_queues') o
      where o=p_org)
    and (v_conversation.department_id is null or exists (
      select 1 from public.union_whatsapp_department_members m
      where m.organization_id=p_org and m.department_id=v_conversation.department_id
        and m.user_id=(select auth.uid())
    )) then return true; end if;
  if exists(
    select 1 from public.union_whatsapp_conversation_participants participant
    where participant.organization_id=p_org and participant.conversation_id=p_conversation
      and participant.user_id=(select auth.uid()) and participant.status='active'
  ) then return true; end if;
  return false;
end $function$
;
revoke all on function private.union_wa_future_visible(uuid,uuid,text,uuid,uuid,boolean) from public,anon;
grant execute on function private.union_wa_future_visible(uuid,uuid,text,uuid,uuid,boolean) to authenticated;
drop policy if exists union_wa_future_select on public.union_whatsapp_future_opportunities;
create policy union_wa_future_select on public.union_whatsapp_future_opportunities
 for select to authenticated using (
  private.union_wa_future_visible(organization_id,channel_id,account_phone,conversation_id,created_by,false));
drop policy if exists union_wa_future_insert on public.union_whatsapp_future_opportunities;
create policy union_wa_future_insert on public.union_whatsapp_future_opportunities
 for insert to authenticated with check (
  created_by=(select auth.uid())
  and private.union_wa_future_visible(organization_id,channel_id,account_phone,conversation_id,created_by,true));
drop policy if exists union_wa_future_update on public.union_whatsapp_future_opportunities;
create policy union_wa_future_update on public.union_whatsapp_future_opportunities
 for update to authenticated using (
  private.union_wa_future_visible(organization_id,channel_id,account_phone,conversation_id,created_by,true))
 with check (
  private.union_wa_future_visible(organization_id,channel_id,account_phone,conversation_id,created_by,true));
drop policy if exists union_wa_future_history_select on public.union_whatsapp_future_opportunity_history;
create policy union_wa_future_history_select on public.union_whatsapp_future_opportunity_history
 for select to authenticated using (
  exists(select 1 from public.union_whatsapp_future_opportunities o
    where o.id=opportunity_id and o.organization_id=organization_id));
commit;
