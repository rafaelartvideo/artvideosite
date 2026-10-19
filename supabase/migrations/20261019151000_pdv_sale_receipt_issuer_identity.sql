-- Identidade do emitente no recibo do PDV, recuperada somente para empresa autorizada.
CREATE OR REPLACE FUNCTION public.get_pdv_sale_detail_v1(p_organization_id uuid, p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sale public.pdv_sales%rowtype;
  v_seller_name text;
  v_canceller_name text;
  v_items jsonb;
  v_payments jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_tenant_module_permission(p_organization_id,'pdv','pdv.view') then
    raise exception 'Sem permissão para acessar as vendas do PDV.' using errcode='42501';
  end if;

  select sale.* into v_sale
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id and sale.id=p_sale_id;
  if not found then
    raise exception 'Venda do PDV não encontrada.' using errcode='P0002';
  end if;

  select profile.full_name into v_seller_name from public.profiles profile where profile.id=v_sale.sold_by;
  select profile.full_name into v_canceller_name from public.profiles profile where profile.id=v_sale.cancelled_by;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',item.id,'product_id',item.product_id,'product_name',item.product_name_snapshot,
      'is_manual',item.product_id is null,'condition',item.product_condition,
      'condition_notes',item.condition_notes,'serial_number',item.serial_number,
      'sku',item.sku_snapshot,'barcode',item.barcode_snapshot,'quantity',item.quantity,
      'unit',item.unit_snapshot,'unit_price',item.unit_price,'line_subtotal',item.line_subtotal,
      'discount_amount',item.discount_amount,'line_total',item.line_total
    ) order by item.created_at,item.id
  ),'[]'::jsonb)
  into v_items
  from public.pdv_sale_items item
  where item.organization_id=p_organization_id and item.sale_id=p_sale_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',payment.id,'payment_method_id',payment.payment_method_id,
      'payment_method_name',payment.payment_method_name_snapshot,
      'method_type',payment.method_type_snapshot,
      'financial_account_name',payment.financial_account_name_snapshot,
      'amount',payment.amount,'tendered_amount',payment.tendered_amount,
      'change_amount',payment.change_amount,'fee_amount',payment.fee_amount,
      'settlement_status',coalesce(settlement.settlement_status,payment.settlement_status_snapshot)
    ) order by payment.created_at,payment.id
  ),'[]'::jsonb)
  into v_payments
  from public.pdv_sale_payments payment
  left join public.financial_settlements settlement
    on settlement.organization_id=payment.organization_id and settlement.id=payment.settlement_id
  where payment.organization_id=p_organization_id and payment.sale_id=p_sale_id;

  return jsonb_build_object(
    'id',v_sale.id,'sale_number',v_sale.sale_number,'status',v_sale.status,
    'organization_name', (select o.name from public.organizations o where o.id=p_organization_id),
    'organization_document', (select o.document from public.organizations o where o.id=p_organization_id),
    'customer_id',v_sale.customer_id,'customer_name',v_sale.customer_name_snapshot,
    'customer_document',v_sale.customer_document_snapshot,'subtotal',v_sale.subtotal,
    'discount_amount',v_sale.discount_amount,'surcharge_amount',v_sale.surcharge_amount,
    'total_amount',v_sale.total_amount,'change_amount',v_sale.change_amount,
    'notes',v_sale.notes,'sold_at',v_sale.sold_at,'sold_by_name',v_seller_name,
    'cancelled_at',v_sale.cancelled_at,'cancelled_by_name',v_canceller_name,
    'cancellation_reason',v_sale.cancellation_reason,'items',v_items,'payments',v_payments
  );
end;
$function$
;
