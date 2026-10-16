-- Existing OS sends could create a second local outgoing row with no
-- provider message ID. Retain it for audit but suppress its display only
-- when a real provider-confirmed outgoing row has the same protocol, text
-- and timestamp within 20 seconds. Never match incoming/customer messages.
UPDATE public.sac_digital_messages AS ghost
SET raw_metadata = COALESCE(ghost.raw_metadata, '{}'::jsonb) ||
  jsonb_build_object(
    'suppressed_legacy_order_echo', true,
    'suppressed_reason', 'confirmed_provider_duplicate'
  )
WHERE ghost.direction = 'outgoing'
  AND ghost.external_message_id IS NULL
  AND ghost.raw_metadata->>'sent_via_union' = 'true'
  AND NULLIF(ghost.raw_metadata->>'sent_from_service_order', '') IS NOT NULL
  AND ghost.raw_metadata->>'suppressed_legacy_order_echo' IS DISTINCT FROM 'true'
  AND EXISTS (
    SELECT 1 FROM public.sac_digital_messages AS provider
    WHERE provider.organization_id = ghost.organization_id
      AND provider.protocol_id = ghost.protocol_id
      AND provider.id <> ghost.id
      AND provider.direction = 'outgoing'
      AND provider.external_message_id IS NOT NULL
      AND provider.body_text IS NOT DISTINCT FROM ghost.body_text
      AND ABS(EXTRACT(EPOCH FROM provider.sent_at - ghost.sent_at)) <= 20
  );
