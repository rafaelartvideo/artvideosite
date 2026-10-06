begin;

alter table public.sac_digital_protocols
  add column if not exists department_name text;

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
begin
  select *
  into v_event
  from public.sac_digital_webhook_events
  where id = p_event_id;

  if not found then
    return;
  end if;

  if v_event.processed_at is not null and v_event.processing_error is null then
    return;
  end if;

  v_protocol := nullif(pg_catalog.btrim(coalesce(v_event.payload->>'protocol','')), '');

  begin
    if v_event.event_type = 'protocol_opened' and v_protocol is not null then
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
        case
          when nullif(v_event.payload->>'opened_at','') is not null
            then (v_event.payload->>'opened_at')::timestamp
                 at time zone coalesce(nullif(v_event.payload->>'timezone',''),'America/Sao_Paulo')
          else v_event.received_at
        end,
        v_event.payload,
        now()
      )
      on conflict (organization_id, external_protocol_id) do update set
        status = 'open',
        opened_at = coalesce(public.sac_digital_protocols.opened_at, excluded.opened_at),
        raw_metadata = public.sac_digital_protocols.raw_metadata || excluded.raw_metadata,
        updated_at = now();

    elsif v_event.event_type = 'protocol_finished' and v_protocol is not null then
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
        case
          when nullif(v_event.payload->>'finish_at','') is not null
            then (v_event.payload->>'finish_at')::timestamp
                 at time zone coalesce(nullif(v_event.payload->>'timezone',''),'America/Sao_Paulo')
          else v_event.received_at
        end,
        v_event.payload,
        now()
      )
      on conflict (organization_id, external_protocol_id) do update set
        status = 'finished',
        closed_at = excluded.closed_at,
        raw_metadata = public.sac_digital_protocols.raw_metadata || excluded.raw_metadata,
        updated_at = now();

    elsif v_event.event_type in ('protocol_in_att','protocol_forward') and v_protocol is not null then
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

      v_sent_at := case
        when nullif(v_event.payload->>'created_at','') is not null
          then (v_event.payload->>'created_at')::timestamp
               at time zone coalesce(nullif(v_event.payload->>'timezone',''),'America/Sao_Paulo')
        else v_event.received_at
      end;

      v_message_type := case
        when nullif(pg_catalog.btrim(coalesce(v_message->>'text','')), '') is not null then 'text'
        when nullif(v_message->>'image','') is not null then 'image'
        when nullif(v_message->>'video','') is not null then 'video'
        when nullif(v_message->>'audio','') is not null then 'audio'
        when nullif(v_message->>'file','') is not null then 'file'
        when nullif(v_message->>'place','') is not null
          or nullif(v_message->>'lat','') is not null
          or nullif(v_message->>'lon','') is not null then 'location'
        when nullif(v_message->>'v_name','') is not null
          or nullif(v_message->>'v_number','') is not null then 'vcard'
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

revoke all on function public.project_sac_digital_webhook_event(bigint) from public, anon, authenticated;
grant execute on function public.project_sac_digital_webhook_event(bigint) to service_role;

comment on function public.project_sac_digital_webhook_event(bigint)
is 'Projeta eventos brutos do webhook SAC Digital em protocolos e mensagens de forma idempotente. Uso exclusivo do backend.';

commit;