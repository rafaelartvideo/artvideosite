begin;

drop policy if exists platform_announcements_rpc_only on public.platform_announcements;
create policy platform_announcements_rpc_only
on public.platform_announcements
for all to authenticated
using (false)
with check (false);

drop policy if exists platform_announcement_targets_rpc_only on public.platform_announcement_targets;
create policy platform_announcement_targets_rpc_only
on public.platform_announcement_targets
for all to authenticated
using (false)
with check (false);

drop policy if exists platform_announcement_reads_rpc_only on public.platform_announcement_reads;
create policy platform_announcement_reads_rpc_only
on public.platform_announcement_reads
for all to authenticated
using (false)
with check (false);

commit;
