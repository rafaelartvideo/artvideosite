begin;

drop policy if exists username_registry_no_client_access
  on public.username_registry;

create policy username_registry_no_client_access
on public.username_registry
for all
to anon, authenticated
using (false)
with check (false);

commit;
