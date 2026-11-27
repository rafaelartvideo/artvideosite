-- A versão atual do orçamento precisa estar encaminhada antes de iniciar devolução.
begin;
CREATE OR REPLACE FUNCTION private.guard_unrepaired_return_quote_forwarded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists(
    select 1 from public.service_orders os
    join public.service_types st on st.id=os.service_type_id and st.organization_id=os.organization_id
    where os.id=new.service_order_id and os.organization_id=new.organization_id
      and ((os.return_root_id is null and st.quote_workflow_enabled)
        or (os.return_root_id is not null and os.return_classification in ('unrelated','not_covered')))
  ) and not exists(
    select 1 from public.service_order_quote_proposals q
    where q.organization_id=new.organization_id and q.service_order_id=new.service_order_id
      and q.status in ('awaiting_approval','rejected','approved')
  ) then
    raise exception 'Encaminhe o orçamento para aprovação antes de iniciar a devolução.' using errcode='23514';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_unrepaired_return_quote_forwarded() from public,anon,authenticated;
CREATE TRIGGER trg_guard_unrepaired_return_quote_forwarded BEFORE INSERT ON private.order_unrepaired_return_attempts FOR EACH ROW EXECUTE FUNCTION private.guard_unrepaired_return_quote_forwarded();
commit;
