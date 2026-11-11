-- Fast employee schedule check: preserve RLS, add server-signed boundary timestamps.

BEGIN;
CREATE INDEX IF NOT EXISTS employee_crm_hours_enabled_org_idx
  ON public.employee_crm_access_hours (organization_id)
  WHERE enabled = true;

-- This function is evaluated by RLS frequently. The common unconfigured
-- path uses a tiny partial index and does not join entities or parse JSON.
CREATE OR REPLACE FUNCTION private.employee_crm_access_now(
  p_organization_id uuid, p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employee_crm_access_hours config
    WHERE config.organization_id = p_organization_id AND config.enabled
  ) THEN
    RETURN true;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.employee_crm_access_hours config
    JOIN public.entities entity
      ON entity.organization_id = config.organization_id AND entity.id = config.entity_id
    JOIN public.entity_roles er
      ON er.entity_id = entity.id AND er.role = 'employee' AND er.is_active
    LEFT JOIN public.entity_employee_details detail ON detail.entity_id = entity.id
    LEFT JOIN public.employees legacy
      ON legacy.id = entity.legacy_employee_id AND legacy.organization_id = entity.organization_id
    WHERE config.organization_id = p_organization_id
      AND config.enabled
      AND (detail.profile_id = p_user_id OR legacy.profile_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(config.days) day
        CROSS JOIN LATERAL jsonb_array_elements(day->'intervals') slot
        WHERE (day->>'weekday')::int =
          extract(dow FROM now() AT TIME ZONE config.timezone)::int
          AND (now() AT TIME ZONE config.timezone)::time >= (slot->>'start')::time
          AND (now() AT TIME ZONE config.timezone)::time < (slot->>'end')::time
      )
  );
END;
$function$;

-- One lightweight authenticated check at sign-in and at schedule boundaries.
-- The server returns the end of the CURRENT allowed interval for a precise
-- ten-minute warning and logout, without relying on the browser clock.
CREATE OR REPLACE FUNCTION public.check_my_employee_crm_access_hours_v2(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_member boolean := false;
  v_restricted boolean := false;
  v_allowed boolean := true;
  v_end_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode='42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members member
    JOIN public.organizations organization ON organization.id=member.organization_id
    WHERE member.organization_id=p_organization_id
      AND member.user_id=v_actor
      AND member.status='active' AND organization.status='active'
  ) INTO v_member;

  IF NOT v_member AND NOT private.can_access_organization(p_organization_id) THEN
    RETURN jsonb_build_object('allowed',false,'restricted',true,
      'timezone','America/Sao_Paulo','server_now',now(),'next_end_at',null);
  END IF;

  -- No enabled schedules anywhere in this tenant: no extra identity joins.
  IF NOT EXISTS (
    SELECT 1 FROM public.employee_crm_access_hours config
    WHERE config.organization_id=p_organization_id AND config.enabled
  ) THEN
    RETURN jsonb_build_object('allowed',true,'restricted',false,
      'timezone','America/Sao_Paulo','server_now',now(),'next_end_at',null);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.employee_crm_access_hours config
    JOIN public.entities entity
      ON entity.id=config.entity_id AND entity.organization_id=config.organization_id
    JOIN public.entity_roles er
      ON er.entity_id=entity.id AND er.role='employee' AND er.is_active
    LEFT JOIN public.entity_employee_details detail ON detail.entity_id=entity.id
    LEFT JOIN public.employees legacy
      ON legacy.id=entity.legacy_employee_id AND legacy.organization_id=entity.organization_id
    WHERE config.organization_id=p_organization_id AND config.enabled
      AND (detail.profile_id=v_actor OR legacy.profile_id=v_actor)
  ) INTO v_restricted;

  IF v_restricted THEN
    v_allowed := private.employee_crm_access_now(p_organization_id,v_actor);
    IF v_allowed THEN
      SELECT min(
        ((now() AT TIME ZONE config.timezone)::date + (slot->>'end')::time)
        AT TIME ZONE config.timezone
      )
      INTO v_end_at
      FROM public.employee_crm_access_hours config
      JOIN public.entities entity
        ON entity.id=config.entity_id AND entity.organization_id=config.organization_id
      JOIN public.entity_roles er
        ON er.entity_id=entity.id AND er.role='employee' AND er.is_active
      LEFT JOIN public.entity_employee_details detail ON detail.entity_id=entity.id
      LEFT JOIN public.employees legacy
        ON legacy.id=entity.legacy_employee_id AND legacy.organization_id=entity.organization_id
      CROSS JOIN LATERAL jsonb_array_elements(config.days) day
      CROSS JOIN LATERAL jsonb_array_elements(day->'intervals') slot
      WHERE config.organization_id=p_organization_id AND config.enabled
        AND (detail.profile_id=v_actor OR legacy.profile_id=v_actor)
        AND (day->>'weekday')::int = extract(dow FROM now() AT TIME ZONE config.timezone)::int
        AND (now() AT TIME ZONE config.timezone)::time >= (slot->>'start')::time
        AND (now() AT TIME ZONE config.timezone)::time < (slot->>'end')::time;
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed',v_allowed,'restricted',v_restricted,
    'timezone','America/Sao_Paulo','server_now',now(),'next_end_at',v_end_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.check_my_employee_crm_access_hours_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_my_employee_crm_access_hours_v2(uuid) TO authenticated;
COMMIT;
