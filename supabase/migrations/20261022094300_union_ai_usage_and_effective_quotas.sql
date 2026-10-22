-- Union IA: limites efetivos no servidor e ledger por organização
create table if not exists public.union_ai_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null,
  service_order_id uuid not null references public.service_orders(id),
  field_key text not null check (field_key in ('diagnosis','proposed_solution')),
  action_key text not null check (action_key in ('generate','improve')),
  model text not null,
  status text not null default 'reserved' check(status in ('reserved','success','failed')),
  reservation_usd numeric(12,8) not null default 0.002,
  cost_usd numeric(12,8) not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists union_ai_usage_month_idx on public.union_ai_usage(organization_id,created_at desc);
create index if not exists union_ai_usage_user_idx on public.union_ai_usage(organization_id,user_id,created_at desc);
alter table public.union_ai_usage enable row level security;
revoke all on public.union_ai_usage from anon, authenticated, public;
grant select,insert,update on public.union_ai_usage to service_role;

-- Chamada permitida apenas pelo service_role da Edge Function, que autentica o usuário.
create or replace function public.union_ai_reserve(
 p_organization_id uuid, p_user_id uuid, p_order_id uuid, p_field text, p_action text, p_model text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 v_id uuid;
 v_budget numeric;
 v_daily integer;
 v_minute integer;
 v_spent numeric;
 v_count integer;
 v_settings jsonb;
begin
 if current_user <> 'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
 if p_field not in ('diagnosis','proposed_solution') or p_action not in ('generate','improve') or p_model <> 'gpt-6-luna'
 then raise exception 'Solicitação inválida' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 28654));
 select om.settings into v_settings from public.organization_modules om
 join public.system_modules sm on sm.key=om.module_key and sm.is_active
 where om.organization_id=p_organization_id and om.module_key='ai' and om.is_enabled is true;
 if not found then raise exception 'Union IA indisponível para esta empresa' using errcode='42501'; end if;
 if not exists (
 select 1 from public.service_orders so
 where so.id=p_order_id and so.organization_id=p_organization_id
 and so.completed_at is null and so.cancelled_at is null)
 then raise exception 'OS não editável ou de outra empresa' using errcode='42501'; end if;
 if not exists (
 select 1 from public.organization_members om
 where om.organization_id=p_organization_id and om.user_id=p_user_id and om.status='active'
 and (
 om.is_owner is true or
 (exists (select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
 where rp.role_id=om.role_id and p.key='ai.view')
 and exists (select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
 where rp.role_id=om.role_id and p.key='orders.edit'))
 ))
 then raise exception 'Permissão de IA e edição de OS necessária' using errcode='42501'; end if;
 v_budget := least(50, greatest(0,coalesce(nullif(v_settings->>'monthly_budget_usd','')::numeric,2)));
 v_daily := least(500, greatest(1,coalesce(nullif(v_settings->>'daily_request_limit','')::integer,40)));
 v_minute := least(30, greatest(1,coalesce(nullif(v_settings->>'per_minute_limit','')::integer,5)));
 select coalesce(sum(case when status='reserved' then reservation_usd else cost_usd end),0)
 into v_spent from public.union_ai_usage where organization_id=p_organization_id
 and created_at >= date_trunc('month',now()) and created_at < date_trunc('month',now())+interval '1 month'
 and status <> 'failed';
 if v_spent + 0.002 > v_budget then raise exception 'Limite mensal da Union IA atingido' using errcode='P0001'; end if;
 select count(*) into v_count from public.union_ai_usage where organization_id=p_organization_id and user_id=p_user_id
 and created_at >= date_trunc('day',now()) and status <> 'failed';
 if v_count >= v_daily then raise exception 'Limite diário de IA atingido' using errcode='P0001'; end if;
 select count(*) into v_count from public.union_ai_usage where organization_id=p_organization_id and user_id=p_user_id
 and created_at >= now()-interval '1 minute';
 if v_count >= v_minute then raise exception 'Aguarde antes de gerar novamente' using errcode='P0001'; end if;
 insert into public.union_ai_usage(organization_id,user_id,service_order_id,field_key,action_key,model)
 values(p_organization_id,p_user_id,p_order_id,p_field,p_action,p_model) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.union_ai_reserve(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.union_ai_reserve(uuid,uuid,uuid,text,text,text) to service_role;

create or replace function public.union_ai_finalize(
 p_id uuid,p_status text,p_input_tokens integer,p_output_tokens integer,p_failure_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
 if current_user <> 'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
 if p_status not in ('success','failed') then raise exception 'Status inválido'; end if;
 update public.union_ai_usage
 set status=p_status,input_tokens=greatest(0,least(coalesce(p_input_tokens,0),1000000)),
 output_tokens=greatest(0,least(coalesce(p_output_tokens,0),1000000)),
 cost_usd=case when p_status='success' then round((greatest(0,coalesce(p_input_tokens,0))*0.10+greatest(0,coalesce(p_output_tokens,0))*0.50)/1000000,8) else 0 end,
 failure_reason=left(p_failure_reason,150),completed_at=now()
 where id=p_id and status='reserved';
end $$;
revoke all on function public.union_ai_finalize(uuid,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.union_ai_finalize(uuid,text,integer,integer,text) to service_role;

-- Só a empresa de homologação recebe parâmetros iniciais.
update public.organization_modules set
 settings = coalesce(settings,'{}'::jsonb) || '{"model":"gpt-6-luna","monthly_budget_usd":2,"daily_request_limit":40,"per_minute_limit":5}'::jsonb
where organization_id='5bcd7ec7-38f0-4dda-a84c-10429bd46b23'::uuid and module_key='ai' and is_enabled=true;
