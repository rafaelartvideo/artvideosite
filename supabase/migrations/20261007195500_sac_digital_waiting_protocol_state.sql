begin;

create or replace function private.normalize_sac_digital_protocol_state()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_info jsonb;
  v_operator jsonb;
  v_department jsonb;
  v_operator_id text;
  v_operator_name text;
  v_department_id text;
  v_department_name text;
  v_is_att boolean := false;
  v_is_open boolean := true;
  v_api_info_changed boolean := false;
  v_inbox_event_changed boolean := false;
  v_att_event_changed boolean := false;
begin
  v_info := coalesce(new.raw_metadata->'api_info','{}'::jsonb);

  if tg_op = 'INSERT' then
    v_api_info_changed := jsonb_typeof(v_info) = 'object' and v_info <> '{}'::jsonb;
    v_inbox_event_changed := new.raw_metadata->>'last_message_event' = 'protocol_new_inbox';
    v_att_event_changed := new.raw_metadata->>'event' = 'protocol_in_att';
  else
    v_api_info_changed := (new.raw_metadata->'api_info') is distinct from (old.raw_metadata->'api_info');
    v_inbox_event_changed :=
      new.raw_metadata->>'last_message_event' = 'protocol_new_inbox'
      and (new.raw_metadata->>'last_message_event') is distinct from (old.raw_metadata->>'last_message_event');
    v_att_event_changed :=
      new.raw_metadata->>'event' = 'protocol_in_att'
      and (new.raw_metadata->>'event') is distinct from (old.raw_metadata->>'event');
  end if;

  if v_api_info_changed and jsonb_typeof(v_info) = 'object' then
    v_operator := case
      when jsonb_typeof(v_info->'operator') = 'object' then v_info->'operator'
      else '{}'::jsonb
    end;
    v_department := case
      when jsonb_typeof(v_info->'department') = 'object' then v_info->'department'
      else '{}'::jsonb
    end;

    v_operator_id := nullif(pg_catalog.btrim(coalesce(v_operator->>'id','')), '');
    v_operator_name := nullif(pg_catalog.btrim(coalesce(v_operator->>'name','')), '');
    v_department_id := nullif(pg_catalog.btrim(coalesce(v_department->>'id','')), '');
    v_department_name := nullif(pg_catalog.btrim(coalesce(v_department->>'name','')), '');

    begin
      v_is_att := coalesce((v_info->>'is_att')::boolean,false);
    exception when others then
      v_is_att := false;
    end;
    begin
      v_is_open := coalesce((v_info->>'is_open')::boolean,true);
    exception when others then
      v_is_open := true;
    end;

    -- A resposta /protocol/info é a fonte atual de verdade. Se a SAC devolveu
    -- operador nulo, o protocolo saiu daquele operador e o vínculo antigo deve
    -- ser removido em vez de preservado por COALESCE.
    new.operator_id := v_operator_id;
    new.operator_name := v_operator_name;
    new.sector_id := v_department_id;
    new.department_name := v_department_name;

    new.status := case
      when new.closed_at is not null
        or (v_is_open = false and nullif(v_info->>'closed_at','') is not null)
        then 'finished'
      when v_operator_id is not null
        then 'in_att'
      when v_department_id is not null or v_is_att
        then 'inbox'
      else 'open'
    end;
  end if;

  -- protocol_new_inbox significa que o atendimento voltou para a fila. O
  -- projector antigo só atualizava a última mensagem no conflito e deixava o
  -- status/operador anteriores, fazendo a conversa sumir da aba Aguardando.
  if v_inbox_event_changed and new.closed_at is null then
    new.status := 'inbox';
    new.operator_id := null;
    new.operator_name := null;
  end if;

  -- A SAC também pode emitir protocol_in_att com operator=false ao devolver o
  -- atendimento para a fila. Não gravar a string "false" como nome de operador.
  if v_att_event_changed
     and new.closed_at is null
     and (
       new.raw_metadata->'operator' = 'false'::jsonb
       or new.raw_metadata->'operator' = 'null'::jsonb
       or new.raw_metadata->'operator' is null
     ) then
    new.status := 'inbox';
    new.operator_id := null;
    new.operator_name := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_sac_digital_protocol_state on public.sac_digital_protocols;
create trigger trg_normalize_sac_digital_protocol_state
before insert or update on public.sac_digital_protocols
for each row execute function private.normalize_sac_digital_protocol_state();

-- Corrige os protocolos ativos já sincronizados. A informação atual de
-- /protocol/info fica em raw_metadata.api_info.
update public.sac_digital_protocols p
set
  operator_id = nullif(pg_catalog.btrim(coalesce(p.raw_metadata->'api_info'->'operator'->>'id','')), ''),
  operator_name = nullif(pg_catalog.btrim(coalesce(p.raw_metadata->'api_info'->'operator'->>'name','')), ''),
  sector_id = nullif(pg_catalog.btrim(coalesce(p.raw_metadata->'api_info'->'department'->>'id','')), ''),
  department_name = nullif(pg_catalog.btrim(coalesce(p.raw_metadata->'api_info'->'department'->>'name','')), ''),
  status = case
    when p.closed_at is not null
      or (
        coalesce(nullif(p.raw_metadata->'api_info'->>'is_open','')::boolean,true) = false
        and nullif(p.raw_metadata->'api_info'->>'closed_at','') is not null
      )
      then 'finished'
    when nullif(pg_catalog.btrim(coalesce(p.raw_metadata->'api_info'->'operator'->>'id','')), '') is not null
      then 'in_att'
    when nullif(pg_catalog.btrim(coalesce(p.raw_metadata->'api_info'->'department'->>'id','')), '') is not null
      or coalesce(nullif(p.raw_metadata->'api_info'->>'is_att','')::boolean,false)
      then 'inbox'
    else 'open'
  end,
  updated_at = now()
where p.closed_at is null
  and jsonb_typeof(p.raw_metadata->'api_info') = 'object';

comment on function private.normalize_sac_digital_protocol_state()
is 'Normaliza fila/atendimento do SAC pela informação atual do protocolo e limpa operador obsoleto quando o atendimento volta para Aguardando.';

commit;
