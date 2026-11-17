
-- Perdas comerciais: valor potencial não faturado, separado de movimentos e contas a receber.
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS closure_outcome text;
ALTER TABLE public.service_orders DROP CONSTRAINT IF EXISTS service_orders_closure_outcome_check;
ALTER TABLE public.service_orders ADD CONSTRAINT service_orders_closure_outcome_check
  CHECK (closure_outcome IS NULL OR closure_outcome='rejected_quote_return');
CREATE TABLE IF NOT EXISTS public.financial_losses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 source_type text NOT NULL CHECK (source_type='rejected_service_order_quote'),
 source_id uuid NOT NULL REFERENCES public.service_order_quote_proposals(id),
 service_order_id uuid NOT NULL REFERENCES public.service_orders(id),
 quote_version integer NOT NULL CHECK (quote_version>=1),
 os_number text NOT NULL,
 customer_name text NOT NULL DEFAULT '',
 amount numeric(14,2) NOT NULL CHECK (amount>=0),
 reason text NOT NULL,
 items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'pending_return'
   CHECK (status IN ('pending_return','renegotiated','superseded','recovered','confirmed')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,source_type,source_id,quote_version)
);
CREATE INDEX IF NOT EXISTS financial_losses_org_date_idx ON public.financial_losses(organization_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS financial_losses_order_idx ON public.financial_losses(service_order_id,occurred_at DESC);
ALTER TABLE public.financial_losses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_losses_view ON public.financial_losses;
CREATE POLICY financial_losses_view ON public.financial_losses FOR SELECT TO authenticated
 USING (private.is_organization_member(organization_id)
  AND private.is_organization_module_enabled(organization_id,'finance')
  AND private.has_effective_organization_permission(organization_id,'finance.reports.view'));
REVOKE ALL ON public.financial_losses FROM anon,authenticated;
GRANT SELECT ON public.financial_losses TO authenticated;

CREATE OR REPLACE FUNCTION private.record_rejected_quote_financial_loss()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
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
   WHERE organization_id=new.organization_id AND source_id=new.id AND status<>'confirmed';
 ELSIF new.status='renegotiation' THEN
   UPDATE public.financial_losses SET status='renegotiated'
   WHERE organization_id=new.organization_id AND source_id=new.id AND status='pending_return';
 END IF;
 RETURN new;
END; $function$;
DROP TRIGGER IF EXISTS record_rejected_quote_financial_loss ON public.service_order_quote_proposals;
CREATE TRIGGER record_rejected_quote_financial_loss
 AFTER UPDATE OF status ON public.service_order_quote_proposals FOR EACH ROW
 EXECUTE FUNCTION private.record_rejected_quote_financial_loss();

-- Importar somente a rejeição atual verificável; não inventar eventos históricos.
WITH amounts AS (
 SELECT q.*,
  (SELECT COALESCE(sum(COALESCE((item->>'quantity')::numeric,0)*COALESCE((item->>'unit_price')::numeric,0)
    +COALESCE((item->>'additional_cost')::numeric,0)),0)
    FROM jsonb_array_elements(q.items) AS item) AS subtotal
 FROM public.service_order_quote_proposals q WHERE q.status='rejected'
)
INSERT INTO public.financial_losses(organization_id,source_type,source_id,service_order_id,quote_version,
 os_number,customer_name,amount,reason,items_snapshot,status,occurred_at)
SELECT q.organization_id,'rejected_service_order_quote',q.id,q.service_order_id,q.version,
 so.os_number,COALESCE(c.full_name,''),
 round(greatest(0,q.subtotal - CASE WHEN q.discount_type='percentage'
   THEN q.subtotal*q.discount_value/100 ELSE q.discount_value END),2),
 coalesce(nullif(btrim(q.rejection_reason),''),'Não informado'),q.items,'pending_return',q.updated_at
FROM amounts q
JOIN public.service_orders so ON so.id=q.service_order_id AND so.organization_id=q.organization_id
LEFT JOIN public.customers c ON c.id=so.customer_id AND c.organization_id=so.organization_id
ON CONFLICT (organization_id,source_type,source_id,quote_version) DO NOTHING;
