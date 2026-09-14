begin;

revoke delete on table public.entity_addresses from anon;
grant delete on table public.entity_addresses to authenticated;

commit;
