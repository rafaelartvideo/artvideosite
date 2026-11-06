-- Log seguro da justificativa de reabertura da OS, independentemente da permissão de notas manuais.
begin;
CREATE OR REPLACE FUNCTION private.record_approved_quote_reopening_v1(p_org uuid, p_order uuid, p_previous_version integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null
    or not private.is_organization_member(p_org)
    or not private.is_organization_module_enabled(p_org,'orders')
    or not (private.has_effective_organization_permission(p_org,'orders.edit')
      or private.has_effective_organization_permission(p_org,'orders.update'))
    or not private.can_view_service_order(p_order)
    or length(btrim(coalesce(p_reason,'')))<5
    or not exists (select 1 from public.service_order_quote_proposals q
      where q.service_order_id=p_order and q.organization_id=p_org
        and q.status='renegotiation' and q.applied_at is not null
        and q.version=p_previous_version+1)
  then raise exception 'Não foi possível registrar a justificativa da reabertura.' using errcode='42501'; end if;
  insert into public.service_order_history_notes(service_order_id,organization_id,author_id,content)
  values(p_order,p_org,(select auth.uid()),
    left('Orçamento versão '||p_previous_version||' reaberto para renegociação. Justificativa: '||btrim(p_reason),2000));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reopen_approved_service_order_quote_v1(p_organization_id uuid, p_order_id uuid, p_reason text)
 RETURNS service_order_quote_proposals
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_quote public.service_order_quote_proposals;
  v_order public.service_orders;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if (select auth.uid()) is null
     or not private.is_organization_member(p_organization_id)
     or not private.is_organization_module_enabled(p_organization_id,'orders')
     or not (private.has_effective_organization_permission(p_organization_id,'orders.edit')
       or private.has_effective_organization_permission(p_organization_id,'orders.update'))
     or not private.can_view_service_order(p_order_id) then
    raise exception 'Sem permissão para reabrir o orçamento da OS.' using errcode='42501';
  end if;
  if length(v_reason)<5 or length(v_reason)>2000 then
    raise exception 'Informe uma justificativa de 5 a 2000 caracteres.' using errcode='22023';
  end if;
  select so.* into v_order from public.service_orders so
    join public.service_types st on st.id=so.service_type_id and st.organization_id=so.organization_id
    where so.id=p_order_id and so.organization_id=p_organization_id and st.quote_workflow_enabled
      and so.completed_at is null and so.cancelled_at is null and so.is_solved is not true
    for update of so;
  if not found then
    raise exception 'A OS precisa estar aberta, não solucionada e com orçamento habilitado.';
  end if;
  select * into v_quote from public.service_order_quote_proposals
    where organization_id=p_organization_id and service_order_id=p_order_id
    for update;
  if not found or v_quote.status<>'approved' or v_quote.applied_at is null then
    raise exception 'Somente um orçamento aprovado pode ser reaberto por esta ação.';
  end if;
  if exists (select 1 from public.financial_receipts where service_order_id=p_order_id)
     or exists (select 1 from public.fiscal_documents where source_order_id=p_order_id)
     or exists (select 1 from public.financial_entries e where e.organization_id=p_organization_id
       and e.origin_reference in (p_order_id::text,v_order.os_number)
       and (e.origin_type ilike '%order%' or e.origin_type ilike '%os%')) then
    raise exception 'Há registros financeiros/fiscais na OS; não é permitido reabrir os itens aprovados.';
  end if;
  if exists (select 1 from public.service_order_item_tasks t
             where t.service_order_id=p_order_id and
               (t.status<>'pending' or t.started_at is not null or t.completed_at is not null
                 or t.cancelled_at is not null or t.scheduled_start_at is not null or t.assigned_employee_id is not null))
     or exists (select 1 from public.service_order_item_task_photos photo where photo.service_order_id=p_order_id)
     or exists (select 1 from public.service_order_item_task_events event where event.service_order_id=p_order_id)
     or exists (select 1 from public.service_order_item_task_assignees ta join public.service_order_items i
       on i.id=ta.item_id where i.service_order_id=p_order_id) then
    raise exception 'Já há execução técnica ou agendamento. Reabrir apagaria registros; operação bloqueada.';
  end if;
  perform set_config('app.quote_manage_rpc','allow',true);
  update public.service_order_quote_proposals set
    status='renegotiation',version=version+1,
    approved_at=null,approved_by=null,rejection_reason=null,
    updated_by=(select auth.uid()),updated_at=now()
  where id=v_quote.id returning * into v_quote;
  perform private.record_approved_quote_reopening_v1(p_organization_id,p_order_id,v_quote.version-1,v_reason);
  return v_quote;
end;
$function$
;
revoke all on function private.record_approved_quote_reopening_v1(uuid,uuid,integer,text) from public,anon;
grant execute on function private.record_approved_quote_reopening_v1(uuid,uuid,integer,text) to authenticated;
commit;