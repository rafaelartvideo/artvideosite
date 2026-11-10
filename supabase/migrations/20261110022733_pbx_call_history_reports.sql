-- Read-only report. Invoker rights retain the caller's existing tenant RLS.
-- Summary and export use one materialized snapshot; never return a partial file.
create function public.pbx_call_history_report(
 p_organization_id uuid,p_from timestamptz,p_to timestamptz,
 p_direction text default null,p_disposition text default null,p_number text default null,p_export boolean default false
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_number text=nullif(btrim(p_number),''); v_extension integer;
begin
 if p_organization_id is null or p_from is null or p_to is null or p_export is null
  or p_from<'2020-01-01T00:00:00Z'::timestamptz or p_to<=p_from
  or p_to>p_from+interval '94 days'
  or (p_direction is not null and p_direction not in ('internal','inbound','outbound'))
  or (p_disposition is not null and p_disposition not in ('ANSWERED','NO ANSWER','BUSY','FAILED','CONGESTION'))
  or (v_number is not null and v_number !~ '^[+0-9#]{1,32}$') then
  raise exception 'Filtros de relatorio invalidos ou periodo excessivo.' using errcode='23514';
 end if;
 if v_number ~ '^[0-9]{3,4}$' then v_extension=v_number::integer; end if;
 return (
  with records as materialized (
   select c.id,c.agent_id,c.linked_id,c.started_at,c.answered_at,c.ended_at,c.source,c.destination,
    c.direction,c.disposition,c.duration_seconds,c.billable_seconds,
    s.number as source_number,s.display_name as source_name,
    d.number as destination_number,d.display_name as destination_name
   from public.pbx_call_logs c
   left join public.pbx_extensions s on s.id=c.source_extension_id and s.organization_id=c.organization_id
   left join public.pbx_extensions d on d.id=c.destination_extension_id and d.organization_id=c.organization_id
   where c.organization_id=p_organization_id and c.started_at>=p_from and c.started_at<p_to
    and (p_direction is null or c.direction=p_direction)
    and (p_disposition is null or c.disposition=p_disposition)
    and (v_number is null or c.source like '%'||v_number||'%' or c.destination like '%'||v_number||'%'
      or s.number=v_extension or d.number=v_extension)
  ), totals as (
   select count(*) as total_records,
    count(*) filter(where disposition='ANSWERED') as answered_records,
    count(*) filter(where disposition='NO ANSWER') as unanswered_records,
    count(*) filter(where disposition in ('FAILED','CONGESTION','BUSY')) as failed_records,
    coalesce(sum(billable_seconds),0) as talk_seconds,
    count(distinct (agent_id,linked_id)) as identified_conversations
   from records
  )
  select to_jsonb(totals)||jsonb_build_object(
   'overflow',p_export and total_records>2000,
   'rows',case when p_export and total_records<=2000 then (
    select coalesce(jsonb_agg(jsonb_build_object(
     'id',r.id,'linked_id',r.linked_id,'started_at',r.started_at,'answered_at',r.answered_at,'ended_at',r.ended_at,
     'source',r.source,'destination',r.destination,'direction',r.direction,'disposition',r.disposition,
     'duration_seconds',r.duration_seconds,'billable_seconds',r.billable_seconds,
     'source_extension',case when r.source_number is null then null else jsonb_build_object('number',r.source_number,'display_name',r.source_name) end,
     'destination_extension',case when r.destination_number is null then null else jsonb_build_object('number',r.destination_number,'display_name',r.destination_name) end
    ) order by r.started_at desc,r.id desc),'[]'::jsonb) from records r
   ) else '[]'::jsonb end
  ) from totals
 );
end;
$$;
revoke all on function public.pbx_call_history_report(uuid,timestamptz,timestamptz,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.pbx_call_history_report(uuid,timestamptz,timestamptz,text,text,text,boolean) to authenticated;
comment on function public.pbx_call_history_report(uuid,timestamptz,timestamptz,text,text,text,boolean)
 is 'Per-leg CDR report, not billing or a guarantee of human answer. Export capped at 2000 rows, derived from the same RLS-protected snapshot as its totals.';
