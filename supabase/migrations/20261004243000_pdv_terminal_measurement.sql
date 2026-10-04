-- Registro leve de terminais PDV para medição comercial.
-- Sem bloqueios e sem alterar sessões de caixa.

begin;

create table if not exists public.pdv_terminals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  terminal_key text not null,
  label text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_user_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, terminal_key)
);

create index if not exists pdv_terminals_org_seen_idx
  on public.pdv_terminals (organization_id, is_active, last_seen_at desc);

alter table public.pdv_terminals enable row level security;
revoke all on table public.pdv_terminals from anon, authenticated;

create or replace function public.register_pdv_terminal_v1(
  p_organization_id uuid,
  p_terminal_key text,
  p_label text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null
     or p_organization_id is null
     or not private.can_access_organization(p_organization_id) then
    raise exception 'Sem permissão para registrar este terminal.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_terminal_key, '')), '') is null
     or length(p_terminal_key) > 120 then
    raise exception 'Identificador de terminal inválido.' using errcode = '22023';
  end if;

  insert into public.pdv_terminals (
    organization_id, terminal_key, label, first_seen_at, last_seen_at,
    last_user_id, is_active, metadata
  )
  values (
    p_organization_id,
    btrim(p_terminal_key),
    nullif(btrim(coalesce(p_label, '')), ''),
    now(),
    now(),
    (select auth.uid()),
    true,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (organization_id, terminal_key) do update set
    label = coalesce(excluded.label, public.pdv_terminals.label),
    last_seen_at = now(),
    last_user_id = (select auth.uid()),
    is_active = true,
    metadata = coalesce(excluded.metadata, '{}'::jsonb)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_pdv_terminal_v1(uuid, text, text, jsonb) from public, anon;
grant execute on function public.register_pdv_terminal_v1(uuid, text, text, jsonb) to authenticated;

create or replace function public.load_organization_plan_usage_v5(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_usage jsonb;
  v_sources jsonb;
  v_pdv_terminals bigint;
begin
  v_result := public.load_organization_plan_usage_v4(p_organization_id);
  v_usage := coalesce(v_result -> 'usage', '{}'::jsonb);
  v_sources := coalesce(v_result -> 'usage_sources', '{}'::jsonb);

  select count(*)::bigint
  into v_pdv_terminals
  from public.pdv_terminals terminal
  where terminal.organization_id = p_organization_id
    and terminal.is_active
    and terminal.last_seen_at >= now() - interval '90 days';

  v_usage := v_usage || jsonb_build_object('pdv_terminals', coalesce(v_pdv_terminals, 0));
  v_sources := v_sources || jsonb_build_object('pdv_terminals', 'measured');

  return jsonb_set(
    jsonb_set(v_result, '{usage}', v_usage, true),
    '{usage_sources}', v_sources,
    true
  );
end;
$$;

revoke all on function public.load_organization_plan_usage_v5(uuid) from public, anon;
grant execute on function public.load_organization_plan_usage_v5(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;