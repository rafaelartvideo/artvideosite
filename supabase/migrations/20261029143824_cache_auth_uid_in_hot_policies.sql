-- Cache the statement-stable identity once. All ownership, membership,
-- module and permission conditions remain unchanged; RLS stays enabled.
set lock_timeout = '3s';
set statement_timeout = '15s';

alter policy device_capture_sessions_owner_realtime_read
on public.device_capture_sessions using (created_by = (select auth.uid()));

alter policy device_capture_events_owner_realtime_read
on public.device_capture_events using (
  exists (
    select 1 from public.device_capture_sessions session
    where session.id = device_capture_events.session_id
      and session.created_by = (select auth.uid())
  )
);

alter policy work_items_insert on public.work_items
with check (
  created_by = (select auth.uid())
  and private.has_tenant_module_permission(organization_id, 'work_items', 'work_items.create')
);

alter policy order_quote_comments_add on public.service_order_quote_comments
with check (
  author_id = (select auth.uid())
  and private.is_organization_member(organization_id)
  and private.is_organization_module_enabled(organization_id, 'orders')
  and (private.has_effective_organization_permission(organization_id, 'orders.edit')
    or private.has_effective_organization_permission(organization_id, 'orders.update'))
  and private.can_view_service_order(service_order_id)
  and exists (
    select 1 from public.service_orders os
    join public.service_types st on st.id = os.service_type_id
    where os.id = service_order_quote_comments.service_order_id
      and os.organization_id = service_order_quote_comments.organization_id
      and st.organization_id = os.organization_id and st.quote_workflow_enabled
  )
);

reset lock_timeout;
reset statement_timeout;
