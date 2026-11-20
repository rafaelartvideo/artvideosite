-- Estado de abertura compacto para tags SLA pausado no inbox.
-- Uma única RPC por sessão; não expõe tabela de calendário nem histórico.
BEGIN;
CREATE OR REPLACE FUNCTION private.union_wa_business_clock_read(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $body$
DECLARE v_result jsonb;v_now timestamptz:=now();
BEGIN
 IF (select auth.uid()) IS NULL OR p_org IS NULL
   OR NOT private.has_tenant_module_permission(p_org,'whatsapp','whatsapp.inbox.view')
   OR NOT private.union_whatsapp_allowed(p_org,'view_queues') THEN
   RAISE EXCEPTION 'Sem acesso aos horários do atendimento' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
   'configured',EXISTS(SELECT 1 FROM public.union_whatsapp_business_calendars
      WHERE organization_id=p_org AND superseded_at IS NULL),
   'company_open',private.union_wa_business_is_open(p_org,NULL,NULL,v_now),
   'departments',coalesce((SELECT jsonb_object_agg(d.id::text,
      private.union_wa_business_is_open(p_org,d.id,NULL,v_now))
      FROM public.union_whatsapp_departments d WHERE d.organization_id=p_org),'{}'::jsonb),
   'checked_at',v_now
 ) INTO v_result;
 RETURN v_result;
END;
$body$;
REVOKE ALL ON FUNCTION private.union_wa_business_clock_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.union_wa_business_clock_read(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.union_whatsapp_business_clock(p_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $body$
 SELECT private.union_wa_business_clock_read(p_org);
$body$;
REVOKE ALL ON FUNCTION public.union_whatsapp_business_clock(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.union_whatsapp_business_clock(uuid) TO authenticated;
COMMIT;