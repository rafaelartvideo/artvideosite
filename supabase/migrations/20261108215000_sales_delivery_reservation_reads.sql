begin;
create or replace function public.get_sales_delivery_v1(
 p_organization_id uuid,p_order_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para visualizar a entrega.' using errcode='42501'; end if;
 select jsonb_build_object(
  'id',d.id,'method',d.method,'address_snapshot',d.address_snapshot,
  'expected_at',d.expected_at,'tracking_code',d.tracking_code,
  'carrier_name',d.carrier_name,'recipient_name',d.recipient_name,
  'recipient_document',d.recipient_document,'proof_media_id',d.proof_media_id,
  'proof_notes',d.proof_notes,'completed_at',d.completed_at
 ) into v_result from public.sales_order_deliveries d
 where d.organization_id=p_organization_id and d.order_id=p_order_id;
 return v_result;
end;$function$;

create or replace function public.list_sales_proposal_reservations_v1(
 p_organization_id uuid,p_proposal_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para visualizar reservas.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'inventory_item_id',r.inventory_item_id,
  'product_name',s.name,'quantity_base',r.quantity_base,
  'expires_at',r.expires_at,
  'status',case when r.status='active' and r.expires_at<=now() then 'expired'
   else r.status end
 ) order by s.name,r.id),'[]'::jsonb)
 into v_result
 from public.sales_stock_reservations r
 join public.inventory_items s on s.id=r.inventory_item_id and s.organization_id=r.organization_id
 where r.organization_id=p_organization_id and r.proposal_id=p_proposal_id;
 return v_result;
end;$function$;

revoke all on function public.get_sales_delivery_v1(uuid,uuid) from public,anon;
revoke all on function public.list_sales_proposal_reservations_v1(uuid,uuid) from public,anon;
grant execute on function public.get_sales_delivery_v1(uuid,uuid) to authenticated;
grant execute on function public.list_sales_proposal_reservations_v1(uuid,uuid) to authenticated;
commit;