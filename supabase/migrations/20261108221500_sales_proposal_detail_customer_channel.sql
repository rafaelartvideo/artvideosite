-- Número do cliente para compartilhamento manual no WhatsApp (somente usuário autorizado de Vendas).
begin;
create or replace function public.get_sales_proposal_detail_v1(
 p_organization_id uuid,p_proposal_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para visualizar a proposta.' using errcode='42501'; end if;
 select to_jsonb(p)||jsonb_build_object(
  'customer_whatsapp',(select c.whatsapp from public.customers c
    where c.id=p.customer_id and c.organization_id=p.organization_id),
  'effective_status',case when p.valid_until<current_date and p.status in ('draft','sent','approved')
    then 'expired' else p.status end,
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'product_id',i.product_id,'name',i.name_snapshot,'sku',i.sku_snapshot,
   'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total)
   order by i.created_at,i.id)
   from public.sales_proposal_items i
   where i.organization_id=p_organization_id and i.proposal_id=p.id),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'type',e.event_type,'at',e.created_at,'by',
    coalesce(nullif(pr.full_name,''),'Sistema'),'data',e.event_data)
    order by e.created_at,e.id)
    from public.sales_proposal_events e
    left join public.profiles pr on pr.id=e.created_by
    where e.organization_id=p_organization_id and e.proposal_id=p.id),'[]'::jsonb)
 ) into v_result
 from public.sales_proposals p
 where p.organization_id=p_organization_id and p.id=p_proposal_id;
 if v_result is null then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
 return v_result;
end;$function$;
revoke all on function public.get_sales_proposal_detail_v1(uuid,uuid) from public,anon;
grant execute on function public.get_sales_proposal_detail_v1(uuid,uuid) to authenticated;
commit;
