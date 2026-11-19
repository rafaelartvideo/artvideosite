-- Retroatividade opcional: exige declaração do gestor de que aquela escala
-- já vigorava na data informada. Só permitida na PRIMEIRA versão do calendário.
-- Não reescreve mensagens, protocolos ou auditorias.
BEGIN;
ALTER TABLE public.union_whatsapp_business_calendars
 ADD COLUMN IF NOT EXISTS retrospective_effective_date date,
 ADD COLUMN IF NOT EXISTS retrospective_confirmed_by uuid,
 ADD COLUMN IF NOT EXISTS retrospective_confirmed_at timestamptz,
 ADD COLUMN IF NOT EXISTS retrospective_note text;

CREATE OR REPLACE FUNCTION private.union_wa_calendar_backdate_internal(
 p_org uuid,p_scope text,p_scope_id uuid,p_date date,p_note text,p_confirmed boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $body$
DECLARE v_calendar public.union_whatsapp_business_calendars%ROWTYPE;
 v_new_effective timestamptz;v_count integer;
BEGIN
 IF (select auth.uid()) IS NULL OR p_org IS NULL
   OR NOT private.has_tenant_module_permission(p_org,'whatsapp','whatsapp.inbox.view')
   OR NOT private.union_whatsapp_allowed(p_org,'view_all')
   OR NOT private.has_effective_organization_permission(p_org,'settings.channels.manage') THEN
   RAISE EXCEPTION 'Sem permissão para ajustar o histórico' USING ERRCODE='42501';
 END IF;
 IF p_confirmed IS DISTINCT FROM true OR p_date IS NULL
   OR p_date > current_date OR p_date < current_date-365
   OR length(trim(coalesce(p_note,'')))<8 THEN
   RAISE EXCEPTION 'Confirme o horário anterior com data e justificativa' USING ERRCODE='22023';
 END IF;
 IF p_scope NOT IN ('company','department','operator')
   OR (p_scope='company' AND p_scope_id IS NOT NULL)
   OR (p_scope<>'company' AND p_scope_id IS NULL) THEN
   RAISE EXCEPTION 'Escopo inválido' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_scope||':'||coalesce(p_scope_id::text,''),0));
 SELECT count(*) INTO v_count FROM public.union_whatsapp_business_calendars c
  WHERE c.organization_id=p_org AND c.scope_type=p_scope AND c.scope_id IS NOT DISTINCT FROM p_scope_id;
 IF v_count<>1 THEN
   RAISE EXCEPTION 'A data retroativa só pode ser informada na primeira versão do horário' USING ERRCODE='22023';
 END IF;
 SELECT c.* INTO v_calendar FROM public.union_whatsapp_business_calendars c
 WHERE c.organization_id=p_org AND c.scope_type=p_scope
   AND c.scope_id IS NOT DISTINCT FROM p_scope_id
   AND c.superseded_at IS NULL FOR UPDATE;
 IF NOT FOUND OR v_calendar.retrospective_effective_date IS NOT NULL THEN
   RAISE EXCEPTION 'Este calendário já possui histórico confirmado' USING ERRCODE='22023';
 END IF;
 v_new_effective:=(p_date::timestamp AT TIME ZONE v_calendar.timezone);
 IF v_new_effective>=v_calendar.effective_at THEN
   RAISE EXCEPTION 'A data deve ser anterior à configuração inicial' USING ERRCODE='22023';
 END IF;
 UPDATE public.union_whatsapp_business_calendars SET
   effective_at=v_new_effective,
   retrospective_effective_date=p_date,
   retrospective_confirmed_by=auth.uid(),
   retrospective_confirmed_at=clock_timestamp(),
   retrospective_note=left(trim(p_note),500)
 WHERE id=v_calendar.id;
 RETURN jsonb_build_object('effective_at',v_new_effective,'scope_type',p_scope,
    'effective_date',p_date,'confirmed',true);
END;
$body$;
REVOKE ALL ON FUNCTION private.union_wa_calendar_backdate_internal(uuid,text,uuid,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.union_wa_calendar_backdate_internal(uuid,text,uuid,date,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.union_whatsapp_business_calendar_backdate(
 p_org uuid,p_scope text,p_scope_id uuid,p_date date,p_note text,p_confirmed boolean
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path TO '' AS $body$
 SELECT private.union_wa_calendar_backdate_internal(p_org,p_scope,p_scope_id,p_date,p_note,p_confirmed);
$body$;
REVOKE ALL ON FUNCTION public.union_whatsapp_business_calendar_backdate(uuid,text,uuid,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.union_whatsapp_business_calendar_backdate(uuid,text,uuid,date,text,boolean) TO authenticated;
COMMIT;