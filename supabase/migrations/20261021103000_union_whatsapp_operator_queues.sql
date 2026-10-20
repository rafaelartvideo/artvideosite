begin;

-- A dedicated operator binding is separate from the CRM employee login.
-- An unlinked operator cannot read or claim inbox conversations.
create table if not exists public.union_whatsapp_operator_bindings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists union_whatsapp_operator_bindings_user
  on public.union_whatsapp_operator_bindings(user_id, organization_id)
  where is_active = true;
alter table public.union_whatsapp_operator_bindings enable row level security;

drop policy if exists union_whatsapp_operator_bindings_read on public.union_whatsapp_operator_bindings;
create policy union_whatsapp_operator_bindings_read
on public.union_whatsapp_operator_bindings for select to authenticated
using (
  user_id = (select auth.uid())
  or private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.manage')
);
grant select on public.union_whatsapp_operator_bindings to authenticated;

-- Carry current active authorized operators forward, instead of suddenly
-- removing access to existing conversations during the upgrade.
insert into public.union_whatsapp_operator_bindings (organization_id,user_id,is_active)
select m.organization_id,m.user_id,true
from public.organization_members m
join public.profiles profile on profile.id=m.user_id and profile.is_active=true
where m.status='active' and (
  m.is_owner=true or exists (
    select 1 from public.role_permissions rp
    join public.permissions p on p.id=rp.permission_id
    where rp.role_id=m.role_id and p.key='whatsapp.inbox.send'
  )
)
on conflict (organization_id,user_id) do nothing;

-- Existing department objects also act as attendance queues.
alter table public.union_whatsapp_departments
  add column if not exists is_default boolean not null default false;
create unique index if not exists union_whatsapp_only_one_default_queue
  on public.union_whatsapp_departments(organization_id)
  where is_default = true;

-- Restricted membership lookup required for RLS: users can read only their
-- own department assignments; managers can oversee their organization.
drop policy if exists union_whatsapp_department_members_read on public.union_whatsapp_department_members;
create policy union_whatsapp_department_members_read
on public.union_whatsapp_department_members for select to authenticated
using (
  user_id = (select auth.uid())
  or private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.manage')
);
grant select on public.union_whatsapp_department_members to authenticated;

-- Do not expose colleagues' private ongoing conversations to ordinary staff.
-- Waiting queue conversations are visible only to members of that queue.
drop policy if exists union_whatsapp_conversations_read on public.union_whatsapp_conversations;
create policy union_whatsapp_conversations_read
on public.union_whatsapp_conversations for select to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.view')
  and (
    private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.manage')
    or (
      exists (
        select 1 from public.union_whatsapp_operator_bindings binding
        where binding.organization_id=union_whatsapp_conversations.organization_id
          and binding.user_id=(select auth.uid()) and binding.is_active=true
      )
      and (
        assigned_to=(select auth.uid())
        or (
          status='waiting' and assigned_to is null
          and (
            department_id is null
            or exists (
              select 1 from public.union_whatsapp_department_members dept
              where dept.organization_id=union_whatsapp_conversations.organization_id
                and dept.department_id=union_whatsapp_conversations.department_id
                and dept.user_id=(select auth.uid())
            )
          )
        )
      )
    )
  )
);
-- Message SELECT already references the conversation row under the policy above,
-- so a user cannot bypass queue/owner scope by requesting messages directly.
commit;
