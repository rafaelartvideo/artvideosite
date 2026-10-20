-- Union World | WhatsApp channels: organization-scoped metadata only.
-- WuzAPI admin/user tokens are never stored in public tables.
begin;

insert into public.permissions (key, label, description, module_name, sort_order) values
 ('settings.channels.view', 'Visualizar canais de atendimento', 'Consulta os canais WhatsApp da empresa.', 'Canais de Atendimento', 5060),
 ('settings.channels.manage', 'Gerenciar canais de atendimento', 'Autoriza cadastrar e conectar WhatsApp da empresa.', 'Canais de Atendimento', 5061)
on conflict (key) do update set label=excluded.label, description=excluded.description, module_name=excluded.module_name, sort_order=excluded.sort_order;

-- Inherit existing company settings access; no blanket grant to operators.
insert into public.role_permissions(role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id
join public.permissions target on target.key='settings.channels.view'
where source.key in ('settings.details.view','settings.update','sac_digital.settings.manage')
on conflict (role_id,permission_id) do nothing;

insert into public.role_permissions(role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id
join public.permissions target on target.key='settings.channels.manage'
where source.key in ('settings.update','sac_digital.settings.manage')
on conflict (role_id,permission_id) do nothing;

create table if not exists public.whatsapp_channel_connections (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 provider text not null default 'wuzapi' check (provider = 'wuzapi'),
 display_name text not null default 'WhatsApp Business' check (char_length(display_name) between 1 and 80),
 state text not null default 'not_connected'
  check (state in ('not_connected','connecting','connected','disconnected','error')),
 phone text,
 last_connected_at timestamptz,
 last_checked_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint whatsapp_channel_connections_org_provider_unique unique (organization_id,provider)
);

comment on table public.whatsapp_channel_connections is
'Public metadata per organization. Do not store session tokens, QR contents, secrets, or WuzAPI administrator credentials here.';
create index if not exists whatsapp_channel_connections_org_state_idx on public.whatsapp_channel_connections(organization_id,state);

alter table public.whatsapp_channel_connections enable row level security;
revoke all on public.whatsapp_channel_connections from anon,authenticated;
grant select on public.whatsapp_channel_connections to authenticated;
drop policy if exists whatsapp_channel_connections_read on public.whatsapp_channel_connections;
create policy whatsapp_channel_connections_read on public.whatsapp_channel_connections
 for select to authenticated
 using (private.has_effective_organization_permission(organization_id,'settings.channels.view'));
-- Writes deliberately use a JWT-authenticated Edge Function with separate permission check and service role.

commit;
