begin; set local statement_timeout='20s';
do $test$
declare fixture record; expected jsonb; actual jsonb; cases integer := 0;
begin
 for fixture in (
   select m.user_id, o.id as organization_id
   from (select distinct user_id from public.organization_members where status='active' order by user_id limit 5) m
   cross join (select id from public.organizations order by id limit 3) o
 ) loop
   perform set_config('request.jwt.claim.sub',fixture.user_id::text,true);
   execute 'set local role authenticated';
   execute $reference$ with visible_notifications as materialized (
    select notification.*
    from public.organization_notifications notification
    where notification.organization_id = $1
      and not exists (
        select 1
        from public.organization_notification_reads hidden
        where hidden.notification_id = notification.id
          and hidden.user_id = auth.uid()
          and hidden.dismissed_at is not null
      )
  ),
  recent as (
    select notification.*
    from visible_notifications notification
    order by notification.created_at desc, notification.id desc
    limit greatest(1, least(coalesce($2, 50), 100))
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', notification.id,
          'organization_id', notification.organization_id,
          'audit_log_id', notification.audit_log_id,
          'actor_user_id', notification.actor_user_id,
          'actor_name_snapshot', notification.actor_name_snapshot,
          'module_key', notification.module_key,
          'event_type', notification.event_type,
          'entity_type', notification.entity_type,
          'entity_id', notification.entity_id,
          'title', notification.title,
          'message', notification.message,
          'route', notification.route,
          'metadata', notification.metadata,
          'created_at', notification.created_at,
          'read_at', notification_read.read_at
        )
        order by notification.created_at desc, notification.id desc
      )
      from recent notification
      left join public.organization_notification_reads notification_read
        on notification_read.notification_id = notification.id
       and notification_read.user_id = auth.uid()
    ), '[]'::jsonb),
    'unreadCount', (
      select count(*)::bigint
      from visible_notifications notification
      where not exists (
        select 1
        from public.organization_notification_reads notification_read
        where notification_read.notification_id = notification.id
          and notification_read.user_id = auth.uid()
          and notification_read.read_at is not null
      )
    )
  ) $reference$ into expected using fixture.organization_id,50;
   execute $candidate$ with current_reads as materialized (
    select notification_id, read_at, dismissed_at
    from public.organization_notification_reads
    where user_id = (select auth.uid())
  ), visible_notifications as materialized (
    select notification.*
    from public.organization_notifications notification
    where notification.organization_id = $1
      and not exists (
        select 1
        from current_reads hidden
        where hidden.notification_id = notification.id
          and hidden.dismissed_at is not null
      )
  ),
  recent as (
    select notification.*
    from visible_notifications notification
    order by notification.created_at desc, notification.id desc
    limit greatest(1, least(coalesce($2, 50), 100))
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', notification.id,
          'organization_id', notification.organization_id,
          'audit_log_id', notification.audit_log_id,
          'actor_user_id', notification.actor_user_id,
          'actor_name_snapshot', notification.actor_name_snapshot,
          'module_key', notification.module_key,
          'event_type', notification.event_type,
          'entity_type', notification.entity_type,
          'entity_id', notification.entity_id,
          'title', notification.title,
          'message', notification.message,
          'route', notification.route,
          'metadata', notification.metadata,
          'created_at', notification.created_at,
          'read_at', notification_read.read_at
        )
        order by notification.created_at desc, notification.id desc
      )
      from recent notification
      left join current_reads notification_read
        on notification_read.notification_id = notification.id
    ), '[]'::jsonb),
    'unreadCount', (
      select count(*)::bigint
      from visible_notifications notification
      where not exists (
        select 1
        from current_reads notification_read
        where notification_read.notification_id = notification.id
          and notification_read.read_at is not null
      )
    )
  ) $candidate$
   into actual using fixture.organization_id, 50;
   execute 'reset role';
   if expected->'unreadCount' is distinct from actual->'unreadCount'
 or (select jsonb_agg(v order by v->>'id') from jsonb_array_elements(expected->'items') v)
 is distinct from (select jsonb_agg(v order by v->>'id') from jsonb_array_elements(actual->'items') v)
 then raise exception 'Notification result changed in case %', cases; end if;
   cases := cases + 1;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 execute 'set local role authenticated';
 select public.load_admin_notifications_v1('00000000-0000-4000-8000-000000000001'::uuid,50) into expected;
 execute $candidate$ with current_reads as materialized (
    select notification_id, read_at, dismissed_at
    from public.organization_notification_reads
    where user_id = (select auth.uid())
  ), visible_notifications as materialized (
    select notification.*
    from public.organization_notifications notification
    where notification.organization_id = $1
      and not exists (
        select 1
        from current_reads hidden
        where hidden.notification_id = notification.id
          and hidden.dismissed_at is not null
      )
  ),
  recent as (
    select notification.*
    from visible_notifications notification
    order by notification.created_at desc, notification.id desc
    limit greatest(1, least(coalesce($2, 50), 100))
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', notification.id,
          'organization_id', notification.organization_id,
          'audit_log_id', notification.audit_log_id,
          'actor_user_id', notification.actor_user_id,
          'actor_name_snapshot', notification.actor_name_snapshot,
          'module_key', notification.module_key,
          'event_type', notification.event_type,
          'entity_type', notification.entity_type,
          'entity_id', notification.entity_id,
          'title', notification.title,
          'message', notification.message,
          'route', notification.route,
          'metadata', notification.metadata,
          'created_at', notification.created_at,
          'read_at', notification_read.read_at
        )
        order by notification.created_at desc, notification.id desc
      )
      from recent notification
      left join current_reads notification_read
        on notification_read.notification_id = notification.id
    ), '[]'::jsonb),
    'unreadCount', (
      select count(*)::bigint
      from visible_notifications notification
      where not exists (
        select 1
        from current_reads notification_read
        where notification_read.notification_id = notification.id
          and notification_read.read_at is not null
      )
    )
  ) $candidate$
 into actual using '00000000-0000-4000-8000-000000000001'::uuid,50;
 execute 'reset role';
 if expected is distinct from actual or actual <> '{"items":[],"unreadCount":0}'::jsonb then raise exception 'Unauthenticated access changed'; end if;
 perform set_config('audit.equivalence_cases', (cases+1)::text,true);
end $test$;
select current_setting('audit.equivalence_cases') as passed_equivalence_cases;
rollback;