-- Union World | expediente versionado por empresa, departamento ou operador.
-- Sem horários presumidos. Uma alteração futura não reescreve SLAs históricos.
BEGIN;
CREATE TABLE IF NOT EXISTS public.union_whatsapp_business_calendars (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 scope_type text NOT NULL CHECK(scope_type IN ('company','department','operator')),
 scope_id uuid,
 timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
 weekly jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(weekly)='object'),
 exceptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(exceptions)='array'),
 effective_at timestamptz NOT NULL DEFAULT now(),
 superseded_at timestamptz,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((scope_type='company' AND scope_id IS NULL) OR (scope_type<>'company' AND scope_id IS NOT NULL)),
 CHECK(superseded_at IS NULL OR superseded_at>=effective_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS union_wa_calendar_active_scope_idx
 ON public.union_whatsapp_business_calendars(organization_id,scope_type,coalesce(scope_id,'00000000-0000-0000-0000-000000000000'::uuid))
 WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS union_wa_calendar_scope_history_idx
 ON public.union_whatsapp_business_calendars(organization_id,scope_type,scope_id,effective_at DESC);
ALTER TABLE public.union_whatsapp_business_calendars ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.union_whatsapp_business_calendars FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.union_wa_calendar_validate_intervals(p_slots jsonb)
RETURNS void LANGUAGE plpgsql SET search_path TO '' AS $body$
DECLARE v_item jsonb; v_start time; v_end time; v_previous time := NULL; v_count int:=0;
BEGIN
 IF jsonb_typeof(p_slots)<>'array' OR jsonb_array_length(p_slots)>8 THEN
   RAISE EXCEPTION 'Informe no máximo oito intervalos por dia' USING ERRCODE='22023';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_slots) LOOP
   IF jsonb_typeof(v_item)<>'object'
      OR (v_item->>'start') !~ '^[0-2][0-9]:[0-5][0-9]$'
      OR (v_item->>'end') !~ '^[0-2][0-9]:[0-5][0-9]$'
      OR substring(v_item->>'start',1,2)::int>23
      OR substring(v_item->>'end',1,2)::int>23 THEN
      RAISE EXCEPTION 'Horário inválido; informe HH:MM' USING ERRCODE='22023';
   END IF;
   v_start:=(v_item->>'start')::time;
   v_end:=(v_item->>'end')::time;
   IF v_start>=v_end OR (v_previous IS NOT NULL AND v_start<v_previous) THEN
     RAISE EXCEPTION 'Intervalos sobrepostos, invertidos ou fora de ordem' USING ERRCODE='22023';
   END IF;
   v_previous:=v_end;v_count:=v_count+1;
 END LOOP;
END;
$body$;

