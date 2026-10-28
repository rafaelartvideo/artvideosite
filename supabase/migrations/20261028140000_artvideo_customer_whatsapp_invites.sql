-- Convites de acesso ao historico CRM: somente autenticacao e vinculo autorizados.
-- Nunca vincular pelo CPF ou e-mail como prova de posse.
alter table public.artvideo_customer_accounts
  add column if not exists whatsapp_verified_at timestamptz,
  add column if not exists whatsapp_verified_number text,
  add column if not exists crm_access_activated_at timestamptz;

create table if not exists public.artvideo_customer_access_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid not null references public.customers(id),
  phone_e164 text not null check (phone_e164 ~ '^55[1-9][0-9]{9,10}$'),
  token_digest text not null unique check (token_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','activated','revoked')),
  created_by uuid not null references auth.users(id),
  activated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  activated_at timestamptz,
  revoked_at timestamptz
);
create index if not exists artvideo_customer_invites_customer_idx on public.artvideo_customer_access_invites(organization_id,customer_id,created_at desc);
alter table public.artvideo_customer_access_invites enable row level security;
revoke all on public.artvideo_customer_access_invites from public,anon,authenticated;
grant all on public.artvideo_customer_access_invites to service_role;

create table if not exists public.artvideo_customer_access_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  invite_id uuid references public.artvideo_customer_access_invites(id),
  account_user_id uuid references auth.users(id),
  purpose text not null check (purpose in ('activation','login')),
  phone_e164 text not null,
  chat_jid text not null,
  code_digest text not null check (code_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','consumed','locked')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  resend_count integer not null default 0 check (resend_count between 0 and 10),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  next_send_at timestamptz not null default (now() + interval '60 seconds'),
  consumed_at timestamptz,
  constraint artvideo_customer_challenge_scope check (
     (purpose='activation' and invite_id is not null and account_user_id is null)
     or (purpose='login' and account_user_id is not null and invite_id is null)
  )
);
create index if not exists artvideo_customer_challenges_invite_idx on public.artvideo_customer_access_challenges(invite_id,created_at desc);
create index if not exists artvideo_customer_challenges_account_idx on public.artvideo_customer_access_challenges(account_user_id,created_at desc);
alter table public.artvideo_customer_access_challenges enable row level security;
revoke all on public.artvideo_customer_access_challenges from public,anon,authenticated;
grant all on public.artvideo_customer_access_challenges to service_role;

create table if not exists public.artvideo_customer_access_rate_limits (
  rate_key text primary key,
  window_until timestamptz not null,
  attempts integer not null default 1
);
alter table public.artvideo_customer_access_rate_limits enable row level security;
revoke all on public.artvideo_customer_access_rate_limits from public,anon,authenticated;
grant all on public.artvideo_customer_access_rate_limits to service_role;

-- Uma chamada privilegiada atomica evita a corrida de contadores concorrentes.
create or replace function public.artvideo_customer_access_rate_limit_v1(
  p_key text,p_limit integer,p_seconds integer
) returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_count integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Nao autorizado.' using errcode='42501';
  end if;
  if length(p_key) <> 64 or p_limit not between 1 and 100 or p_seconds not between 60 and 86400 then
    raise exception 'Parametros invalidos.';
  end if;
  insert into public.artvideo_customer_access_rate_limits(rate_key,window_until,attempts)
  values(p_key,now()+make_interval(secs=>p_seconds),1)
  on conflict (rate_key) do update
    set attempts=case when public.artvideo_customer_access_rate_limits.window_until <= now()
      then 1 else public.artvideo_customer_access_rate_limits.attempts+1 end,
    window_until=case when public.artvideo_customer_access_rate_limits.window_until <= now()
      then now()+make_interval(secs=>p_seconds)
      else public.artvideo_customer_access_rate_limits.window_until end
  returning attempts into v_count;
  return v_count <= p_limit;
end $$;
revoke all on function public.artvideo_customer_access_rate_limit_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.artvideo_customer_access_rate_limit_v1(text,integer,integer) to service_role;

-- So informacoes da OS liberadas ao cliente; nenhuma anotacao interna ou caminho de Storage.
create or replace function public.artvideo_customer_portal_extended_v1()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid := public.artvideo_organization_id();
  v_customer_id uuid;
  v_base jsonb;
  v_orders jsonb;
  v_docs jsonb;
begin
  if v_uid is null then raise exception 'Sessao invalida.' using errcode='42501'; end if;
  v_base := public.artvideo_customer_portal_v1();
  select a.entity_id into v_customer_id
  from public.artvideo_customer_accounts a
  join public.customers c on c.id=a.entity_id and c.organization_id=a.organization_id
  where a.user_id=v_uid and a.organization_id=v_org
    and a.whatsapp_verified_at is not null
    and a.crm_access_activated_at is not null
    and a.entity_id is not null and a.link_status in ('matched','created','approved');
  if v_customer_id is null then
    return v_base || jsonb_build_object('crm_access',false,'service_orders','[]'::jsonb,'documents','[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
    into v_orders from (
      select so.id,so.os_number,so.created_at,so.scheduled_at,so.completed_at,
             coalesce(st.name,'Em acompanhamento') as status,
             coalesce(gs.name, s.title, 'Ordem de serviço') as description,
             coalesce(so.model,'') as model
      from public.service_orders so
      left join public.order_statuses st on st.id=so.status_id and st.organization_id=so.organization_id
      left join public.general_services gs on gs.id=so.general_service_id and gs.organization_id=so.organization_id
      left join public.services s on s.id=so.service_id and s.organization_id=so.organization_id
      where so.organization_id=v_org and so.customer_id=v_customer_id
      order by so.created_at desc limit 100
    ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.signed_at desc),'[]'::jsonb)
    into v_docs from (
      select r.id,so.os_number,r.template_name_snapshot as title,r.signed_at
      from public.document_signature_requests r
      join public.service_orders so on so.id=r.service_order_id and so.organization_id=r.organization_id
      where r.organization_id=v_org and so.customer_id=v_customer_id
        and r.signed_at is not null and r.final_pdf_storage_path is not null
        and r.cancelled_at is null
      order by r.signed_at desc limit 100
    ) x;
  return v_base || jsonb_build_object('crm_access',true,'service_orders',v_orders,'documents',v_docs);
end $$;
revoke all on function public.artvideo_customer_portal_extended_v1() from public,anon;
grant execute on function public.artvideo_customer_portal_extended_v1() to authenticated;
