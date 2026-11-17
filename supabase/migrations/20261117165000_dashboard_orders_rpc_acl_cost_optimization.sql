-- RPCs de dashboard eficientes: a ACL é calculada uma vez por chamada.
-- RLS não é ignorada indiscriminadamente: o filtro de visibilidade das OS
-- reproduz a política service_orders_tenant_select com permissões e autoria.
-- O filtro de orçamento replica a exigência de orders.view.
CREATE OR REPLACE FUNCTION public.load_dashboard_orders_summary_v2(p_organization_id uuid,p_period_days integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$

DECLARE
  v_actor uuid := auth.uid();
  v_is_member boolean := false;
  v_can_monitor boolean := false;
  v_can_view boolean := false;
  v_view_all boolean := false;
BEGIN
  IF v_actor IS NULL OR p_organization_id IS NULL
     OR NOT private.is_organization_module_enabled(p_organization_id,'orders') THEN
    RAISE EXCEPTION 'Sem autorização para consultar dashboard de OS.' USING ERRCODE='42501';
  END IF;
  v_is_member := private.is_organization_member(p_organization_id);
  v_can_monitor := private.has_platform_permission('orders.monitor.view');
  IF NOT (v_is_member OR v_can_monitor) THEN
    RAISE EXCEPTION 'Sem acesso às ordens dessa empresa.' USING ERRCODE='42501';
  END IF;
  IF v_is_member THEN
    v_can_view := private.has_effective_organization_permission(p_organization_id,'orders.view');
    v_view_all := private.has_effective_organization_permission(p_organization_id,'orders.view_all');
  END IF;
  RETURN (

with visible_orders as materialized (
    select
      service_order.id,
      service_order.created_at,
      service_order.updated_at,
      service_order.completed_at,
      service_order.situation_started_at,
      case when status.id is null then null else status.id end as status_id,
      coalesce(status.name, 'Sem status') as status_name,
      coalesce(status.color, '#64748b') as status_color,
      case when situation.id is null then null else situation.id end as situation_id,
      coalesce(situation.name, 'Sem situação') as situation_name,
      coalesce(situation.color, '#64748b') as situation_color,
      situation.hours as situation_sla_hours
    from public.service_orders service_order
    left join public.order_statuses status
      on status.id = service_order.status_id
     and status.organization_id = p_organization_id
    left join public.os_situations situation
      on situation.id = service_order.situation_id
     and situation.organization_id = p_organization_id
    where service_order.organization_id = p_organization_id
      and (
        (v_can_monitor AND private.is_monitored_service_type(p_organization_id, service_order.service_type_id))
        OR (v_is_member AND (
          service_order.assigned_to = v_actor
          OR v_view_all
          OR (v_can_view AND private.is_current_user_service_order_staff(
            service_order.id, service_order.organization_id, service_order.technician_id, service_order.seller_id
          ))
        ))
      )
  ),
  classified_orders as materialized (
    select
      visible_order.*,
      case
        when situation_sla_hours is null or situation_sla_hours <= 0 then 'neutral'
        when (
          greatest(
            0::numeric,
            extract(epoch from (
              coalesce(completed_at, now())
              - coalesce(situation_started_at, updated_at, created_at)
            ))::numeric / 3600
          ) / situation_sla_hours
        ) > 1 then 'danger'
        when (
          greatest(
            0::numeric,
            extract(epoch from (
              coalesce(completed_at, now())
              - coalesce(situation_started_at, updated_at, created_at)
            ))::numeric / 3600
          ) / situation_sla_hours
        ) >= 0.8 then 'warning'
        else 'success'
      end as situation_sla_state
    from visible_orders visible_order
  )
  select jsonb_build_object(
    'total_orders', (select count(*)::integer from classified_orders),
    'orders_in_period', (
      select count(*)::integer from classified_orders
      where created_at >= now() - make_interval(days => greatest(1, coalesce(p_period_days, 30)))
    ),
    'active_orders', (
      select count(*)::integer from classified_orders where completed_at is null
    ),
    'waiting_orders', (
      select count(*)::integer
      from classified_orders
      where completed_at is null
        and (
          lower(status_name) like '%aguard%'
          or lower(status_name) like '%client%'
          or lower(status_name) like '%pendent%'
          or lower(situation_name) like '%aguard%'
          or lower(situation_name) like '%client%'
          or lower(situation_name) like '%pendent%'
        )
    ),
    'completed_in_period', (
      select count(*)::integer
      from classified_orders
      where completed_at is not null
        and completed_at >= now() - make_interval(days => greatest(1, coalesce(p_period_days, 30)))
    ),
    'situations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', grouped.situation_id,
          'name', grouped.situation_name,
          'color', grouped.situation_color,
          'total', grouped.total,
          'sla', jsonb_build_object(
            'success', grouped.sla_success,
            'warning', grouped.sla_warning,
            'danger', grouped.sla_danger,
            'neutral', grouped.sla_neutral
          )
        )
        order by grouped.total desc, grouped.situation_name
      )
      from (
        select
          situation_id,
          situation_name,
          situation_color,
          count(*)::integer as total,
          count(*) filter (where situation_sla_state = 'success')::integer as sla_success,
          count(*) filter (where situation_sla_state = 'warning')::integer as sla_warning,
          count(*) filter (where situation_sla_state = 'danger')::integer as sla_danger,
          count(*) filter (where situation_sla_state = 'neutral')::integer as sla_neutral
        from classified_orders
        group by situation_id, situation_name, situation_color
      ) grouped
    ), '[]'::jsonb),
    'statuses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', grouped.status_id,
          'name', grouped.status_name,
          'color', grouped.status_color,
          'total', grouped.total
        )
        order by grouped.total desc, grouped.status_name
      )
      from (
        select status_id, status_name, status_color, count(*)::integer as total
        from classified_orders
        group by status_id, status_name, status_color
      ) grouped
    ), '[]'::jsonb)
  )

  );
