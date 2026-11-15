-- PABX Union: menos APIs por ciclo; configuração de telecom intacta.
-- Stage first on a project with the same PBX migration history.
-- Cron idempotent by job name. Used only for expired encrypted login handoffs.

-- private.pbx_cleanup_login_requests_v1()
CREATE OR REPLACE FUNCTION private.pbx_cleanup_login_requests_v1()
 RETURNS TABLE(expired_count integer, removed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_expired integer:=0; v_removed integer:=0;
BEGIN
 UPDATE public.pbx_browser_login_requests
    SET status='failed',encrypted_secret=NULL
 WHERE status='ready' AND expires_at<clock_timestamp();
 GET DIAGNOSTICS v_expired=ROW_COUNT;
 DELETE FROM public.pbx_browser_login_requests
 WHERE created_at<clock_timestamp()-INTERVAL '24 hours';
 GET DIAGNOSTICS v_removed=ROW_COUNT;
 RETURN QUERY SELECT v_expired,v_removed;
END;
$function$;

-- pbx_poll_queue_availability(uuid)
CREATE OR REPLACE FUNCTION public.pbx_poll_queue_availability(p_agent_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT COALESCE(jsonb_agg(to_jsonb(j)-'last_checked_at'-'updated_at'
   ORDER BY j.last_checked_at NULLS FIRST,j.updated_at,j.queue_id,j.extension_id),'[]'::jsonb)
 FROM (
  SELECT c.queue_id,c.extension_id,c.organization_id,c.revision,c.desired_paused,
         e.endpoint_name,e.number,c.last_checked_at,c.updated_at
  FROM public.pbx_queue_member_controls c
  JOIN public.pbx_agents a ON a.id=c.agent_id AND a.organization_id=c.organization_id
  JOIN public.pbx_queues q ON q.id=c.queue_id AND q.organization_id=c.organization_id
  JOIN public.pbx_extensions e ON e.id=c.extension_id AND e.organization_id=c.organization_id
  JOIN public.pbx_queue_members m ON m.queue_id=c.queue_id AND m.extension_id=c.extension_id
  WHERE a.id=p_agent_id AND a.enabled AND private.pbx_agent_runtime_ready(a.id)
    AND q.enabled AND q.provisioning_status='applied'
    AND e.desired_enabled AND e.provisioning_status IN ('applied','manual')
    -- Nunca repetir o mesmo estado confirmado em todos os polls de 30s.
    -- Ainda conciliar com o Asterisk após reinicializações/perda de evento.
    AND (c.status IS DISTINCT FROM 'applied'
      OR c.last_checked_at IS NULL
      OR c.last_checked_at <= now()-interval '5 minutes')
  ORDER BY c.last_checked_at NULLS FIRST,c.updated_at,c.queue_id,c.extension_id LIMIT 10
 ) j;
$function$;

-- pbx_write_queue_telemetry_v1(uuid,jsonb)
CREATE OR REPLACE FUNCTION public.pbx_write_queue_telemetry_v1(p_agent_id uuid, p_telemetry jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid;
  v_entry jsonb;
  v_queue_id uuid;
  v_state text;
  v_waiting integer;
  v_members jsonb;
  v_changed_id uuid;
  v_changed integer := 0;
BEGIN
  SELECT a.organization_id INTO v_org
  FROM public.pbx_agents a
  WHERE a.id=p_agent_id AND a.enabled AND private.pbx_agent_runtime_ready(a.id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado' USING errcode='42501';
  END IF;
  IF jsonb_typeof(p_telemetry) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Telemetria invalida' USING errcode='23514';
  END IF;
  IF jsonb_array_length(p_telemetry)>10 THEN
    RAISE EXCEPTION 'Excesso de filas' USING errcode='23514';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_telemetry)
  LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
      OR coalesce(v_entry->>'queue_id','') !~ '^[0-9a-f-]{36}$'
      OR coalesce(v_entry->>'queue_state','') NOT IN ('active','missing')
      OR jsonb_typeof(v_entry->'waiting_count') IS DISTINCT FROM 'number'
      OR coalesce(v_entry->>'waiting_count','') !~ '^[0-9]{1,3}$'
      OR jsonb_typeof(v_entry->'members') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'Telemetria invalida' USING errcode='23514';
    END IF;
    v_queue_id := (v_entry->>'queue_id')::uuid;
    v_state := v_entry->>'queue_state';
    v_waiting := (v_entry->>'waiting_count')::integer;
    v_members := v_entry->'members';
    IF v_waiting>500 OR jsonb_array_length(v_members)>20 THEN
      RAISE EXCEPTION 'Telemetria fora do limite' USING errcode='23514';
    END IF;
    -- A submissão vem do agente autenticado; nenhuma fila de outra empresa
    -- pode ser criada, atualizada ou publicada via Realtime.
    IF NOT EXISTS(
      SELECT 1 FROM public.pbx_queues q
      WHERE q.id=v_queue_id AND q.organization_id=v_org
      AND q.enabled AND q.provisioning_status='applied'
    ) THEN
      CONTINUE;
    END IF;
    v_changed_id := NULL;
    INSERT INTO public.pbx_queue_live_status
      (queue_id,organization_id,queue_state,waiting_count,members,sampled_at)
    VALUES (v_queue_id,v_org,v_state,v_waiting,v_members,clock_timestamp())
    ON CONFLICT (queue_id) DO UPDATE SET
      queue_state=excluded.queue_state,
      waiting_count=excluded.waiting_count,
      members=excluded.members,
      sampled_at=excluded.sampled_at
    WHERE public.pbx_queue_live_status.organization_id=excluded.organization_id
      AND (
        public.pbx_queue_live_status.queue_state IS DISTINCT FROM excluded.queue_state
        OR public.pbx_queue_live_status.waiting_count IS DISTINCT FROM excluded.waiting_count
        OR public.pbx_queue_live_status.members IS DISTINCT FROM excluded.members
        OR public.pbx_queue_live_status.sampled_at < clock_timestamp()-interval '60 seconds'
      )
    RETURNING queue_id INTO v_changed_id;
    IF v_changed_id IS NOT NULL THEN v_changed:=v_changed+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('accepted',true,'updated',v_changed);
END;
$function$;

-- pbx_poll_bootstrap_v1(uuid,integer)
CREATE OR REPLACE FUNCTION public.pbx_poll_bootstrap_v1(p_agent_id uuid, p_protocol_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_org uuid;
 v_platform boolean;
 v_jobs jsonb;
 v_logins jsonb;
 v_queues jsonb;
 v_endpoints jsonb;
 v_availability jsonb;
BEGIN
 SELECT a.organization_id, private.is_platform_organization(a.organization_id)
 INTO v_org,v_platform
 FROM public.pbx_agents a
 WHERE a.id=p_agent_id AND a.enabled
 AND private.pbx_agent_runtime_ready(a.id);
 IF v_org IS NULL THEN
   RAISE EXCEPTION 'Agente indisponivel' USING errcode='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.updated_at),'[]'::jsonb)
 INTO v_jobs
 FROM (
  SELECT e.id,e.organization_id,e.number,e.endpoint_name,e.desired_enabled,e.updated_at
  FROM public.pbx_extensions e
  WHERE e.organization_id=v_org AND e.is_managed
    AND e.provisioning_status='pending'
  ORDER BY e.updated_at LIMIT 10
 ) j;
 SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.created_at),'[]'::jsonb)
 INTO v_logins
 FROM (
  SELECT r.id,r.organization_id,r.extension_id,r.public_key_base64,r.expires_at,r.created_at
  FROM public.pbx_browser_login_requests r
  WHERE r.organization_id=v_org AND r.agent_id=p_agent_id
    AND r.status='pending' AND r.expires_at>clock_timestamp()
  ORDER BY r.created_at LIMIT 10
 ) j;
 -- created_at é interno; não muda o formato antigo entregue ao agente.
 SELECT coalesce(jsonb_agg(to_jsonb(x)-'created_at'),'[]'::jsonb)
 INTO v_logins FROM jsonb_to_recordset(v_logins) AS x(
  id uuid,organization_id uuid,extension_id uuid,public_key_base64 text,
  expires_at timestamptz,created_at timestamptz
 );
 SELECT coalesce(jsonb_agg(
   (to_jsonb(q)-'members') ||
   jsonb_build_object('members',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
       'position',m.position,
       'organization_id',e.organization_id,
       'number',e.number,
       'endpoint_name',e.endpoint_name,
       'desired_enabled',e.desired_enabled,
       'provisioning_status',e.provisioning_status
      ) ORDER BY m.position)
      FROM public.pbx_queue_members m
      JOIN public.pbx_extensions e ON e.id=m.extension_id
      WHERE m.queue_id=q.id
    ),'[]'::jsonb))
    ORDER BY q.updated_at),'[]'::jsonb)
 INTO v_queues FROM (
  SELECT id,organization_id,name,test_extension,strategy,ring_seconds,
   max_wait_seconds,enabled,updated_at
  FROM public.pbx_queues
  WHERE organization_id=v_org AND provisioning_status='pending'
  ORDER BY updated_at LIMIT 10
 ) q;
 WITH
 ext AS (
  SELECT e.endpoint_name AS endpoint
  FROM public.pbx_extensions e
  WHERE e.organization_id=v_org LIMIT 1001
 ),
 tr AS (
  SELECT t.inbound_endpoint AS endpoint
  FROM public.pbx_trunks t
  WHERE v_platform AND t.organization_id=v_org AND t.agent_id=p_agent_id LIMIT 101
 ),
 tr_out AS (
  SELECT t.outbound_endpoint AS endpoint
  FROM public.pbx_trunks t
  WHERE v_platform AND t.organization_id=v_org AND t.agent_id=p_agent_id LIMIT 101
 )
 SELECT coalesce(jsonb_agg(DISTINCT endpoint),'[]'::jsonb)
 INTO v_endpoints
 FROM (SELECT endpoint FROM ext UNION ALL SELECT endpoint FROM tr UNION ALL SELECT endpoint FROM tr_out) x
 WHERE endpoint IS NOT NULL;
 IF jsonb_array_length(v_endpoints)>1200 THEN v_endpoints='[]'::jsonb; END IF;
 IF p_protocol_version IN (2,3) THEN
  v_availability=public.pbx_poll_queue_availability(p_agent_id);
 ELSE
  v_availability='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('jobs',v_jobs,'login_requests',v_logins,
 'queue_jobs',v_queues,'history_endpoints',v_endpoints,
 'availability_jobs',v_availability);
END
$function$;


REVOKE ALL ON FUNCTION public.pbx_write_queue_telemetry_v1(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pbx_write_queue_telemetry_v1(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pbx_poll_bootstrap_v1(uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pbx_poll_bootstrap_v1(uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION private.pbx_cleanup_login_requests_v1()
  FROM PUBLIC,anon,authenticated;
-- Existing public.pbx_poll_queue_availability remains service-only.

SELECT cron.schedule(
  'pbx-browser-login-expiry-maintenance',
  '*/2 * * * *',
  $$SELECT * FROM private.pbx_cleanup_login_requests_v1()$$
);
