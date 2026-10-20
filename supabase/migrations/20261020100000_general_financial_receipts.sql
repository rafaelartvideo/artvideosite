-- Recibos não fiscais avulsos: documento independente do PDV, caixa e movimento financeiro.
CREATE TABLE IF NOT EXISTS public.financial_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  direction text NOT NULL CHECK (direction IN ('received','paid')),
  entity_id uuid REFERENCES public.entities(id),
  employee_id uuid REFERENCES public.employees(id),
  service_order_id uuid REFERENCES public.service_orders(id),
  financial_entry_id uuid REFERENCES public.financial_entries(id),
  counterpart_name text NOT NULL,
  counterpart_document text,
  description text NOT NULL,
  items jsonb NOT NULL,
  total_amount numeric(14,2) NOT NULL CHECK (total_amount > 0),
  payment_method_name text,
  notes text,
  issuer_name text NOT NULL,
  organization_name text NOT NULL,
  organization_document text,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_receipt_counterpart_check CHECK ((entity_id IS NOT NULL) <> (employee_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS financial_receipts_organization_issued_idx ON public.financial_receipts(organization_id,issued_at DESC);
ALTER TABLE public.financial_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_receipts_read ON public.financial_receipts;
CREATE POLICY financial_receipts_read ON public.financial_receipts FOR SELECT TO authenticated
  USING (
    private.has_effective_organization_permission(organization_id,'finance.receivables.view')
    OR private.has_effective_organization_permission(organization_id,'finance.payables.view')
  );
REVOKE ALL ON public.financial_receipts FROM anon,authenticated;
GRANT SELECT ON public.financial_receipts TO authenticated;
REVOKE ALL ON SEQUENCE public.financial_receipts_receipt_number_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.issue_financial_receipt_v1(p_organization_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_direction text := coalesce(p_payload->>'direction','');
  v_entity uuid := nullif(p_payload->>'entity_id','')::uuid;
  v_employee uuid := nullif(p_payload->>'employee_id','')::uuid;
  v_os uuid := nullif(p_payload->>'service_order_id','')::uuid;
  v_entry uuid := nullif(p_payload->>'financial_entry_id','')::uuid;
  v_name text;
  v_document text;
  v_issuer text;
  v_org_name text;
  v_org_document text;
  v_description text := trim(coalesce(p_payload->>'description',''));
  v_items jsonb := coalesce(p_payload->'items','[]'::jsonb);
  v_item jsonb;
  v_total numeric(14,2) := 0;
  v_value numeric(14,2);
  v_qty numeric;
  v_id uuid;
  v_row public.financial_receipts%rowtype;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING errcode='42501'; END IF;
  IF v_direction NOT IN ('received','paid') THEN RAISE EXCEPTION 'Tipo de recibo inválido.' USING errcode='22023'; END IF;
  IF NOT private.has_effective_organization_permission(p_organization_id,
    CASE WHEN v_direction='received' THEN 'finance.receivables.create' ELSE 'finance.payables.create' END)
  THEN RAISE EXCEPTION 'Sem permissão para emitir recibo.' USING errcode='42501'; END IF;
  IF (v_entity IS NULL) = (v_employee IS NULL) THEN
    RAISE EXCEPTION 'Selecione um cadastro ou funcionário para o recibo.' USING errcode='22023';
  END IF;
  IF v_entity IS NOT NULL THEN
    SELECT coalesce(nullif(trim(e.trade_name),''),nullif(trim(e.name),''),nullif(trim(e.legal_name),'')),
      e.document INTO v_name,v_document FROM public.entities e
    WHERE e.id=v_entity AND e.organization_id=p_organization_id AND e.is_active=true;
  ELSE
    SELECT nullif(trim(e.full_name),''),e.cpf INTO v_name,v_document FROM public.employees e
    WHERE e.id=v_employee AND e.organization_id=p_organization_id AND e.is_active=true;
  END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado nesta empresa.' USING errcode='23503'; END IF;
  IF v_os IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_orders o WHERE o.id=v_os AND o.organization_id=p_organization_id
  ) THEN RAISE EXCEPTION 'OS inválida para esta empresa.' USING errcode='23503'; END IF;
  IF v_entry IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.financial_entries e
    WHERE e.id=v_entry AND e.organization_id=p_organization_id AND e.entry_type=CASE WHEN v_direction='received' THEN 'receivable' ELSE 'payable' END
  ) THEN RAISE EXCEPTION 'Lançamento financeiro incompatível com o recibo.' USING errcode='23503'; END IF;
  SELECT coalesce(nullif(trim(p.full_name),''),nullif(trim(p.username),''),'Operador')
    INTO v_issuer FROM public.profiles p WHERE p.id=v_user AND p.is_active=true;
  IF v_issuer IS NULL THEN RAISE EXCEPTION 'Emitente sem perfil ativo.' USING errcode='42501'; END IF;
  SELECT o.name,o.document INTO v_org_name,v_org_document FROM public.organizations o
    WHERE o.id=p_organization_id AND o.status='active';
  IF v_org_name IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada.' USING errcode='23503'; END IF;
  IF v_description='' OR length(v_description)>500 THEN RAISE EXCEPTION 'Informe uma descrição válida.' USING errcode='22023'; END IF;
  IF jsonb_typeof(v_items)<>'array' OR jsonb_array_length(v_items)<1 OR jsonb_array_length(v_items)>30
    THEN RAISE EXCEPTION 'Informe de 1 a 30 itens.' USING errcode='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    IF length(trim(coalesce(v_item->>'description',''))) < 2 OR length(v_item->>'description')>400
       THEN RAISE EXCEPTION 'Descrição de item inválida.' USING errcode='22023'; END IF;
    v_qty := (v_item->>'quantity')::numeric;
    v_value := round((v_item->>'unit_price')::numeric,2);
    IF v_qty<=0 OR v_qty>99999 OR v_value<=0 OR v_value>999999999 THEN
      RAISE EXCEPTION 'Valor ou quantidade inválidos.' USING errcode='22023'; END IF;
    v_total := v_total + round(v_qty*v_value,2);
  END LOOP;
  IF v_total<=0 OR v_total>999999999999 THEN RAISE EXCEPTION 'Total inválido.' USING errcode='22023'; END IF;
  INSERT INTO public.financial_receipts (
    organization_id,direction,entity_id,employee_id,service_order_id,financial_entry_id,
    counterpart_name,counterpart_document,description,items,total_amount,
    payment_method_name,notes,issuer_name,organization_name,organization_document,issued_by
  ) VALUES (
    p_organization_id,v_direction,v_entity,v_employee,v_os,v_entry,
    v_name,v_document,v_description,v_items,v_total,
    nullif(trim(coalesce(p_payload->>'payment_method_name','')),''),
    nullif(trim(coalesce(p_payload->>'notes','')),''),
    v_issuer,v_org_name,v_org_document,v_user
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$function$;
REVOKE ALL ON FUNCTION public.issue_financial_receipt_v1(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_financial_receipt_v1(uuid,jsonb) TO authenticated;
COMMENT ON TABLE public.financial_receipts IS 'Recibos não fiscais de valores já recebidos/pagos; não provocam caixa, pagamento nem baixa do título.';
