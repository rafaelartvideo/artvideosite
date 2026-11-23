-- Custo operacional por ciclo R1/R2: não gera baixa ou despesa no caixa.
-- Somente gestores com permissão de Financeiro visualizam as margens.
BEGIN;
CREATE TABLE IF NOT EXISTS public.service_order_return_costs (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  labor_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK(labor_cost>=0),
  other_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK(other_cost>=0),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=500),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,service_order_id)
);
CREATE TABLE IF NOT EXISTS public.service_order_return_cost_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  before_value jsonb,
  after_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_order_return_cost_audit_order_idx
  ON public.service_order_return_cost_audit(organization_id,service_order_id,changed_at DESC);
ALTER TABLE public.service_order_return_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_return_cost_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_order_return_costs_read_v1 ON public.service_order_return_costs;
CREATE POLICY service_order_return_costs_read_v1 ON public.service_order_return_costs
FOR SELECT TO authenticated USING (
  private.is_organization_member(organization_id)
  AND private.has_effective_organization_permission(organization_id,'finance.receivables.view')
);
DROP POLICY IF EXISTS service_order_return_cost_audit_read_v1 ON public.service_order_return_cost_audit;
CREATE POLICY service_order_return_cost_audit_read_v1 ON public.service_order_return_cost_audit
FOR SELECT TO authenticated USING (
  private.is_organization_member(organization_id)
  AND private.has_effective_organization_permission(organization_id,'finance.receivables.view')
);
REVOKE ALL ON public.service_order_return_costs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.service_order_return_cost_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.service_order_return_costs TO authenticated;
GRANT SELECT ON public.service_order_return_cost_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.set_service_order_return_cost_v1(
  p_organization_id uuid,p_service_order_id uuid,p_labor_cost numeric,
  p_other_cost numeric,p_notes text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_order public.service_orders%rowtype;
        v_previous public.service_order_return_costs%rowtype;
        v_result public.service_order_return_costs%rowtype;
        v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL
      OR NOT private.is_organization_member(p_organization_id)
      OR NOT private.has_effective_organization_permission(p_organization_id,'orders.edit')
      OR NOT private.has_effective_organization_permission(p_organization_id,'finance.receivables.edit')
  THEN RAISE EXCEPTION 'Sem permissão para registrar custos do retorno.' USING errcode='42501'; END IF;
  IF p_labor_cost IS NULL OR p_labor_cost<0 OR p_labor_cost>999999999999.99
     OR p_other_cost IS NULL OR p_other_cost<0 OR p_other_cost>999999999999.99
     OR length(coalesce(p_notes,''))>500
  THEN RAISE EXCEPTION 'Custos ou observações inválidos.' USING errcode='22023'; END IF;
  SELECT * INTO v_order FROM public.service_orders
    WHERE organization_id=p_organization_id AND id=p_service_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.return_root_id IS NULL OR v_order.cancelled_at IS NOT NULL
  THEN RAISE EXCEPTION 'Somente retornos de OS ativos ou concluídos permitem custos operacionais.' USING errcode='23514'; END IF;
  SELECT * INTO v_previous FROM public.service_order_return_costs
    WHERE organization_id=p_organization_id AND service_order_id=p_service_order_id FOR UPDATE;
  IF FOUND AND v_previous.labor_cost=round(p_labor_cost,2)
     AND v_previous.other_cost=round(p_other_cost,2)
     AND v_previous.notes=coalesce(p_notes,'')
  THEN RETURN to_jsonb(v_previous); END IF;
  INSERT INTO public.service_order_return_costs AS record(
    organization_id,service_order_id,labor_cost,other_cost,notes,updated_by,updated_at
  ) VALUES (
    p_organization_id,p_service_order_id,round(p_labor_cost,2),round(p_other_cost,2),
    coalesce(p_notes,''),v_actor,now()
  ) ON CONFLICT(organization_id,service_order_id) DO UPDATE SET
    labor_cost=excluded.labor_cost,other_cost=excluded.other_cost,notes=excluded.notes,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at
  RETURNING * INTO v_result;
  INSERT INTO public.service_order_return_cost_audit(
    organization_id,service_order_id,before_value,after_value,changed_by
  ) VALUES (
    p_organization_id,p_service_order_id,
    CASE WHEN v_previous.service_order_id IS NULL THEN NULL ELSE
      jsonb_build_object('labor_cost',v_previous.labor_cost,'other_cost',v_previous.other_cost,'notes',v_previous.notes) END,
    jsonb_build_object('labor_cost',v_result.labor_cost,'other_cost',v_result.other_cost,'notes',v_result.notes),
    v_actor
  );
  RETURN to_jsonb(v_result);
END
$body$;
REVOKE ALL ON FUNCTION public.set_service_order_return_cost_v1(uuid,uuid,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_service_order_return_cost_v1(uuid,uuid,numeric,numeric,text) TO authenticated;

-- Uma única consulta limitada à cadeia de uma OS. Custos de peças utilizam
-- os snapshots históricos das movimentações de estoque (não preços atuais).
CREATE OR REPLACE FUNCTION public.get_service_order_return_financial_summary_v1(
  p_organization_id uuid,p_service_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_root_id uuid;
        v_root_number text;
        v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
      OR NOT private.is_organization_member(p_organization_id)
      OR NOT private.has_effective_organization_permission(p_organization_id,'finance.receivables.view')
  THEN RAISE EXCEPTION 'Sem permissão para ver custos dos retornos.' USING errcode='42501'; END IF;
  SELECT coalesce(return_root_id,id) INTO v_root_id FROM public.service_orders
    WHERE id=p_service_order_id AND organization_id=p_organization_id;
  IF v_root_id IS NULL THEN RAISE EXCEPTION 'OS não encontrada.' USING errcode='P0002'; END IF;
  SELECT os_number INTO v_root_number FROM public.service_orders
    WHERE id=v_root_id AND organization_id=p_organization_id;
  WITH cycles AS (
    SELECT s.id,s.os_number,s.return_sequence,s.return_root_id,s.return_classification,
           s.completed_at,s.final_total
    FROM public.service_orders s
    WHERE s.organization_id=p_organization_id AND (s.id=v_root_id OR s.return_root_id=v_root_id)
  ), movement_totals AS (
    SELECT m.service_order_id,
      round(coalesce(sum(CASE
        WHEN upper(m.movement_type)='OUT' AND m.movement_origin='service_order' THEN
          coalesce(m.total_cost,abs(m.quantity)*coalesce(m.unit_cost,m.average_cost_before,0))
        WHEN upper(m.movement_type)='IN' AND m.movement_origin='return' THEN
          -coalesce(m.total_cost,abs(m.quantity)*coalesce(m.unit_cost,m.average_cost_before,0))
        ELSE 0 END),0),2) parts_cost,
      count(*) FILTER (
        WHERE upper(m.movement_type)='OUT' AND m.movement_origin='service_order'
          AND m.total_cost IS NULL AND m.unit_cost IS NULL AND m.average_cost_before IS NULL
      ) AS missing_cost_movements
    FROM public.inventory_movements m
    WHERE m.organization_id=p_organization_id
      AND m.service_order_id IN (SELECT id FROM cycles)
      AND m.movement_origin IN ('service_order','return')
    GROUP BY m.service_order_id
  ), rows AS (
    SELECT c.id,c.os_number,c.return_sequence,c.return_root_id,c.return_classification,
           c.completed_at,coalesce(c.final_total,0) charged_total,
           coalesce(m.parts_cost,0) parts_cost,
           coalesce(cost.labor_cost,0) labor_cost,
           coalesce(cost.other_cost,0) other_cost,
           coalesce(m.missing_cost_movements,0) missing_cost_movements
    FROM cycles c
    LEFT JOIN movement_totals m ON m.service_order_id=c.id
    LEFT JOIN public.service_order_return_costs cost
      ON cost.organization_id=p_organization_id AND cost.service_order_id=c.id
  )
  SELECT jsonb_build_object(
    'root_order_id',v_root_id,
    'root_os_number',v_root_number,
    'cycles',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.return_sequence,r.os_number) FROM rows r),'[]'::jsonb),
    'totals',(SELECT jsonb_build_object(
      'charged_total',round(coalesce(sum(charged_total),0),2),
      'return_parts_cost',round(coalesce(sum(parts_cost) FILTER (WHERE return_sequence>0),0),2),
      'return_labor_cost',round(coalesce(sum(labor_cost) FILTER (WHERE return_sequence>0),0),2),
      'return_other_cost',round(coalesce(sum(other_cost) FILTER (WHERE return_sequence>0),0),2),
      'return_cost',round(coalesce(sum(parts_cost+labor_cost+other_cost) FILTER (WHERE return_sequence>0),0),2),
      'missing_cost_movements',coalesce(sum(missing_cost_movements),0)
    ) FROM rows)
  ) INTO v_result;
  RETURN v_result;
END
$body$;
REVOKE ALL ON FUNCTION public.get_service_order_return_financial_summary_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_service_order_return_financial_summary_v1(uuid,uuid) TO authenticated;
COMMIT;
