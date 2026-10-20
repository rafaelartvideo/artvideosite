-- Union WhatsApp | isolated inbox, separate from licensed SAC Digital.
-- No WuzAPI tokens or raw webhook payloads are exposed through public tables.
begin;

-- Dedicated tenant module; enable it only for companies that already
-- registered their own WuzAPI channel. Other tenants remain unaffected.
insert into public.system_modules(key,name,description,category,sort_order,is_active) values
 ('whatsapp','Atendimento WhatsApp','Caixa de entrada própria via WuzAPI, independente do SAC Digital.','operation',345,true)
on conflict (key) do update set name=excluded.name, description=excluded.description, is_active=true;

insert into public.organization_modules (organization_id,module_key,is_enabled)
select distinct organization_id,'whatsapp',true
from public.whatsapp_channel_connections
where provider='wuzapi'
on conflict (organization_id,module_key) do nothing;

insert into public.permissions (key,label,description,module_name,sort_order) values
 ('whatsapp.inbox.view','Visualizar conversas WhatsApp','Consultar os atendimentos da empresa pelo WhatsApp próprio.','Atendimento WhatsApp',5080),
 ('whatsapp.inbox.send','Enviar mensagens WhatsApp','Responder conversas pelo WhatsApp próprio.','Atendimento WhatsApp',5081),
 ('whatsapp.inbox.manage','Gerenciar atendimentos WhatsApp','Assumir, encaminhar e finalizar atendimentos do WhatsApp próprio.','Atendimento WhatsApp',5082)
on conflict (key) do update set label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Match established SAC permission profiles without sharing the SAC records.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id
join public.permissions target on target.key='whatsapp.inbox.view'
where source.key in ('sac_digital.messages.view','sac_digital.view','settings.channels.manage')
on conflict (role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id
join public.permissions target on target.key='whatsapp.inbox.send'
where source.key in ('sac_digital.messages.send','settings.channels.manage')
on conflict (role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id
join public.permissions target on target.key='whatsapp.inbox.manage'
where source.key in ('sac_digital.protocols.manage','settings.channels.manage')
on conflict (role_id,permission_id) do nothing;

create table if not exists public.union_whatsapp_conversations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 channel_id uuid not null references public.whatsapp_channel_connections(id) on delete cascade,
 chat_jid text not null check (char_length(chat_jid) between 5 and 160),
 contact_name text not null default '',
 contact_phone text,
 status text not null default 'waiting'
   check (status in ('waiting','in_att','abandoned','finished')),
 assigned_to uuid references auth.users(id) on delete set null,
 last_message text,
 last_message_at timestamptz,
 unread_count integer not null default 0 check (unread_count >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (channel_id,chat_jid),
 unique (id,organization_id,channel_id)
);
create index if not exists union_whatsapp_conv_recent_idx on public.union_whatsapp_conversations(organization_id,status,last_message_at desc nulls last);
create index if not exists union_whatsapp_conv_owner_idx on public.union_whatsapp_conversations(organization_id,assigned_to,status);

create table if not exists public.union_whatsapp_messages (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 channel_id uuid not null,
 conversation_id uuid not null,
 provider_message_id text not null check (char_length(provider_message_id) between 1 and 180),
 direction text not null check (direction in ('incoming','outgoing')),
 message_type text not null default 'text' check (message_type in ('text','image','video','audio','file','location','contact','unknown')),
 body_text text not null default '',
 sender_name text,
 sent_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 foreign key (conversation_id,organization_id,channel_id)
   references public.union_whatsapp_conversations(id,organization_id,channel_id) on delete cascade,
 unique (channel_id,provider_message_id)
);
create index if not exists union_whatsapp_messages_thread_idx on public.union_whatsapp_messages(conversation_id,sent_at desc);

-- SHA-256 only: raw WuzAPI user token remains on VPS.
create table if not exists public.union_whatsapp_webhook_keys (
 channel_id uuid primary key references public.whatsapp_channel_connections(id) on delete cascade,
 token_sha256 text not null check (token_sha256 ~ '^[a-f0-9]{64}$'),
 configured_at timestamptz not null default now()
);
comment on table public.union_whatsapp_webhook_keys is 'Only token digests; never raw WuzAPI tokens. Service role access only.';

alter table public.union_whatsapp_conversations enable row level security;
alter table public.union_whatsapp_messages enable row level security;
alter table public.union_whatsapp_webhook_keys enable row level security;
revoke all on public.union_whatsapp_conversations from anon,authenticated;
revoke all on public.union_whatsapp_messages from anon,authenticated;
revoke all on public.union_whatsapp_webhook_keys from anon,authenticated;

grant select on public.union_whatsapp_conversations to authenticated;
grant select on public.union_whatsapp_messages to authenticated;

create policy union_whatsapp_conversations_read on public.union_whatsapp_conversations
 for select to authenticated
 using (private.has_effective_organization_permission(organization_id,'whatsapp.inbox.view'));
create policy union_whatsapp_messages_read on public.union_whatsapp_messages
 for select to authenticated
 using (private.has_effective_organization_permission(organization_id,'whatsapp.inbox.view'));

-- Writes, including routing transitions, always occur through authorized Edge functions.
commit;
