create index if not exists organization_audit_logs_actor_user_idx
  on public.organization_audit_logs (actor_user_id)
  where actor_user_id is not null;
