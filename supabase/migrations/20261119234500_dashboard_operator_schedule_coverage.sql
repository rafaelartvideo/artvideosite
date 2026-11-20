-- Métrica Em escala só é exibida quando o operador realmente possui escala pessoal vigente.
-- Sem escala própria, não apresentar horário corporativo como se fosse individual.
BEGIN;
CREATE OR REPLACE FUNCTION private.load_dashboard_attendances_internal_v1(
  p_organization_id uuid, p_period_days integer DEFAULT 30
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_start timestamptz;
  v_threshold integer;
  v_unanswered_limit integer;
  v_timezone text;
  v_output jsonb;
BEGIN
  IF (select auth.uid()) IS NULL OR p_organization_id IS NULL
     OR NOT private.has_tenant_module_permission(p_organization_id,'whatsapp','whatsapp.inbox.view')
     OR NOT private.has_tenant_module_permission(p_organization_id,'whatsapp','whatsapp.inbox.manage')
     OR NOT private.union_whatsapp_allowed(p_organization_id,'view_all') THEN
    RAISE EXCEPTION 'Sem permissão para analisar atendimentos' USING ERRCODE='42501';
  END IF;

  SELECT c.timezone INTO v_timezone FROM public.union_whatsapp_business_calendars c
  WHERE c.organization_id=p_organization_id AND c.scope_type='company' AND c.superseded_at IS NULL LIMIT 1;
  v_timezone:=coalesce(v_timezone,'America/Sao_Paulo');
  v_start := ((date_trunc('day', now() AT TIME ZONE v_timezone)
                - make_interval(days=>greatest(1,least(coalesce(p_period_days,30),365))-1))
                AT TIME ZONE v_timezone);
  SELECT greatest(1,coalesce(q.critical_minutes,15)),
    greatest(1,least(coalesce(q.unanswered_priority_minutes,15),1440))
    INTO v_threshold,v_unanswered_limit
  FROM public.union_whatsapp_queue_settings q
  WHERE q.organization_id=p_organization_id;
  v_threshold:=coalesce(v_threshold,15);
  v_unanswered_limit:=coalesce(v_unanswered_limit,15);

  WITH current_conversations AS MATERIALIZED (
    SELECT c.id,c.status,c.contact_name,c.contact_phone,c.assigned_to,c.department_id,
      c.account_phone,c.last_message_at,c.awaiting_reply_since,c.queue_entered_at,
      c.forwarded_at,c.unread_count,c.last_protocol_number
    FROM public.union_whatsapp_conversations c
    WHERE c.organization_id=p_organization_id
  ), period_protocols AS MATERIALIZED (
    SELECT p.id,p.conversation_id,p.protocol_number,p.status,p.assigned_to,p.department_id,
      p.opened_at,p.closed_at,p.first_reply_at
    FROM public.union_whatsapp_protocols p
    WHERE p.organization_id=p_organization_id AND p.opened_at>=v_start
      AND p.opened_at<=now()
  ), closed_protocols AS MATERIALIZED (
    SELECT p.id,p.conversation_id,p.status,p.assigned_to,p.opened_at,p.closed_at
    FROM public.union_whatsapp_protocols p
    WHERE p.organization_id=p_organization_id AND p.status='finished'
      AND p.closed_at>=v_start AND p.closed_at<=now()
  ), customer_starts AS MATERIALIZED (
    SELECT p.id,
      (SELECT m.sent_at FROM public.union_whatsapp_messages m
       WHERE m.protocol_id=p.id AND m.direction='incoming' AND m.sent_at<=now()
       ORDER BY m.sent_at ASC,m.id ASC LIMIT 1) AS customer_first_at
    FROM period_protocols p
  ), human_replies AS MATERIALIZED (
    SELECT a.id,a.customer_first_at,m.sent_at AS human_first_at,m.sender_user_id AS human_author_id
    FROM customer_starts a
    LEFT JOIN LATERAL (
      SELECT m.sent_at,m.sender_user_id FROM public.union_whatsapp_messages m
      WHERE m.protocol_id=a.id AND m.direction='outgoing' AND m.origin='union'
        AND m.sent_at>=a.customer_first_at
      ORDER BY m.sent_at ASC,m.id ASC LIMIT 1
    ) m ON a.customer_first_at IS NOT NULL
  ), period_answers AS MATERIALIZED (
    SELECT p.*,h.customer_first_at,h.human_first_at,h.human_author_id,
      CASE WHEN h.customer_first_at IS NOT NULL AND h.human_first_at IS NOT NULL
         THEN round((extract(epoch FROM (h.human_first_at-h.customer_first_at))/60)::numeric,2)
      END AS first_reply_minutes,
      CASE WHEN h.customer_first_at IS NOT NULL AND h.human_first_at IS NOT NULL
         THEN private.union_wa_business_minutes(p_organization_id,p.department_id,NULL,
                 h.customer_first_at,h.human_first_at)
      END AS useful_first_reply_minutes,
      CASE WHEN h.customer_first_at IS NOT NULL AND h.human_first_at IS NOT NULL
         AND h.human_author_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.union_whatsapp_business_calendars cal
           WHERE cal.organization_id=p_organization_id AND cal.scope_type='operator'
             AND cal.scope_id=h.human_author_id AND cal.effective_at<=h.customer_first_at
             AND (cal.superseded_at IS NULL OR cal.superseded_at>=h.human_first_at))
         THEN private.union_wa_business_minutes(p_organization_id,p.department_id,h.human_author_id,
                 h.customer_first_at,h.human_first_at)
      END AS useful_first_reply_operator_minutes,
      CASE WHEN p.closed_at>=p.opened_at THEN
        round((extract(epoch FROM (p.closed_at-p.opened_at))/60)::numeric,2)
      END AS handling_minutes
    FROM period_protocols p LEFT JOIN human_replies h ON h.id=p.id
  ), current_stats AS (
    SELECT count(*) FILTER (WHERE status='in_att') AS active,
      count(*) FILTER (WHERE status='waiting') AS waiting,
      count(*) FILTER (WHERE status='finished') AS closed_total,
      count(*) FILTER (WHERE unread_count>0) AS unread,
      count(*) FILTER (WHERE status='in_att' AND awaiting_reply_since IS NOT NULL
        AND forwarded_at IS NULL AND awaiting_reply_since<=now()-make_interval(mins=>v_unanswered_limit)) AS unanswered,
      count(*) FILTER (WHERE status='in_att' AND forwarded_at IS NOT NULL) AS forwarded
    FROM current_conversations
  ), period_stats AS (
    SELECT count(*) AS opened,
      count(*) FILTER (WHERE status='finished' AND closed_at>=v_start) AS finished,
      round(avg(useful_first_reply_minutes) FILTER (WHERE useful_first_reply_minutes IS NOT NULL),1) AS avg_first_reply_minutes,
      round(avg(first_reply_minutes) FILTER (WHERE first_reply_minutes IS NOT NULL),1) AS avg_first_reply_elapsed_minutes,
      round(avg(handling_minutes) FILTER (WHERE handling_minutes IS NOT NULL),1) AS avg_handle_minutes,
      count(*) FILTER (WHERE useful_first_reply_minutes IS NOT NULL) AS valid_first_replies,
      count(*) FILTER (WHERE useful_first_reply_minutes BETWEEN 0 AND v_threshold) AS within_sla,
      count(*) FILTER (WHERE first_reply_minutes IS NOT NULL AND useful_first_reply_minutes IS NULL) AS pending_calendar,
      count(*) FILTER (WHERE first_reply_at<opened_at) AS invalid_reply_times,
      count(*) FILTER (WHERE customer_first_at IS NOT NULL AND private.union_wa_business_minutes(
           p_organization_id,department_id,NULL,customer_first_at,customer_first_at+interval '1 minute')=0)
           AS received_outside_hours
    FROM period_answers
  ), operator_ids AS (
    SELECT DISTINCT assigned_to AS id FROM period_protocols WHERE assigned_to IS NOT NULL
    UNION
    SELECT DISTINCT assigned_to AS id FROM current_conversations
      WHERE status='in_att' AND assigned_to IS NOT NULL
    UNION
    SELECT DISTINCT assigned_to AS id FROM closed_protocols WHERE assigned_to IS NOT NULL
    UNION
    SELECT DISTINCT human_author_id AS id FROM period_answers WHERE human_author_id IS NOT NULL
  ), operator_data AS (
    SELECT oi.id,coalesce(nullif(btrim(p.full_name),''),'Operador') AS name,
      (SELECT count(*) FROM current_conversations c WHERE c.status='in_att' AND c.assigned_to=oi.id) AS active,
      (SELECT count(*) FROM period_answers a WHERE a.assigned_to=oi.id) AS opened,
      (SELECT count(*) FROM closed_protocols a WHERE a.assigned_to=oi.id) AS finished,
      (SELECT round(avg(a.useful_first_reply_minutes),1) FROM period_answers a
        WHERE a.human_author_id=oi.id AND a.useful_first_reply_minutes IS NOT NULL) AS avg_first_reply_minutes,
      (SELECT round(avg(a.first_reply_minutes),1) FROM period_answers a
        WHERE a.human_author_id=oi.id AND a.first_reply_minutes IS NOT NULL) AS avg_first_reply_elapsed_minutes,
      (SELECT round(avg(a.useful_first_reply_operator_minutes),1) FROM period_answers a
        WHERE a.human_author_id=oi.id AND a.useful_first_reply_operator_minutes IS NOT NULL)
        AS avg_personal_schedule_minutes,
      (SELECT count(*) FROM period_answers a WHERE a.human_author_id=oi.id
        AND a.useful_first_reply_minutes IS NOT NULL) AS answered,
      (SELECT count(*) FROM period_answers a WHERE a.human_author_id=oi.id
        AND a.useful_first_reply_minutes BETWEEN 0 AND v_threshold) AS within_sla
    FROM operator_ids oi LEFT JOIN public.profiles p ON p.id=oi.id
  ), trend_opened AS (
    SELECT (opened_at AT TIME ZONE v_timezone)::date AS day,count(*) AS qty
    FROM period_protocols GROUP BY 1
  ), trend_closed AS (
    SELECT (closed_at AT TIME ZONE v_timezone)::date AS day,count(*) AS qty
    FROM closed_protocols GROUP BY 1
  ), timeline AS (
    SELECT coalesce(a.day,b.day) AS day,coalesce(a.qty,0) AS opened,coalesce(b.qty,0) AS finished
    FROM trend_opened a FULL OUTER JOIN trend_closed b ON b.day=a.day
  ), departments AS (
    SELECT coalesce(d.name,'Sem departamento') AS name,count(*) AS total
    FROM period_protocols p
    LEFT JOIN public.union_whatsapp_departments d ON d.id=p.department_id
      AND d.organization_id=p_organization_id
    GROUP BY 1
  ), transfer_counts AS (
    SELECT count(*) FILTER (WHERE h.action LIKE 'transfer_%') AS transfers,
      count(*) FILTER (WHERE h.action='reopen') AS reopened
    FROM public.union_whatsapp_handoffs h
    WHERE h.organization_id=p_organization_id AND h.created_at>=v_start
  )
  SELECT jsonb_build_object(
    'threshold_minutes',v_threshold,'unanswered_after_minutes',v_unanswered_limit,
    'calendar_configured', EXISTS(SELECT 1 FROM public.union_whatsapp_business_calendars
       WHERE organization_id=p_organization_id AND scope_type IN ('company','department')
         AND superseded_at IS NULL),
    'company_calendar_configured', EXISTS(SELECT 1 FROM public.union_whatsapp_business_calendars
       WHERE organization_id=p_organization_id AND scope_type='company' AND superseded_at IS NULL),
    'metrics',(SELECT jsonb_build_object(
      'active',coalesce(cs.active,0),'waiting',coalesce(cs.waiting,0),
      'closed_total',coalesce(cs.closed_total,0),
      'unread',coalesce(cs.unread,0),'unanswered',coalesce(cs.unanswered,0),
      'forwarded',coalesce(cs.forwarded,0),'opened',coalesce(ps.opened,0),
      'finished',(SELECT count(*) FROM closed_protocols),
      'avg_first_reply_minutes',ps.avg_first_reply_minutes,
      'avg_first_reply_elapsed_minutes',ps.avg_first_reply_elapsed_minutes,
      'avg_handle_minutes',(SELECT round(avg(extract(epoch FROM (closed_at-opened_at))/60.0),1)
        FROM closed_protocols WHERE closed_at>=opened_at),
      'avg_handle_useful_minutes',(SELECT round(avg(
        private.union_wa_business_minutes(p_organization_id,p.department_id,NULL,d.opened_at,d.closed_at)),1)
        FROM closed_protocols d JOIN public.union_whatsapp_protocols p ON p.id=d.id
        WHERE d.closed_at>=d.opened_at),
      'sla_valid',ps.valid_first_replies,'sla_met',ps.within_sla,
      'queue_avg_elapsed_minutes',(SELECT round(avg(extract(epoch FROM (now()-c.queue_entered_at))/60.0),1)
        FROM current_conversations c WHERE c.status='waiting' AND c.queue_entered_at IS NOT NULL),
      'queue_avg_useful_minutes',(SELECT round(avg(private.union_wa_business_minutes(
        p_organization_id,c.department_id,NULL,c.queue_entered_at,now())),1)
        FROM current_conversations c WHERE c.status='waiting' AND c.queue_entered_at IS NOT NULL),
      'queue_overdue_useful',(SELECT count(*) FROM current_conversations c
        WHERE c.status='waiting' AND c.queue_entered_at IS NOT NULL
          AND private.union_wa_business_minutes(p_organization_id,c.department_id,NULL,c.queue_entered_at,now())
            >=v_threshold),
      'pending_reply_avg_useful_minutes',(SELECT round(avg(private.union_wa_business_minutes(
        p_organization_id,c.department_id,NULL,c.awaiting_reply_since,now())),1)
        FROM current_conversations c WHERE c.status='in_att' AND c.awaiting_reply_since IS NOT NULL
          AND c.forwarded_at IS NULL),
      'pending_reply_avg_elapsed_minutes',(SELECT round(avg(extract(epoch FROM (now()-c.awaiting_reply_since))/60.0),1)
        FROM current_conversations c WHERE c.status='in_att' AND c.awaiting_reply_since IS NOT NULL
          AND c.forwarded_at IS NULL),
      'unscored_without_calendar',ps.pending_calendar,'received_outside_hours',ps.received_outside_hours,
      'invalid_reply_times',ps.invalid_reply_times,
      'transfers',tc.transfers,'reopened',tc.reopened)
      FROM current_stats cs CROSS JOIN period_stats ps CROSS JOIN transfer_counts tc),
    'trend',coalesce((SELECT jsonb_agg(jsonb_build_object('day',day::text,'opened',opened,'finished',finished)
      ORDER BY day) FROM timeline),'[]'::jsonb),
    'operators',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'active',active,'opened',opened,'finished',finished,
      'avg_first_reply_minutes',avg_first_reply_minutes,
      'avg_first_reply_elapsed_minutes',avg_first_reply_elapsed_minutes,
      'avg_personal_schedule_minutes',avg_personal_schedule_minutes,
      'answered',answered,'within_sla',within_sla)
      ORDER BY active DESC,opened DESC,name) FROM operator_data),'[]'::jsonb),
    'departments',coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'total',total)
      ORDER BY total DESC,name) FROM departments),'[]'::jsonb),
    'hours',coalesce((SELECT jsonb_agg(jsonb_build_object('hour',h.hour_of_day,'total',h.total) ORDER BY h.hour_of_day)
      FROM (SELECT extract(hour from opened_at AT TIME ZONE v_timezone)::integer AS hour_of_day,
          count(*) AS total FROM period_protocols GROUP BY 1) h),'[]'::jsonb),
    'recurrent_contacts',(SELECT count(*) FROM
       (SELECT distinct p.conversation_id FROM period_protocols p
          WHERE EXISTS(SELECT 1 FROM public.union_whatsapp_protocols old
           WHERE old.conversation_id=p.conversation_id AND old.status='finished' AND old.closed_at<p.opened_at)) rep),
    'unanswered_overdue_sla',(SELECT count(*) FROM current_conversations c
      WHERE c.status='in_att' AND c.awaiting_reply_since IS NOT NULL AND c.forwarded_at IS NULL
        AND private.union_wa_business_minutes(p_organization_id,c.department_id,NULL,c.awaiting_reply_since,now())
          >=v_unanswered_limit),
    'attention',coalesce((SELECT jsonb_agg(to_jsonb(att) ORDER BY att.waiting_since ASC)
      FROM (SELECT c.id AS conversation_id,c.contact_name,c.contact_phone,
              c.last_protocol_number,c.status,
              coalesce(c.awaiting_reply_since,c.queue_entered_at,c.last_message_at) AS waiting_since,
              private.union_wa_business_minutes(p_organization_id,c.department_id,NULL,
                coalesce(c.awaiting_reply_since,c.queue_entered_at,c.last_message_at),now()) AS waiting_useful_minutes,
              private.union_wa_business_is_open(p_organization_id,c.department_id,NULL,now()) AS business_open_now,
              coalesce(pr.full_name,'Não atribuído') AS operator_name,
              coalesce(d.name,'Sem departamento') AS department_name
            FROM current_conversations c
            LEFT JOIN public.profiles pr ON pr.id=c.assigned_to
            LEFT JOIN public.union_whatsapp_departments d
              ON d.id=c.department_id AND d.organization_id=p_organization_id
            WHERE c.status='waiting' OR (c.status='in_att'
              AND c.awaiting_reply_since<=now()-make_interval(mins=>v_unanswered_limit)
              AND c.forwarded_at IS NULL)
            ORDER BY coalesce(c.awaiting_reply_since,c.queue_entered_at,c.last_message_at) ASC NULLS LAST
            LIMIT 12) att),'[]'::jsonb)
  ) INTO v_output;
  RETURN v_output;
END;
$function$;

COMMIT;