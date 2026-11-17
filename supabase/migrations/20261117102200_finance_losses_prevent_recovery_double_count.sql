-- Orçamento renegociado: cada OS só computa uma oportunidade recuperada; versões anteriores permanecem históricas.
CREATE OR REPLACE FUNCTION private.record_rejected_quote_financial_loss()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_subtotal numeric := 0; v_discount numeric := 0; v_amount numeric := 0;
 v_os_number text; v_customer_name text;
BEGIN
 IF old.status IS NOT DISTINCT FROM new.status THEN RETURN new; END IF;
 IF new.status='rejected' THEN
   SELECT COALESCE(sum(COALESCE((item->>'quantity')::numeric,0)*COALESCE((item->>'unit_price')::numeric,0)
     +COALESCE((item->>'additional_cost')::numeric,0)),0)
   INTO v_subtotal FROM jsonb_array_elements(new.items) AS item;
   v_discount := CASE WHEN new.discount_type='percentage' THEN v_subtotal*new.discount_value/100 ELSE new.discount_value END;
   v_amount := round(greatest(0,v_subtotal-v_discount),2);
   SELECT so.os_number,COALESCE(c.full_name,'') INTO v_os_number,v_customer_name
   FROM public.service_orders so
   LEFT JOIN public.customers c ON c.id=so.customer_id AND c.organization_id=so.organization_id
   WHERE so.id=new.service_order_id AND so.organization_id=new.organization_id;
   UPDATE public.financial_losses SET status='superseded'
   WHERE organization_id=new.organization_id AND source_id=new.id AND status IN ('pending_return','renegotiated');
   INSERT INTO public.financial_losses
    (organization_id,source_type,source_id,service_order_id,quote_version,
     os_number,customer_name,amount,reason,items_snapshot,status,occurred_at)
   VALUES (new.organization_id,'rejected_service_order_quote',new.id,new.service_order_id,new.version,
     coalesce(v_os_number,''),coalesce(v_customer_name,''),v_amount,
     coalesce(nullif(btrim(new.rejection_reason),''),'Não informado'),new.items,
     'pending_return',now())
   ON CONFLICT (organization_id,source_type,source_id,quote_version) DO NOTHING;
 ELSIF new.status='approved' THEN
   UPDATE public.financial_losses SET status='recovered'
   WHERE organization_id=new.organization_id AND source_id=new.id AND status IN ('pending_return','renegotiated');
 ELSIF new.status='renegotiation' THEN
   UPDATE public.financial_losses SET status='renegotiated'
   WHERE organization_id=new.organization_id AND source_id=new.id AND status='pending_return';
 END IF;
 RETURN new;
END; $function$;