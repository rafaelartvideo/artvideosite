-- Agregados de OS para os gráficos; não transfere a lista completa ao navegador.
-- Os dados respeitam as políticas RLS das tabelas de origem.
CREATE OR REPLACE FUNCTION public.load_dashboard_orders_charts_v1(
  p_organization_id uuid,
  p_period_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  WITH scoped_orders AS MATERIALIZED (
    SELECT
      so.id,
      (so.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS opening_date,
      coalesce(nullif(btrim(st.title),''), 'Sem tipo de atendimento') AS service_type,
      coalesce(nullif(btrim(et.name),''), 'Sem tipo de equipamento') AS equipment_type,
      coalesce(nullif(btrim(em.name),''),
               nullif(btrim(so.model),''),
               'Sem modelo') AS equipment_model
    FROM public.service_orders so
    LEFT JOIN public.service_types st
      ON st.id=so.service_type_id AND st.organization_id=so.organization_id
    LEFT JOIN public.customer_equipments ce
      ON ce.id=so.customer_equipment_id AND ce.organization_id=so.organization_id
    LEFT JOIN public.equipment_types et
      ON et.id=coalesce(so.equipment_type_id,ce.equipment_type_id)
     AND et.organization_id=so.organization_id
    LEFT JOIN public.equipment_models em
      ON em.id=coalesce(so.equipment_model_id,ce.equipment_model_id)
     AND em.organization_id=so.organization_id
    WHERE so.organization_id=p_organization_id
      AND (select auth.uid()) IS NOT NULL
      AND private.has_tenant_module_permission(p_organization_id,'orders','orders.view')
      AND so.created_at >= now() - make_interval(days=>greatest(1,least(coalesce(p_period_days,30),365)))
  ),
  current_quotes AS MATERIALIZED (
    SELECT q.status,
      CASE WHEN q.status='approved' THEN q.approved_at ELSE q.updated_at END AS decided_at
    FROM public.service_order_quote_proposals q
    JOIN public.service_orders so ON so.id=q.service_order_id
      AND so.organization_id=q.organization_id
    WHERE q.organization_id=p_organization_id
      AND (select auth.uid()) IS NOT NULL
      AND private.has_tenant_module_permission(p_organization_id,'orders','orders.view')
      AND q.status IN ('approved','rejected')
  )
  SELECT jsonb_build_object(
    'opened', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',data.day::text,'value',data.total) ORDER BY data.day)
      FROM (SELECT opening_date AS day,count(*)::integer AS total
            FROM scoped_orders GROUP BY opening_date) data
    ), '[]'::jsonb),
    'service_types', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',data.name,'value',data.total)
        ORDER BY data.total DESC,data.name)
      FROM (SELECT service_type AS name,count(*)::integer AS total
            FROM scoped_orders GROUP BY service_type) data
    ), '[]'::jsonb),
    'equipment_types', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',data.name,'value',data.total)
        ORDER BY data.total DESC,data.name)
      FROM (SELECT equipment_type AS name,count(*)::integer AS total
            FROM scoped_orders GROUP BY equipment_type) data
    ), '[]'::jsonb),
    'equipment_models', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',data.name,'value',data.total)
        ORDER BY data.total DESC,data.name)
      FROM (SELECT equipment_model AS name,count(*)::integer AS total
            FROM scoped_orders GROUP BY equipment_model) data
    ), '[]'::jsonb),
    'quote_approved', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',data.day::text,'value',data.total) ORDER BY data.day)
      FROM (
        SELECT (decided_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
               count(*)::integer AS total
        FROM current_quotes
        WHERE status='approved'
          AND decided_at >= now() - make_interval(days=>greatest(1,least(coalesce(p_period_days,30),365)))
        GROUP BY 1
      ) data
    ), '[]'::jsonb),
    'quote_rejected', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name',data.day::text,'value',data.total) ORDER BY data.day)
      FROM (
        SELECT (decided_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
               count(*)::integer AS total
        FROM current_quotes
        WHERE status='rejected'
          AND decided_at >= now() - make_interval(days=>greatest(1,least(coalesce(p_period_days,30),365)))
        GROUP BY 1
      ) data
    ), '[]'::jsonb)
  );
$function$;
REVOKE ALL ON FUNCTION public.load_dashboard_orders_charts_v1(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.load_dashboard_orders_charts_v1(uuid,integer) TO authenticated;
