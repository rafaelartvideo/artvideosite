-- Métrica secundária: tempo entre respostas por episódio, carregada somente na aba Análises.
-- Uma sequência de mensagens do cliente antes de uma resposta conta UMA espera.
-- Nunca consulta textos, fotos ou mídias; só IDs, origem e horários indexados.
BEGIN;
CREATE OR REPLACE FUNCTION private.union_wa_followup_analytics_internal(p_org uuid,p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $body$
DECLARE v_from timestamptz;v_threshold integer:=15;v_result jsonb;
BEGIN
 IF (select auth.uid()) IS NULL OR p_org IS NULL
   OR NOT private.has_tenant_module_permission(p_org,'whatsapp','whatsapp.inbox.view')
   OR NOT private.has_tenant_module_permission(p_org,'whatsapp','whatsapp.inbox.manage')
   OR NOT private.union_whatsapp_allowed(p_org,'view_all') THEN
   RAISE EXCEPTION 'Sem acesso às análises de atendimentos' USING ERRCODE='42501';
 END IF;
 v_from:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)));
 SELECT coalesce(q.critical_minutes,15) INTO v_threshold
 FROM public.union_whatsapp_queue_settings q WHERE q.organization_id=p_org;
 v_threshold:=coalesce(v_threshold,15);
 WITH protocols AS MATERIALIZED (
   SELECT p.id,p.department_id,p.closed_at
   FROM public.union_whatsapp_protocols p
   WHERE p.organization_id=p_org AND p.opened_at>=v_from
 ), events AS MATERIALIZED (
   SELECT m.protocol_id,m.id,m.sent_at,m.direction,m.origin,
     p.department_id,p.closed_at,
     coalesce(sum(CASE WHEN m.direction='outgoing' AND m.origin='union' THEN 1 ELSE 0 END)
       OVER (PARTITION BY m.protocol_id ORDER BY m.sent_at,m.id
         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS replies_before
   FROM public.union_whatsapp_messages m JOIN protocols p ON p.id=m.protocol_id
   WHERE m.direction='incoming' OR (m.direction='outgoing' AND m.origin='union')
 ), episodes AS MATERIALIZED (
   SELECT protocol_id,min(department_id::text)::uuid AS department_id,
     bool_or(closed_at IS NULL) AS still_open,
     min(sent_at) FILTER(WHERE direction='incoming') AS customer_at,
     min(sent_at) FILTER(WHERE direction='outgoing' AND origin='union') AS human_at
   FROM events GROUP BY protocol_id,replies_before
   HAVING count(*) FILTER(WHERE direction='incoming')>0
 ), numbered AS MATERIALIZED (
   SELECT e.*,row_number() OVER(PARTITION BY e.protocol_id ORDER BY e.customer_at) AS position
   FROM episodes e
 ), spans AS MATERIALIZED (
   SELECT e.*,
      CASE WHEN e.human_at>=e.customer_at
        THEN round((extract(epoch FROM (e.human_at-e.customer_at))/60)::numeric,2)
      END AS elapsed_minutes,
      CASE WHEN e.human_at>=e.customer_at
        THEN private.union_wa_business_minutes(p_org,e.department_id,NULL,e.customer_at,e.human_at)
      END AS useful_minutes
   FROM numbered e WHERE e.position>1
 )
 SELECT jsonb_build_object(
  'episodes',(SELECT count(*) FROM spans),
  'responded',(SELECT count(*) FROM spans WHERE elapsed_minutes IS NOT NULL),
  'avg_followup_elapsed_minutes',(SELECT round(avg(elapsed_minutes),1) FROM spans),
  'avg_followup_useful_minutes',(SELECT round(avg(useful_minutes),1) FROM spans),
  'sla_valid',(SELECT count(*) FROM spans WHERE useful_minutes IS NOT NULL),
  'sla_met',(SELECT count(*) FROM spans WHERE useful_minutes BETWEEN 0 AND v_threshold),
  'unresolved',(SELECT count(*) FROM spans WHERE human_at IS NULL AND still_open),
  'unscored',(SELECT count(*) FROM spans WHERE elapsed_minutes IS NOT NULL AND useful_minutes IS NULL)
 ) INTO v_result;
 RETURN v_result;
END;
$body$;
REVOKE ALL ON FUNCTION private.union_wa_followup_analytics_internal(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.union_wa_followup_analytics_internal(uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.load_dashboard_attendance_followups_v1(p_org uuid,p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $body$
 SELECT private.union_wa_followup_analytics_internal(p_org,p_days);
$body$;
REVOKE ALL ON FUNCTION public.load_dashboard_attendance_followups_v1(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.load_dashboard_attendance_followups_v1(uuid,integer) TO authenticated;
COMMIT;