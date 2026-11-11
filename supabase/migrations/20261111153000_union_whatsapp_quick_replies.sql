begin;

-- Reusable, tenant-scoped canned messages for the Union WhatsApp composer.
-- Never expose one organization's replies to another.
create table if not exists public.union_whatsapp_quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 70),
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  sort_order integer not null default 0 check (sort_order between 0 and 1000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists union_whatsapp_quick_replies_org_order_idx
  on public.union_whatsapp_quick_replies (organization_id, is_active, sort_order, title);
alter table public.union_whatsapp_quick_replies enable row level security;
revoke all on public.union_whatsapp_quick_replies from anon, public;
grant select, insert, update, delete on public.union_whatsapp_quick_replies to authenticated;

drop policy if exists union_whatsapp_quick_replies_read on public.union_whatsapp_quick_replies;
create policy union_whatsapp_quick_replies_read
  on public.union_whatsapp_quick_replies for select to authenticated
  using (
    private.has_effective_organization_permission(organization_id,'settings.channels.view')
    or private.has_effective_organization_permission(organization_id,'settings.channels.manage')
    or (
      private.has_effective_organization_permission(organization_id,'whatsapp.inbox.view')
      and exists (
        select 1 from public.union_whatsapp_operator_bindings binding
        where binding.organization_id=union_whatsapp_quick_replies.organization_id
          and binding.user_id=(select auth.uid()) and binding.is_active
      )
    )
  );

drop policy if exists union_whatsapp_quick_replies_insert on public.union_whatsapp_quick_replies;
create policy union_whatsapp_quick_replies_insert
  on public.union_whatsapp_quick_replies for insert to authenticated
  with check (private.has_effective_organization_permission(organization_id,'settings.channels.manage'));

drop policy if exists union_whatsapp_quick_replies_update on public.union_whatsapp_quick_replies;
create policy union_whatsapp_quick_replies_update
  on public.union_whatsapp_quick_replies for update to authenticated
  using (private.has_effective_organization_permission(organization_id,'settings.channels.manage'))
  with check (private.has_effective_organization_permission(organization_id,'settings.channels.manage'));

drop policy if exists union_whatsapp_quick_replies_delete on public.union_whatsapp_quick_replies;
create policy union_whatsapp_quick_replies_delete
  on public.union_whatsapp_quick_replies for delete to authenticated
  using (private.has_effective_organization_permission(organization_id,'settings.channels.manage'));

commit;
