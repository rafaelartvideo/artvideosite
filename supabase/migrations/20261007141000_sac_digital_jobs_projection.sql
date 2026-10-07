begin;
alter table public.sac_digital_protocols add column if not exists state_event_at timestamptz;
create table public.sac_digital_jobs (
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null check(kind in ('projection','reconciliation')),
 event_id bigint references public.sac_digital_webhook_events(id) on delete cascade,
 protocol text, dedupe_key text not null, generation bigint not null default 1, lease_generation bigint,
 status text not null default 'pending' check(status in ('pending','running','done')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, last_error text, completed_at timestamptz,
 created_at timestamptz not null default now(), unique(organization_id,dedupe_key)
);
alter table public.sac_digital_jobs enable row level security;
revoke all on public.sac_digital_jobs from public,anon,authenticated;
grant all on public.sac_digital_jobs to service_role;
grant usage,select on sequence public.sac_digital_jobs_id_seq to service_role;
create index sac_jobs_due on public.sac_digital_jobs(status,available_at);
create function public.ingest_sac_digital_webhook_event(p_organization_id uuid,p_event_type text,p_payload_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id bigint;begin
 insert into public.sac_digital_webhook_events(organization_id,event_type,payload_hash,payload)
 values(p_organization_id,p_event_type,p_payload_hash,p_payload)
 on conflict(organization_id,payload_hash) do update set payload_hash=excluded.payload_hash returning id into v_id;
 insert into public.sac_digital_jobs(organization_id,kind,event_id,dedupe_key)
 values(p_organization_id,'projection',v_id,'event:'||v_id) on conflict do nothing;
 update public.sac_digital_integrations set connection_status=case when connection_status='error' then 'error' else 'receiving' end,last_webhook_at=now(),last_event_type=p_event_type,updated_at=now() where organization_id=p_organization_id;
 return jsonb_build_object('event_id',v_id);end $$;
create function public.claim_sac_digital_jobs(p_limit integer default 20,p_organization_id uuid default null)
returns setof public.sac_digital_jobs language sql security definer set search_path='' as $$
 update public.sac_digital_jobs j set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',lease_generation=generation
 where id in(select id from public.sac_digital_jobs where (p_organization_id is null or organization_id=p_organization_id) and ((status='pending' and available_at<=now()) or (status='running' and lease_until<now())) order by available_at,id limit least(50,greatest(1,p_limit)) for update skip locked) returning j.*;
$$;
create function public.finish_sac_digital_job(p_id bigint,p_lease uuid,p_error text default null)
returns void language sql security definer set search_path='' as $$
 update public.sac_digital_jobs set status=case when p_error is null and generation=lease_generation then 'done' else 'pending' end,
 completed_at=case when p_error is null then now() else null end,last_error=left(p_error,500),lease_until=null,lease_token=null,
 available_at=case when p_error is null then now() else now()+make_interval(secs=>least(3600,power(2,least(attempts,11))::integer)) end
 where id=p_id and lease_token=p_lease and status='running';
$$;
create table public.sac_digital_contact_notices(organization_id uuid not null references public.organizations(id) on delete cascade,source_event_hash text not null,name text,phone text not null,payload jsonb not null,received_at timestamptz not null,primary key(organization_id,source_event_hash));
alter table public.sac_digital_contact_notices enable row level security;
revoke all on public.sac_digital_contact_notices from public,anon,authenticated;
grant all on public.sac_digital_contact_notices to service_role;
create table public.sac_digital_sms_replies(organization_id uuid not null references public.organizations(id) on delete cascade, source_event_hash text not null,payload jsonb not null,received_at timestamptz not null,primary key(organization_id,source_event_hash));
alter table public.sac_digital_sms_replies enable row level security;
revoke all on public.sac_digital_sms_replies from public,anon,authenticated;
grant all on public.sac_digital_sms_replies to service_role;
create or replace function public.project_sac_digital_webhook_event(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event public.sac_digital_webhook_events%rowtype;
  v_protocol text;
  v_message jsonb;
  v_protocol_id uuid;
  v_sent_at timestamptz;
  v_message_type text;
  v_media_url text;
  v_state_at timestamptz;
  v_current_at timestamptz;
  v_time_text text;
  v_contact jsonb;
  v_current_status text;
begin
  select *
  into v_event
  from public.sac_digital_webhook_events
  where id = p_event_id for update;

  if not found then
    return;
  end if;

  if v_event.processed_at is not null and v_event.processing_error is null then
    return;
  end if;

  v_protocol := nullif(pg_catalog.btrim(coalesce(v_event.payload->>'protocol','')), '');

  if v_event.event_type not in ('protocol_opened','protocol_finished','protocol_in_att','protocol_forward','protocol_new_message','protocol_new_inbox','contact_new','smsideal_reply') then raise exception 'Unsupported SAC event'; end if;
  v_time_text := case when v_event.event_type='protocol_finished' then nullif(v_event.payload->>'finish_at','') when v_event.event_type='protocol_opened' then nullif(v_event.payload->>'opened_at','') else nullif(v_event.payload->>'created_at','') end;
  v_state_at := case when v_time_text is null then v_event.received_at
    when v_time_text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then v_time_text::timestamptz
    else v_time_text::timestamp at time zone coalesce(nullif(v_event.payload->>'timezone',''),'America/Sao_Paulo') end;
  if v_protocol is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_event.organization_id::text||':'||v_protocol,0));
    select state_event_at,status into v_current_at,v_current_status from public.sac_digital_protocols where organization_id=v_event.organization_id and external_protocol_id=v_protocol;
  end if;
  begin
    if v_event.event_type = 'protocol_opened' and (v_current_at is null or v_state_at >= v_current_at) and (v_current_status is distinct from 'finished' or (v_time_text is not null and v_state_at>v_current_at)) and v_protocol is not null then
      insert into public.sac_digital_protocols (
        organization_id,
        external_protocol_id,
        status,
        opened_at,
        raw_metadata,
        updated_at
      ) values (
        v_event.organization_id,
        v_protocol,
        'open',
        v_state_at,
        v_event.payload,
        now()
      )
      on conflict (organization_id, external_protocol_id) do update set
        status = 'open',
        opened_at = coalesce(public.sac_digital_protocols.opened_at, excluded.opened_at),
        raw_metadata = public.sac_digital_protocols.raw_metadata || excluded.raw_metadata,
        updated_at = now();

    elsif v_event.event_type = 'protocol_finished' and (v_current_at is null or v_state_at >= v_current_at) and (v_current_status is distinct from 'finished' or (v_time_text is not null and v_state_at>v_current_at)) and v_protocol is not null then
      insert into public.sac_digital_protocols (
        organization_id,
        external_protocol_id,
        status,
        closed_at,
        raw_metadata,
        updated_at
      ) values (
        v_event.organization_id,
        v_protocol,
        'finished',
        v_state_at,
        v_event.payload,
        now()
      )
      on conflict (organization_id, external_protocol_id) do update set
        status = 'finished',
        closed_at = excluded.closed_at,
        raw_metadata = public.sac_digital_protocols.raw_metadata || excluded.raw_metadata,
        updated_at = now();

    elsif v_event.event_type in ('protocol_in_att','protocol_forward') and (v_current_at is null or v_state_at >= v_current_at) and (v_current_status is distinct from 'finished' or (v_time_text is not null and v_state_at>v_current_at)) and v_protocol is not null then
      insert into public.sac_digital_protocols (
        organization_id,
        external_protocol_id,
        status,
        operator_name,
        department_name,
        raw_metadata,
        updated_at
      ) values (
        v_event.organization_id,
        v_protocol,
        'in_att',
        nullif(v_event.payload->>'operator',''),
        nullif(v_event.payload->>'department',''),
        v_event.payload,
        now()
      )
      on conflict (organization_id, external_protocol_id) do update set
        status = 'in_att',
        operator_name = coalesce(excluded.operator_name, public.sac_digital_protocols.operator_name),
        department_name = coalesce(excluded.department_name, public.sac_digital_protocols.department_name),
        raw_metadata = public.sac_digital_protocols.raw_metadata || excluded.raw_metadata,
        updated_at = now();

    elsif v_event.event_type in ('protocol_new_message','protocol_new_inbox') and v_protocol is not null then
      v_message := coalesce(v_event.payload->'message','{}'::jsonb);

      v_sent_at := v_state_at;

      v_message_type := case
        when nullif(v_message->>'image','') is not null then 'image'
        when nullif(v_message->>'video','') is not null then 'video'
        when nullif(v_message->>'audio','') is not null then 'audio'
        when nullif(v_message->>'file','') is not null then 'file'
        when nullif(v_message->>'place','') is not null
          or nullif(v_message->>'lat','') is not null
          or nullif(v_message->>'lon','') is not null then 'location'
        when nullif(v_message->>'v_name','') is not null
          or nullif(v_message->>'v_number','') is not null then 'vcard'
        when nullif(v_message->>'text','') is not null then 'text'
        else 'unknown'
      end;

      v_media_url := coalesce(
        nullif(v_message->>'image',''),
        nullif(v_message->>'video',''),
        nullif(v_message->>'audio',''),
        nullif(v_message->>'file','')
      );

      insert into public.sac_digital_protocols (
        organization_id,
        external_protocol_id,
        status,
        last_message_at,
        raw_metadata,
        updated_at
      ) values (
        v_event.organization_id,
        v_protocol,
        case when v_event.event_type='protocol_new_inbox' then 'inbox' else 'open' end,
        v_sent_at,
        jsonb_build_object('last_message_event', v_event.event_type),
        now()
      )
      on conflict (organization_id, external_protocol_id) do update set
        last_message_at = greatest(
          coalesce(public.sac_digital_protocols.last_message_at, excluded.last_message_at),
          excluded.last_message_at
        ),
        raw_metadata = public.sac_digital_protocols.raw_metadata || excluded.raw_metadata,
        updated_at = now()
      returning id into v_protocol_id;

      insert into public.sac_digital_messages (
        organization_id,
        protocol_id,
        direction,
        message_type,
        body_text,
        media_url,
        sent_at,
        source_event_hash,
        raw_metadata
      ) values (
        v_event.organization_id,
        v_protocol_id,
        'incoming',
        v_message_type,
        nullif(v_message->>'text',''),
        v_media_url,
        v_sent_at,
        v_event.payload_hash,
        v_event.payload
      )
      on conflict (organization_id, source_event_hash)
      where source_event_hash is not null
      do nothing;
    end if;

    if v_event.event_type='contact_new' then
      v_contact := coalesce(v_event.payload->'contact','{}'::jsonb);
      if nullif(v_contact->>'number','') is null then raise exception 'contact_new without contact.number'; end if;
      insert into public.sac_digital_contact_notices(organization_id,source_event_hash,name,phone,payload,received_at)
      values(v_event.organization_id,v_event.payload_hash,v_contact->>'name',v_contact->>'number',v_event.payload,v_state_at) on conflict do nothing;
      -- Published webhook has no contact ID. Update known phone records without inventing a provider ID.
      update public.sac_digital_contacts set name=coalesce(v_contact->>'name',name),raw_metadata=raw_metadata||v_event.payload,updated_at=now()
      where organization_id=v_event.organization_id and regexp_replace(phone,'[^0-9]','','g')=regexp_replace(v_contact->>'number','[^0-9]','','g');
    elsif v_event.event_type='smsideal_reply' then
      insert into public.sac_digital_sms_replies(organization_id,source_event_hash,payload,received_at) values(v_event.organization_id,v_event.payload_hash,v_event.payload,v_state_at) on conflict do nothing;
    end if;
    if v_protocol is not null then
      if v_event.event_type in ('protocol_opened','protocol_finished','protocol_in_att','protocol_forward') and (v_current_at is null or v_state_at>=v_current_at) and (v_current_status is distinct from 'finished' or (v_time_text is not null and v_state_at>v_current_at)) then
        update public.sac_digital_protocols set state_event_at=v_state_at where organization_id=v_event.organization_id and external_protocol_id=v_protocol;
      end if;
      insert into public.sac_digital_jobs(organization_id,kind,protocol,dedupe_key) values(v_event.organization_id,'reconciliation',v_protocol,'protocol:'||v_protocol)
      on conflict(organization_id,dedupe_key) do update set generation=public.sac_digital_jobs.generation+1,status=case when public.sac_digital_jobs.status='running' then 'running' else 'pending' end,available_at=now();
    end if;
    update public.sac_digital_webhook_events
    set processed_at = now(),
        processing_error = null
    where id = v_event.id;
  exception when others then
    update public.sac_digital_webhook_events
    set processing_error = left(sqlerrm, 1000)
    where id = v_event.id;
    raise;
  end;
end;
$$;

-- Database-only recovery: no HTTP extensions or queue extension dependency.
create function public.recover_sac_digital_projection_jobs(p_limit integer default 50)
returns integer language plpgsql security definer set search_path='' as $$
declare j public.sac_digital_jobs%rowtype; n integer:=0;begin
 for j in select * from public.sac_digital_jobs where kind='projection' and ((status='pending' and available_at<=now()) or (status='running' and lease_until<now())) order by id limit least(100,greatest(1,p_limit)) for update skip locked loop
  begin
   perform public.project_sac_digital_webhook_event(j.event_id);
   update public.sac_digital_jobs set status='done',attempts=attempts+1,last_error=null,completed_at=now(),lease_token=null,lease_until=null where id=j.id;
   n:=n+1;
  exception when others then
   update public.sac_digital_jobs set status='pending',attempts=attempts+1,last_error='Falha de projeção ('||sqlstate||')',lease_token=null,lease_until=null,available_at=now()+make_interval(secs=>least(3600,power(2,least(j.attempts+1,11))::integer)) where id=j.id;
   update public.sac_digital_webhook_events set processing_error='Falha de projeção ('||sqlstate||')' where id=j.event_id;
  end;
 end loop;return n;end $$;
create function public.sac_digital_jobs_health(p_organization_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('pending',count(*) filter(where status='pending'),'running',count(*) filter(where status='running'),'failed',count(*) filter(where last_error is not null),'oldest_pending_at',min(created_at) filter(where status<>'done'),'projection_pending',count(*) filter(where kind='projection' and status<>'done'),'reconciliation_pending',count(*) filter(where kind='reconciliation' and status<>'done'),'last_completed_at',max(completed_at)) from public.sac_digital_jobs where organization_id=p_organization_id;
$$;
-- Backfill durable work for previously received events, including existing retry workflow.
insert into public.sac_digital_jobs(organization_id,kind,event_id,dedupe_key)
select organization_id,'projection',id,'event:'||id from public.sac_digital_webhook_events where processed_at is null or processing_error is not null on conflict do nothing;
revoke all on function public.ingest_sac_digital_webhook_event(uuid,text,text,jsonb),public.claim_sac_digital_jobs(integer,uuid),public.finish_sac_digital_job(bigint,uuid,text),public.recover_sac_digital_projection_jobs(integer),public.sac_digital_jobs_health(uuid) from public,anon,authenticated;
grant execute on function public.ingest_sac_digital_webhook_event(uuid,text,text,jsonb),public.claim_sac_digital_jobs(integer,uuid),public.finish_sac_digital_job(bigint,uuid,text),public.recover_sac_digital_projection_jobs(integer),public.sac_digital_jobs_health(uuid) to service_role;
-- Use existing cron only. No CREATE EXTENSION and no pg_net/pgmq assumption.
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
   perform cron.schedule('sac-digital-projection-recovery','* * * * *','select public.recover_sac_digital_projection_jobs(50);');
 end if;
end $$;
commit;
