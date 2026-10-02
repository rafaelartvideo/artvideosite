create index if not exists field_tracking_pairings_created_by_idx
  on public.field_tracking_pairings (created_by)
  where created_by is not null;

drop policy if exists field_tracking_pairings_no_direct_access on public.field_tracking_pairings;
create policy field_tracking_pairings_no_direct_access
on public.field_tracking_pairings
for all
to authenticated
using (false)
with check (false);
