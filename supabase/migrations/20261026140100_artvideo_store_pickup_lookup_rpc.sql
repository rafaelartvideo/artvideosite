-- Public Data API entrypoint restricted to service_role; validation remains in private schema.
begin;
create or replace function public.artvideo_store_pickup_lookup_v1(
  p_order_number bigint, p_email text, p_code text, p_rate_key text
) returns uuid
language sql security invoker set search_path=''
as $fn$
  select private.artvideo_store_pickup_lookup_v1(p_order_number,p_email,p_code,p_rate_key);
$fn$;
revoke all on function public.artvideo_store_pickup_lookup_v1(bigint,text,text,text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_pickup_lookup_v1(bigint,text,text,text) to service_role;
commit;
