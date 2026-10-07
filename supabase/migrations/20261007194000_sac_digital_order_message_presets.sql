begin;

create table if not exists public.sac_digital_order_message_presets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preset_key text not null,
  label text not null,
  message_template text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sac_digital_order_message_presets_key_check
    check (preset_key in ('initial','estimate','completion')),
  constraint sac_digital_order_message_presets_label_check
    check (char_length(btrim(label)) between 1 and 80),
  constraint sac_digital_order_message_presets_message_check
    check (char_length(btrim(message_template)) between 1 and 5000),
  constraint sac_digital_order_message_presets_org_key_unique
    unique (organization_id, preset_key)
);

alter table public.sac_digital_order_message_presets enable row level security;

revoke all on public.sac_digital_order_message_presets from public, anon;
grant select, insert, update, delete on public.sac_digital_order_message_presets to authenticated;
grant all on public.sac_digital_order_message_presets to service_role;

drop policy if exists sac_digital_order_message_presets_select on public.sac_digital_order_message_presets;
create policy sac_digital_order_message_presets_select
on public.sac_digital_order_message_presets
for select
to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'sac_digital.messages.send')
  or private.has_effective_organization_permission(organization_id, 'sac_digital.settings.manage')
);

drop policy if exists sac_digital_order_message_presets_insert on public.sac_digital_order_message_presets;
create policy sac_digital_order_message_presets_insert
on public.sac_digital_order_message_presets
for insert
to authenticated
with check (
  private.has_effective_organization_permission(organization_id, 'sac_digital.settings.manage')
);

drop policy if exists sac_digital_order_message_presets_update on public.sac_digital_order_message_presets;
create policy sac_digital_order_message_presets_update
on public.sac_digital_order_message_presets
for update
to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'sac_digital.settings.manage')
)
with check (
  private.has_effective_organization_permission(organization_id, 'sac_digital.settings.manage')
);

drop policy if exists sac_digital_order_message_presets_delete on public.sac_digital_order_message_presets;
create policy sac_digital_order_message_presets_delete
on public.sac_digital_order_message_presets
for delete
to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'sac_digital.settings.manage')
);

insert into public.sac_digital_order_message_presets
  (organization_id, preset_key, label, message_template, sort_order, is_active)
select i.organization_id, v.preset_key, v.label, v.message_template, v.sort_order, true
from public.sac_digital_integrations i
cross join (
  values
    ('initial'::text, 'Contato sobre a OS'::text, 'Olá, {primeiro_nome}! Estamos entrando em contato sobre a OS {os}.'::text, 10),
    ('estimate'::text, 'Mensagem sobre orçamento'::text, 'Olá, {primeiro_nome}! Gostaríamos de falar com você sobre o orçamento da OS {os}. Podemos esclarecer os valores e as próximas etapas por aqui.'::text, 20),
    ('completion'::text, 'Confirmação / conclusão'::text, 'Olá, {primeiro_nome}! Temos uma atualização sobre a OS {os} e gostaríamos de confirmar os próximos passos com você.'::text, 30)
) as v(preset_key, label, message_template, sort_order)
on conflict (organization_id, preset_key) do nothing;

commit;
