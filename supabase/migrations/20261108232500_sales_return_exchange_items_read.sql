begin;
create or replace function public.list_sales_returns_v1(
 p_organization_id uuid,p_order_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_items jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para visualizar devoluções.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(
   jsonb_build_object(
      'id',r.id,'order_id',r.order_id,'return_number',r.return_number,
      'type',r.request_type,'status',r.status,'reason',r.reason,
      'credit_amount',r.gross_credit_amount,'disposition',r.disposition,
      'refund_payable_id',r.refund_payable_id,'created_at',r.created_at,
      'received_at',r.received_at,'notes',r.resolution_notes,
      'exchange_items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',x.id,'product_id',x.product_id,
          'product',x.product_name_snapshot,'quantity',x.quantity,
          'line_total',x.line_total
        ) order by x.created_at,x.id)
        from public.sales_order_exchange_items x
        where x.organization_id=p_organization_id and x.return_id=r.id
      ),'[]'::jsonb),
      'items',coalesce((select jsonb_agg(jsonb_build_object(
         'id',i.id,'order_item_id',i.order_item_id,'quantity',i.quantity,
         'credit_amount',i.credit_amount,'product',s.product_name_snapshot
      ) order by i.id) from public.sales_order_return_items i
      join public.sales_order_items s on s.id=i.order_item_id and s.organization_id=i.organization_id
      where i.organization_id=p_organization_id and i.return_id=r.id),'[]'::jsonb)
   ) order by r.created_at desc,r.id desc
 ),'[]'::jsonb) into v_items
 from public.sales_order_returns r
 where r.organization_id=p_organization_id
   and (p_order_id is null or r.order_id=p_order_id);
 return v_items;
end;$function$;
revoke all on function public.list_sales_returns_v1(uuid,uuid) from public,anon;
grant execute on function public.list_sales_returns_v1(uuid,uuid) to authenticated;
commit;