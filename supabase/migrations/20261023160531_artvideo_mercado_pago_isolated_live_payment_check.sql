begin;
-- Validação de R$ 1,00 real, opcional e isolada dos pedidos/estoque/caixa.
create table if not exists public.artvideo_payment_live_checks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.artvideo_organization_id(),
 created_by uuid not null,
 provider_key text not null default 'mercado_pago' check(provider_key='mercado_pago'),
 environment text not null default 'production' check(environment='production'),
 amount numeric(12,2) not null default 1.00 check(amount=1.00),
 status text not null default 'creating' check(status in
  ('creating','awaiting_payment','pending','in_process','approved','rejected','cancelled','refunded','charged_back','error')),
 preference_id text,
 payment_id text,
 webhook_received_at timestamptz,
 paid_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists artvideo_payment_live_checks_creator_idx
 on public.artvideo_payment_live_checks(created_by,created_at desc);
alter table public.artvideo_payment_live_checks enable row level security;
revoke all on public.artvideo_payment_live_checks from public,anon,authenticated;
grant select,insert,update on public.artvideo_payment_live_checks to service_role;
-- Somente service_role pode chamar. Edge verifica assinatura da notificacao
-- ou API autenticada com referencia, seller, live_mode, moeda, valor e pagamento.
create or replace function public.artvideo_payment_live_check_settle_v1(
 p_check_id uuid, p_payment_id text, p_payment_status text,
 p_amount numeric, p_from_signed_webhook boolean default false
) returns text
language plpgsql security definer set search_path=''
as $fn$
declare v_check public.artvideo_payment_live_checks%rowtype;
declare v_status text;
begin
 select * into v_check from public.artvideo_payment_live_checks
 where id=p_check_id and provider_key='mercado_pago'
  and environment='production' for update;
 if not found then raise exception 'Validacao real nao localizada.' using errcode='22023'; end if;
 if p_payment_id is null or p_payment_id !~ '^[0-9]{5,25}$'
   or p_amount is null or abs(p_amount-v_check.amount)>0.009 then
  raise exception 'Pagamento real nao confere.' using errcode='23514';
 end if;
 if p_payment_status not in ('approved','pending','in_process','rejected','cancelled','refunded','charged_back') then
  return v_check.status;
 end if;
 v_status:=p_payment_status;
 if v_check.status='approved' and p_payment_status in ('pending','in_process','rejected','cancelled') then
  v_status:='approved';
 end if;
 update public.artvideo_payment_live_checks set
  status=v_status,payment_id=p_payment_id,
  paid_at=case when v_status='approved' then coalesce(paid_at,now()) else paid_at end,
  webhook_received_at=case when p_from_signed_webhook
   then coalesce(webhook_received_at,now()) else webhook_received_at end,
  updated_at=now()
 where id=p_check_id;
 return v_status;
end;
$fn$;
revoke all on function public.artvideo_payment_live_check_settle_v1(uuid,text,text,numeric,boolean)
 from public,anon,authenticated;
grant execute on function public.artvideo_payment_live_check_settle_v1(uuid,text,text,numeric,boolean)
 to service_role;
commit;