CREATE OR REPLACE FUNCTION private.union_wa_calendar_manage(
 p_org uuid,p_action text,p_scope text DEFAULT 'company',p_scope_id uuid DEFAULT NULL,
 p_timezone text DEFAULT NULL,p_weekly jsonb DEFAULT NULL,p_exceptions jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $body$
DECLARE v_calendar jsonb; v_day int; v_exc jsonb; v_date date; v_seen date[]:='{}';
 v_now timestamptz:=clock_timestamp();v_scope text;
BEGIN
 IF (select auth.uid()) IS NULL OR p_org IS NULL
   OR NOT private.has_tenant_module_permission(p_org,'whatsapp','whatsapp.inbox.view')
   OR NOT private.union_whatsapp_allowed(p_org,'view_all') THEN
   RAISE EXCEPTION 'Sem acesso ao calendário de atendimentos' USING ERRCODE='42501';
 END IF;
 IF p_scope NOT IN ('company','department','operator')
   OR (p_scope='company' AND p_scope_id IS NOT NULL)
   OR (p_scope<>'company' AND p_scope_id IS NULL) THEN
   RAISE EXCEPTION 'Escopo inválido' USING ERRCODE='22023';
 END IF;
 IF p_action='save' THEN
   IF NOT private.has_effective_organization_permission(p_org,'settings.channels.manage') THEN
     RAISE EXCEPTION 'Sem permissão para alterar o expediente' USING ERRCODE='42501';
   END IF;
   IF p_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN
     RAISE EXCEPTION 'Fuso horário não reconhecido' USING ERRCODE='22023';
   END IF;
   IF jsonb_typeof(p_weekly)<>'object'
     OR jsonb_typeof(p_exceptions)<>'array'
     OR jsonb_array_length(p_exceptions)>200 THEN
     RAISE EXCEPTION 'Calendário inválido ou com mais de 200 exceções' USING ERRCODE='22023';
   END IF;
   FOR v_day IN 0..6 LOOP
     PERFORM private.union_wa_calendar_validate_intervals(coalesce(p_weekly->(v_day::text),'[]'::jsonb));
   END LOOP;
   FOR v_exc IN SELECT value FROM jsonb_array_elements(p_exceptions) LOOP
     IF (v_exc->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
       RAISE EXCEPTION 'Data de exceção inválida' USING ERRCODE='22023';
     END IF;
     v_date:=(v_exc->>'date')::date;
     IF v_date::text<>v_exc->>'date' OR v_date=ANY(v_seen) THEN
       RAISE EXCEPTION 'Exceção duplicada ou com data inválida' USING ERRCODE='22023';
     END IF;
     v_seen:=array_append(v_seen,v_date);
     IF jsonb_typeof(v_exc->'closed')<>'boolean' THEN
       RAISE EXCEPTION 'Informe se o dia é fechado' USING ERRCODE='22023';
     END IF;
     IF (v_exc->>'closed')='true' THEN
       IF coalesce(jsonb_array_length(coalesce(v_exc->'intervals','[]'::jsonb)),0)<>0 THEN
         RAISE EXCEPTION 'Dia fechado não pode conter horários' USING ERRCODE='22023';
       END IF;
     ELSE
       PERFORM private.union_wa_calendar_validate_intervals(coalesce(v_exc->'intervals','[]'::jsonb));
     END IF;
   END LOOP;
   IF p_scope='department' AND NOT EXISTS(
     SELECT 1 FROM public.union_whatsapp_departments WHERE id=p_scope_id AND organization_id=p_org)
   THEN RAISE EXCEPTION 'Departamento não pertence à empresa' USING ERRCODE='42501';END IF;
   IF p_scope='operator' AND NOT EXISTS(
     SELECT 1 FROM public.union_whatsapp_operator_bindings WHERE user_id=p_scope_id AND organization_id=p_org AND is_active)
   THEN RAISE EXCEPTION 'Operador não pertence à empresa' USING ERRCODE='42501';END IF;
   PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_scope||':'||coalesce(p_scope_id::text,''),0));
   UPDATE public.union_whatsapp_business_calendars
      SET superseded_at=v_now
      WHERE organization_id=p_org AND scope_type=p_scope AND scope_id IS NOT DISTINCT FROM p_scope_id AND superseded_at IS NULL;
   INSERT INTO public.union_whatsapp_business_calendars
     (organization_id,scope_type,scope_id,timezone,weekly,exceptions,effective_at,created_by)
   VALUES(p_org,p_scope,p_scope_id,p_timezone,p_weekly,p_exceptions,v_now,auth.uid());
 ELSIF p_action<>'get' THEN
   RAISE EXCEPTION 'Ação desconhecida' USING ERRCODE='22023';
 END IF;
 SELECT jsonb_build_object(
   'calendar',(SELECT to_jsonb(c) FROM public.union_whatsapp_business_calendars c
      WHERE c.organization_id=p_org AND c.scope_type=p_scope
      AND c.scope_id IS NOT DISTINCT FROM p_scope_id AND c.superseded_at IS NULL LIMIT 1),
   'departments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) ORDER BY d.name),'[]'::jsonb)
      FROM public.union_whatsapp_departments d WHERE d.organization_id=p_org),
   'operators',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.user_id,'name',coalesce(p.full_name,'Operador'))
       ORDER BY p.full_name),'[]'::jsonb)
      FROM public.union_whatsapp_operator_bindings b
      LEFT JOIN public.profiles p ON p.id=b.user_id
      WHERE b.organization_id=p_org AND b.is_active)
 ) INTO v_calendar;
 RETURN v_calendar;
END;
$body$;

REVOKE ALL ON FUNCTION private.union_wa_calendar_manage(uuid,text,text,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.union_whatsapp_business_calendar(
 p_org uuid,p_action text,p_scope text DEFAULT 'company',p_scope_id uuid DEFAULT NULL,
 p_timezone text DEFAULT NULL,p_weekly jsonb DEFAULT NULL,p_exceptions jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER STABLE SET search_path TO '' AS $body$
 SELECT private.union_wa_calendar_manage(p_org,p_action,p_scope,p_scope_id,p_timezone,p_weekly,p_exceptions);
$body$;
-- This wrapper performs a mutating SAVE: it MUST be VOLATILE, not STABLE.
ALTER FUNCTION public.union_whatsapp_business_calendar(uuid,text,text,uuid,text,jsonb,jsonb) VOLATILE;
REVOKE ALL ON FUNCTION public.union_whatsapp_business_calendar(uuid,text,text,uuid,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.union_whatsapp_business_calendar(uuid,text,text,uuid,text,jsonb,jsonb) TO authenticated;
COMMIT;