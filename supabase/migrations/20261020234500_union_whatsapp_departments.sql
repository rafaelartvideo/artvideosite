begin;
create table if not exists public.union_whatsapp_departments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(length(btrim(name)) between 2 and 80),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id)
);
create unique index if not exists union_wa_dept_name_unique
 on public.union_whatsapp_departments (organization_id,lower(btrim(name)));
create table if not exists public.union_whatsapp_department_members (
 department_id uuid not null,
 organization_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (department_id,user_id),
 foreign key (organization_id,department_id)
  references public.union_whatsapp_departments(organization_id,id) on delete cascade
);
create index if not exists union_wa_dept_members_user
 on public.union_whatsapp_department_members(organization_id,user_id);
alter table public.union_whatsapp_conversations
 add column if not exists department_id uuid;
create index if not exists union_wa_conversation_department_idx
 on public.union_whatsapp_conversations(organization_id,department_id,status);
do $$ begin
 if not exists (select 1 from pg_constraint where conname='union_wa_conversation_department_fk') then
  alter table public.union_whatsapp_conversations
   add constraint union_wa_conversation_department_fk
    foreign key (organization_id,department_id)
    references public.union_whatsapp_departments(organization_id,id);
 end if;
end $$;
create table if not exists public.union_whatsapp_handoffs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 conversation_id uuid not null references public.union_whatsapp_conversations(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 action text not null check(action in ('assume','return_queue','finish','reopen','transfer_operator','transfer_department','start')),
 to_user_id uuid references auth.users(id),
 to_department_id uuid,
 created_at timestamptz not null default now(),
 foreign key (organization_id,to_department_id)
  references public.union_whatsapp_departments(organization_id,id)
);
create index if not exists union_wa_handoff_history
 on public.union_whatsapp_handoffs(organization_id,conversation_id,created_at desc);
alter table public.union_whatsapp_departments enable row level security;
alter table public.union_whatsapp_department_members enable row level security;
alter table public.union_whatsapp_handoffs enable row level security;
revoke all on public.union_whatsapp_departments,public.union_whatsapp_department_members,
 public.union_whatsapp_handoffs from anon,authenticated;
comment on table public.union_whatsapp_departments is
 'Union independent WhatsApp departments; only the authenticated Edge Function service role may update.';
comment on table public.union_whatsapp_handoffs is
 'Append-only union WhatsApp workflow events; no messages or secrets stored.';
commit;