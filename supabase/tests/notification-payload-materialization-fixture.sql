-- Synthetic bootstrap for notification-payload-materialization.mjs only.
-- Run exclusively inside its fresh, in-memory PGlite database.
-- Membership and permission helper implementations below are fixture stand-ins;
-- the runner imports the real notification policies/scope/relevance functions.

create role authenticated;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('fixture.uid', true),'')::uuid $$;
create table private.memberships (organization_id uuid, user_id uuid, primary key(organization_id,user_id));
create table private.permissions (organization_id uuid, user_id uuid, key text, primary key(organization_id,user_id,key));
create function private.is_organization_member(org uuid) returns boolean language sql stable as $$ select exists(select 1 from private.memberships where organization_id=org and user_id=auth.uid()) $$;
create function private.has_organization_permission(org uuid, perm text) returns boolean language sql stable as $$ select exists(select 1 from private.permissions where organization_id=org and user_id=auth.uid() and key=perm) $$;
create table public.organization_notifications (
 id bigint primary key, organization_id uuid not null, recipient_user_id uuid, audit_log_id bigint,
 actor_user_id uuid, actor_name_snapshot text, module_key text not null, event_type text not null,
 entity_type text not null, entity_id text, title text not null, message text not null, route text,
 metadata jsonb not null, visibility_permissions text[] not null default '{}', created_at timestamptz not null);
create index organization_notifications_org_date_idx on public.organization_notifications(organization_id,created_at desc);
create index organization_notifications_module_date_idx on public.organization_notifications(organization_id,module_key,created_at desc);
create table public.organization_notification_reads(notification_id bigint references public.organization_notifications(id),user_id uuid,read_at timestamptz,dismissed_at timestamptz, primary key(notification_id,user_id));
create index organization_notification_reads_user_idx on public.organization_notification_reads(user_id,read_at desc);
alter table public.organization_notifications enable row level security;
alter table public.organization_notification_reads enable row level security;
grant usage on schema auth, private to authenticated;
grant select on all tables in schema public,private to authenticated;

-- FIXTURE SEED

insert into private.memberships values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011');
insert into private.permissions select organization_id,user_id,key from private.memberships cross join unnest(array['notifications.view','notifications.orders.view','notifications.orders.receive','notifications.finance.view','notifications.personal.view']) key;
insert into public.organization_notifications
select i, case when i%19=0 then '00000000-0000-0000-0000-000000000002'::uuid else '00000000-0000-0000-0000-000000000001'::uuid end,
 case when i%7=0 then '00000000-0000-0000-0000-000000000012'::uuid when i%5=0 then '00000000-0000-0000-0000-000000000011'::uuid else null end,
 case when i%13=0 then i else null end,
 case when i%17=0 then '00000000-0000-0000-0000-000000000011'::uuid else null end,
 'Actor', case when i%3=0 then 'finance' when i%11=0 then 'customers' else 'orders' end,
 'updated','service_orders',i::text,'Title','Message','/orders',
 jsonb_build_object('payload',(select string_agg(md5((i*100+j)::text),'') from generate_series(1,32) j)),
 case when i%23=0 then array['blocked.view'] else '{}'::text[] end,
 '2026-11-18T12:00:00Z'::timestamptz + (i/3)*interval '1 second'
from generate_series(1,10000) i;
insert into public.organization_notification_reads select id,'00000000-0000-0000-0000-000000000011',case when id%2=0 then now() else null end,case when id%29=0 then now() else null end from public.organization_notifications where id%2=0 or id%29=0;
insert into public.organization_notification_reads select id,'00000000-0000-0000-0000-000000000012',now(),now() from public.organization_notifications where id%3=0;
analyze; set work_mem='1MB'; set role authenticated;
set fixture.uid='00000000-0000-0000-0000-000000000011';

