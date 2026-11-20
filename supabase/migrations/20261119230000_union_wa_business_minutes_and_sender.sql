-- Cálculo do tempo comercial por dia no fuso do calendário.
-- Não há fallback para 24x7: histórico sem versão válida retorna NULL.
BEGIN;
CREATE OR REPLACE FUNCTION private.union_wa_business_minutes(
 p_org uuid,p_department uuid,p_operator uuid,p_start timestamptz,p_end timestamptz
) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $body$
DECLARE
 c public.union_whatsapp_business_calendars%ROWTYPE;
 v_day date;v_exc jsonb;v_slots jsonb;v_slot jsonb;
 v_from timestamptz;v_to timestamptz;v_minutes numeric:=0;
BEGIN
 IF p_org IS NULL OR p_start IS NULL OR p_end IS NULL OR p_start>p_end
    OR p_end-p_start>interval '370 days' THEN RETURN NULL;END IF;
 SELECT cal.* INTO c FROM public.union_whatsapp_business_calendars cal
 WHERE cal.organization_id=p_org AND cal.effective_at<=p_start
   AND (cal.superseded_at IS NULL OR cal.superseded_at>=p_end)
   AND (
     (p_operator IS NOT NULL AND cal.scope_type='operator' AND cal.scope_id=p_operator)
     OR (p_department IS NOT NULL AND cal.scope_type='department' AND cal.scope_id=p_department)
     OR cal.scope_type='company'
   )
 ORDER BY CASE cal.scope_type WHEN 'operator' THEN 3 WHEN 'department' THEN 2 ELSE 1 END DESC,
          cal.effective_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 FOR v_day IN
   SELECT d::date FROM pg_catalog.generate_series(
      (p_start AT TIME ZONE c.timezone)::date,
      (p_end AT TIME ZONE c.timezone)::date,
      interval '1 day') AS d
 LOOP
   v_exc:=NULL;
   SELECT e.value INTO v_exc FROM jsonb_array_elements(c.exceptions) AS e(value)
     WHERE e.value->>'date'=v_day::text LIMIT 1;
   IF v_exc IS NOT NULL THEN
     v_slots:=CASE WHEN v_exc->>'closed'='true' THEN '[]'::jsonb
       ELSE coalesce(v_exc->'intervals','[]'::jsonb) END;
   ELSE
     v_slots:=coalesce(c.weekly->(extract(dow FROM v_day)::int::text),'[]'::jsonb);
   END IF;
   FOR v_slot IN SELECT value FROM jsonb_array_elements(v_slots) LOOP
     v_from:=(v_day + (v_slot->>'start')::time) AT TIME ZONE c.timezone;
     v_to:=(v_day + (v_slot->>'end')::time) AT TIME ZONE c.timezone;
     IF least(v_to,p_end)>greatest(v_from,p_start) THEN
       v_minutes:=v_minutes + extract(epoch FROM (least(v_to,p_end)-greatest(v_from,p_start)))/60.0;
     END IF;
   END LOOP;
 END LOOP;
 RETURN round(v_minutes,2);
END;
$body$;

CREATE OR REPLACE FUNCTION private.union_wa_business_is_open(
 p_org uuid,p_department uuid,p_operator uuid,p_now timestamptz
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $body$
 SELECT CASE WHEN private.union_wa_business_minutes(p_org,p_department,p_operator,p_now,p_now+interval '1 minute') IS NULL
   THEN NULL
   ELSE private.union_wa_business_minutes(p_org,p_department,p_operator,p_now,p_now+interval '1 minute')>0
 END;
$body$;
REVOKE ALL ON FUNCTION private.union_wa_business_minutes(uuid,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.union_wa_business_is_open(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS union_wa_messages_protocol_direction_time_idx
 ON public.union_whatsapp_messages(protocol_id,direction,sent_at,id)
 WHERE protocol_id IS NOT NULL;
ALTER TABLE public.union_whatsapp_messages ADD COLUMN IF NOT EXISTS sender_user_id uuid
 REFERENCES auth.users(id) ON DELETE SET NULL;
COMMIT;