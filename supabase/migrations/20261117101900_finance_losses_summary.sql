-- Contadores agregados no banco; evita carregar todas as perdas no navegador.
CREATE OR REPLACE FUNCTION public.get_financial_losses_summary_v1(
  p_organization_id uuid,p_from timestamptz DEFAULT NULL,p_until timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT jsonb_build_object(
  'events',count(*),
  'potential',coalesce(sum(amount) FILTER(WHERE status='pending_return'),0),
  'confirmed',coalesce(sum(amount) FILTER(WHERE status='confirmed'),0),
  'recovered',coalesce(sum(amount) FILTER(WHERE status='recovered'),0),
  'pending_count',count(*) FILTER(WHERE status='pending_return'),
  'confirmed_count',count(*) FILTER(WHERE status='confirmed')
 )
 FROM public.financial_losses
 WHERE organization_id=p_organization_id
   AND (p_from IS NULL OR occurred_at >= p_from)
   AND (p_until IS NULL OR occurred_at < p_until);
$function$;
REVOKE ALL ON FUNCTION public.get_financial_losses_summary_v1(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_financial_losses_summary_v1(uuid,timestamptz,timestamptz) TO authenticated;