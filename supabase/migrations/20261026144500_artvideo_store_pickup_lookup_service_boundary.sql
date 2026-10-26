-- Service-only Data API wrapper uses its owner's private-schema privileges.
-- No USAGE grant on the rest of the private schema is needed.
begin;
alter function public.artvideo_store_pickup_lookup_v1(bigint,text,text,text)
  security definer;
revoke all on function public.artvideo_store_pickup_lookup_v1(bigint,text,text,text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_pickup_lookup_v1(bigint,text,text,text)
  to service_role;
commit;
