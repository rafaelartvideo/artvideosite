create policy marketplace_buyers_union_read on public.marketplace_buyers for select to authenticated using (private.has_platform_permission('platform.marketplace.manage'));
