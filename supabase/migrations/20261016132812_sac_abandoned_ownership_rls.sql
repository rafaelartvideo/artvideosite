-- Operators may read the shared unassigned waiting queue, but an
-- explicitly abandoned conversation belongs only to its SAC Operator.
-- Managers retain organization-wide read access. Message RLS continues
-- to inherit visibility from the parent protocol.
ALTER POLICY sac_digital_protocols_select
ON public.sac_digital_protocols
USING (
  organization_id = ANY ((SELECT private.sac_digital_readable_organizations())::uuid[])
  AND (
    jsonb_extract_path_text((SELECT private.sac_digital_access_map()), organization_id::text, 'mode') = 'manager'
    OR (
      jsonb_extract_path_text((SELECT private.sac_digital_access_map()), organization_id::text, 'mode') = 'operator'
      AND (
        operator_id = jsonb_extract_path_text((SELECT private.sac_digital_access_map()), organization_id::text, 'operator_id')
        OR (
          operator_id IS NULL
          AND closed_at IS NULL
          AND status IN ('inbox', 'in_att')
          AND NULLIF(BTRIM(COALESCE(raw_metadata #>> '{api_info,abandoned_at}', '')), '') IS NULL
        )
      )
    )
  )
);
