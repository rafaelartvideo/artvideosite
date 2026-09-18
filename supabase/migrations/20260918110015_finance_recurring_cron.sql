begin;

create extension if not exists pg_cron;

create or replace function private.run_financial_recurring_generation()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rule public.financial_recurring_rules%rowtype;
  v_member record;
  v_actor uuid;
  v_permission text;
  v_original_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
  v_generated integer := 0;
begin
  for v_rule in
    select *
    from public.financial_recurring_rules r
    where r.is_active=true
      and r.next_occurrence_date <= current_date + 90
      and (r.end_date is null or r.next_occurrence_date<=r.end_date)
    order by r.organization_id,r.next_occurrence_date,r.id
  loop
    v_actor:=null;
    v_permission:=case when v_rule.entry_type='receivable'
      then 'finance.receivables.create'
      else 'finance.payables.create'
    end;

    for v_member in
      select m.user_id
      from public.organization_members m
      join public.profiles p on p.id=m.user_id
      where m.organization_id=v_rule.organization_id
        and m.status='active'
        and p.is_active=true
      order by
        case when m.user_id=v_rule.created_by then 0 else 1 end,
        case when m.is_owner then 0 else 1 end,
        m.created_at
    loop
      perform set_config('request.jwt.claim.sub',v_member.user_id::text,true);
      if private.can_access_finance(v_rule.organization_id,'finance.recurring.manage')
         and private.can_access_finance(v_rule.organization_id,v_permission) then
        v_actor:=v_member.user_id;
        exit;
      end if;
    end loop;

    if v_actor is null then
      continue;
    end if;

    begin
      perform set_config('request.jwt.claim.sub',v_actor::text,true);
      v_result:=public.generate_financial_recurring_occurrences(
        v_rule.organization_id,
        v_rule.id,
        current_date+90
      );
      v_generated:=v_generated+coalesce((v_result->>'generated')::integer,0);
    exception when others then
      raise warning 'Falha ao gerar recorrência financeira % da organização %: %',
        v_rule.id,v_rule.organization_id,sqlerrm;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub',coalesce(v_original_sub,''),true);
  return v_generated;
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(v_original_sub,''),true);
  raise;
end;
$$;

revoke all on function private.run_financial_recurring_generation() from public,anon,authenticated;

select cron.schedule(
  'finance-recurring-90-days',
  '15 3 * * *',
  'select private.run_financial_recurring_generation();'
);

commit;