END;

$function$;
REVOKE ALL ON FUNCTION public.load_dashboard_orders_summary_v2(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.load_dashboard_orders_summary_v2(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.load_dashboard_orders_charts_v1(p_organization_id uuid,p_period_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$

DECLARE
  v_actor uuid := auth.uid();
  v_is_member boolean := false;
  v_can_monitor boolean := false;
  v_can_view boolean := false;
  v_view_all boolean := false;
BEGIN
  IF v_actor IS NULL OR p_organization_id IS NULL
     OR NOT private.is_organization_module_enabled(p_organization_id,'orders') THEN
    RAISE EXCEPTION 'Sem autorização para consultar dashboard de OS.' USING ERRCODE='42501';
  END IF;
  v_is_member := private.is_organization_member(p_organization_id);
  v_can_monitor := private.has_platform_permission('orders.monitor.view');
  IF NOT (v_is_member OR v_can_monitor) THEN
    RAISE EXCEPTION 'Sem acesso às ordens dessa empresa.' USING ERRCODE='42501';
  END IF;
  IF v_is_member THEN
    v_can_view := private.has_effective_organization_permission(p_organization_id,'orders.view');
    v_view_all := private.has_effective_organization_permission(p_organization_id,'orders.view_all');
  END IF;
  RETURN (

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
      AND (
        (v_can_monitor AND private.is_monitored_service_type(p_organization_id, so.service_type_id))
        OR (v_is_member AND (
          so.assigned_to = v_actor
          OR v_view_all
          OR (v_can_view AND private.is_current_user_service_order_staff(
            so.id, so.organization_id, so.technician_id, so.seller_id
          ))
        ))
      )
      AND so.created_at >= now() - make_interval(days=>greatest(1,least(coalesce(p_period_days,30),365)))
  ),
  current_quotes AS MATERIALIZED (
    SELECT q.status,
      CASE WHEN q.status='approved' THEN q.approved_at ELSE q.updated_at END AS decided_at
    FROM public.service_order_quote_proposals q
    JOIN public.service_orders so ON so.id=q.service_order_id
      AND so.organization_id=q.organization_id
    WHERE q.organization_id=p_organization_id
      AND v_is_member
      AND v_can_view
      AND (
        v_view_all OR so.assigned_to=v_actor
        OR private.is_current_user_service_order_staff(
          so.id,so.organization_id,so.technician_id,so.seller_id)
      )
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
  )

  );
END;

$function$;
REVOKE ALL ON FUNCTION public.load_dashboard_orders_charts_v1(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.load_dashboard_orders_charts_v1(uuid,integer) TO authenticated;
