begin;
alter table public.union_ai_usage alter column service_order_id drop not null;
alter table public.union_ai_usage drop constraint union_ai_usage_field_key_check;
alter table public.union_ai_usage add constraint union_ai_usage_field_key_check check(field_key in ('diagnosis','proposed_solution','expense_document'));
alter table public.union_ai_usage drop constraint union_ai_usage_action_key_check;
alter table public.union_ai_usage add constraint union_ai_usage_action_key_check check(action_key in ('generate','improve','scan'));
alter table public.union_ai_usage add constraint union_ai_usage_document_scope_check check((field_key='expense_document' and action_key='scan' and service_order_id is null) or (field_key in ('diagnosis','proposed_solution') and action_key in ('generate','improve') and service_order_id is not null));
create or replace function public.union_ai_reserve_expense(
 p_organization_id uuid, p_user_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
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
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 28654));
 select om.settings into v_settings from public.organization_modules om
 join public.system_modules sm on sm.key=om.module_key and sm.is_active
 where om.organization_id=p_organization_id and om.module_key='ai' and om.is_enabled is true;
 if not found then raise exception 'Union IA indisponível para esta empresa' using errcode='42501'; end if;
 if not exists (
 select 1 from public.organization_members om
 where om.organization_id=p_organization_id and om.user_id=p_user_id and om.status='active'
 and (
 om.is_owner is true or
 (exists (select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
 where rp.role_id=om.role_id and p.key='ai.view')
 and exists (select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
 where rp.role_id=om.role_id and p.key='finance.payables.create'))
 ))
 then raise exception 'Permissão de IA e criação de contas a pagar necessária' using errcode='42501'; end if;
 v_budget := least(50, greatest(0,coalesce(nullif(v_settings->>'monthly_budget_usd','')::numeric,2)));
 v_daily := least(500, greatest(1,coalesce(nullif(v_settings->>'daily_request_limit','')::integer,40)));
 v_minute := least(30, greatest(1,coalesce(nullif(v_settings->>'per_minute_limit','')::integer,5)));
 select coalesce(sum(case when status='reserved' then reservation_usd else cost_usd end),0)
 into v_spent from public.union_ai_usage where organization_id=p_organization_id
 and created_at >= date_trunc('month',now()) and created_at < date_trunc('month',now())+interval '1 month'
 and status <> 'failed';
 if v_spent + 0.01 > v_budget then raise exception 'Limite mensal da Union IA atingido' using errcode='P0001'; end if;
 select count(*) into v_count from public.union_ai_usage where organization_id=p_organization_id and user_id=p_user_id
 and created_at >= date_trunc('day',now()) and status <> 'failed';
 if v_count >= v_daily then raise exception 'Limite diário de IA atingido' using errcode='P0001'; end if;
 select count(*) into v_count from public.union_ai_usage where organization_id=p_organization_id and user_id=p_user_id
 and created_at >= now()-interval '1 minute';
 if v_count >= v_minute then raise exception 'Aguarde antes de gerar novamente' using errcode='P0001'; end if;
 insert into public.union_ai_usage(organization_id,user_id,service_order_id,field_key,action_key,model,reservation_usd)
 values(p_organization_id,p_user_id,null,'expense_document','scan','gpt-6-luna',0.01) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.union_ai_reserve_expense(uuid,uuid) from public,anon,authenticated;
grant execute on function public.union_ai_reserve_expense(uuid,uuid) to service_role;


commit;