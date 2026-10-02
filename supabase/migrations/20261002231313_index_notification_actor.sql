create index if not exists organization_notifications_actor_user_idx
  on public.organization_notifications (actor_user_id)
  where actor_user_id is not null;