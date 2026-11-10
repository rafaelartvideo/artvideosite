-- Autoriza orçamento somente para retorno classificado como defeito em outra peça.

alter policy order_quote_create on public.service_order_quote_proposals with check ((private.is_organization_member(organization_id) AND private.is_organization_module_enabled(organization_id, 'orders'::text) AND (private.has_effective_organization_permission(organization_id, 'orders.edit'::text) OR private.has_effective_organization_permission(organization_id, 'orders.update'::text)) AND private.can_view_service_order(service_order_id) AND (EXISTS ( SELECT 1
   FROM (service_orders os
     JOIN service_types st ON ((st.id = os.service_type_id)))
  WHERE ((os.id = service_order_quote_proposals.service_order_id) AND (os.organization_id = service_order_quote_proposals.organization_id) AND (st.organization_id = os.organization_id) AND (st.quote_workflow_enabled OR (os.return_root_id IS NOT NULL AND os.return_classification IN ('unrelated','not_covered'))))))));

alter policy order_quote_comments_add on public.service_order_quote_comments with check (((author_id = ( SELECT auth.uid() AS uid)) AND private.is_organization_member(organization_id) AND private.is_organization_module_enabled(organization_id, 'orders'::text) AND (private.has_effective_organization_permission(organization_id, 'orders.edit'::text) OR private.has_effective_organization_permission(organization_id, 'orders.update'::text)) AND private.can_view_service_order(service_order_id) AND (EXISTS ( SELECT 1
   FROM (service_orders os
     JOIN service_types st ON ((st.id = os.service_type_id)))
  WHERE ((os.id = service_order_quote_comments.service_order_id) AND (os.organization_id = service_order_quote_comments.organization_id) AND (st.organization_id = os.organization_id) AND (st.quote_workflow_enabled OR (os.return_root_id IS NOT NULL AND os.return_classification IN ('unrelated','not_covered'))))))));

alter policy service_order_quote_photos_add on public.service_order_quote_photos with check ((private.can_view_service_order(service_order_id) AND private.can_access_shared_organization_resource(organization_id, 'orders'::text, 'manage'::text) AND private.has_effective_organization_permission(organization_id, 'orders.section.images'::text) AND (EXISTS ( SELECT 1
   FROM (service_orders os
     JOIN service_types st ON ((st.id = os.service_type_id)))
  WHERE ((os.id = service_order_quote_photos.service_order_id) AND (os.organization_id = service_order_quote_photos.organization_id) AND (st.organization_id = service_order_quote_photos.organization_id) AND (st.quote_workflow_enabled OR (os.return_root_id IS NOT NULL AND os.return_classification IN ('unrelated','not_covered'))) AND (os.completed_at IS NULL) AND (os.cancelled_at IS NULL)))) AND (EXISTS ( SELECT 1
   FROM media m
  WHERE ((m.id = service_order_quote_photos.media_id) AND (m.organization_id = service_order_quote_photos.organization_id) AND (m.uploaded_by = ( SELECT auth.uid() AS uid)) AND (m.bucket_id = 'service-images'::text) AND (m.mime_type ~~ 'image/%'::text) AND (m.storage_path ~~ (('orders/'::text || (service_order_quote_photos.service_order_id)::text) || '/attachments/quote/%'::text)))))));

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
    where so.id=p_order_id and so.organization_id=p_organization_id and (st.quote_workflow_enabled OR (so.return_root_id IS NOT NULL AND so.return_classification IN ('unrelated','not_covered')))
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
$function$;


create or replace function private.guard_return_items_until_authorized()
returns trigger language plpgsql security definer set search_path to ''
as $guard$
declare
  v_order_id uuid;
  v_org_id uuid;
  v_return_root_id uuid;
  v_class text;
begin
  v_order_id:=case when tg_op='DELETE' then old.service_order_id else new.service_order_id end;
  v_org_id:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  select return_root_id,return_classification into v_return_root_id,v_class
    from public.service_orders where id=v_order_id and organization_id=v_org_id;
  if v_return_root_id is null then return case when tg_op='DELETE' then old else new end; end if;
  if v_class='analysis' then
    raise exception 'Registre e classifique o diagnostico do retorno antes de adicionar itens.' using errcode='23514';
  end if;
  if v_class in ('unrelated','not_covered') and not exists (
    select 1 from public.service_order_quote_proposals quote
      where quote.service_order_id=v_order_id and quote.organization_id=v_org_id
        and quote.status='approved' and quote.approved_at is not null
  ) then
    raise exception 'Aguarde aprovacao do orcamento para executar ou incluir itens no retorno.' using errcode='23514';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$guard$;
drop trigger if exists guard_return_items_before_diagnosis on public.service_order_items;
create trigger guard_return_items_before_diagnosis
before insert or update or delete on public.service_order_items
for each row execute function private.guard_return_items_until_authorized();
drop trigger if exists guard_return_used_before_diagnosis on public.service_order_used_items;
create trigger guard_return_used_before_diagnosis
before insert or update or delete on public.service_order_used_items
for each row execute function private.guard_return_items_until_authorized();

