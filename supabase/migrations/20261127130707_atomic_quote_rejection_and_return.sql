-- Rejeição e início de devolução na mesma transação, com bloqueio de alteração durante a retirada.
begin;
CREATE OR REPLACE FUNCTION private.guard_quote_during_unrepaired_return()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from private.order_unrepaired_return_attempts a where a.organization_id=old.organization_id and a.service_order_id=old.service_order_id and a.cancelled_at is null and a.completed_at is null) then
  raise exception 'Cancele a devolução pendente antes de alterar o orçamento.' using errcode='23514';
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_unrepaired_return_quote_forwarded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare quote_status text;
begin
 if exists(select 1 from public.service_orders os join public.service_types st on st.id=os.service_type_id and st.organization_id=os.organization_id
 where os.id=new.service_order_id and os.organization_id=new.organization_id
 and ((os.return_root_id is null and st.quote_workflow_enabled) or (os.return_root_id is not null and os.return_classification in ('unrelated','not_covered')))) then
  select q.status into quote_status from public.service_order_quote_proposals q where q.organization_id=new.organization_id and q.service_order_id=new.service_order_id for update;
  if quote_status is null or quote_status in ('draft','renegotiation') then
   raise exception 'Encaminhe o orçamento para aprovação antes de iniciar a devolução.' using errcode='23514';
  elsif quote_status is distinct from 'rejected' then
   raise exception 'Rejeite o orçamento antes de iniciar a devolução.' using errcode='23514';
  end if;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_quote_and_start_unrepaired_return_v1(p_organization_id uuid, p_order_id uuid, p_version integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare q public.service_order_quote_proposals%rowtype; a jsonb;
begin
 if auth.uid() is null then raise exception 'Sessão não autenticada' using errcode='42501'; end if;
 select * into q from public.service_order_quote_proposals where organization_id=p_organization_id and service_order_id=p_order_id for update;
 if not found or q.status<>'awaiting_approval' or q.version is distinct from p_version then
  raise exception 'O orçamento foi alterado. Atualize e confirme novamente.' using errcode='23514';
 end if;
 q:=public.manage_service_order_quote_v1(p_organization_id,p_order_id,'reject',jsonb_build_object('reason',p_reason));
 a:=public.start_order_unrepaired_return_v1(p_organization_id,p_order_id,'Orçamento reprovado',q.rejection_reason);
 return jsonb_build_object('quote',to_jsonb(q),'attempt',a);
end;
$function$;
revoke all on function public.reject_quote_and_start_unrepaired_return_v1(uuid,uuid,integer,text) from public,anon;
grant execute on function public.reject_quote_and_start_unrepaired_return_v1(uuid,uuid,integer,text) to authenticated;
revoke all on function private.guard_unrepaired_return_quote_forwarded(),private.guard_quote_during_unrepaired_return() from public,anon,authenticated;
CREATE TRIGGER guard_quote_during_unrepaired_return BEFORE UPDATE ON public.service_order_quote_proposals FOR EACH ROW EXECUTE FUNCTION private.guard_quote_during_unrepaired_return();
commit;
