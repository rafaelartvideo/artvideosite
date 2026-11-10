-- Private recordings and explicitly dialled test flows only. No inbound/FVX changes.
begin;

create table public.pbx_audio_prompts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 label text not null check(char_length(btrim(label)) between 2 and 80),
 storage_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 duration_seconds numeric not null check(duration_seconds>0 and duration_seconds<=60),
 size_bytes integer not null check(size_bytes between 44 and 960044),
 status text not null default 'pending' check(status in ('pending','uploaded')),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 constraint pbx_audio_prompt_exact_path check(storage_path=organization_id::text||'/'||id::text||'.wav')
);
create index pbx_audio_prompts_org_created_idx on public.pbx_audio_prompts(organization_id,created_at desc);

create table public.pbx_call_flows (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 name text not null check(char_length(btrim(name)) between 2 and 80),
 test_extension integer not null check(test_extension between 100 and 9999 and test_extension not between 850 and 900),
 enabled boolean not null default false,
 config jsonb not null,
 provisioning_status text not null default 'pending' check(provisioning_status in ('pending','applied','failed')),
 last_error text,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(organization_id,test_extension)
);
create index pbx_call_flows_org_updated_idx on public.pbx_call_flows(organization_id,updated_at desc);
create index pbx_call_flows_pending_idx on public.pbx_call_flows(organization_id,updated_at) where provisioning_status='pending';

alter table public.pbx_audio_prompts enable row level security;
alter table public.pbx_call_flows enable row level security;
revoke all on public.pbx_audio_prompts,public.pbx_call_flows from public,anon,authenticated;
grant select on public.pbx_audio_prompts,public.pbx_call_flows to authenticated;
grant all on public.pbx_audio_prompts,public.pbx_call_flows to service_role;
create policy pbx_audio_prompts_read on public.pbx_audio_prompts for select to authenticated
 using(private.pbx_has_permission(organization_id,'pbx.view'));
create policy pbx_call_flows_read on public.pbx_call_flows for select to authenticated
 using(private.pbx_has_permission(organization_id,'pbx.view'));

create function private.pbx_flow_target_valid(p_org uuid,p_target jsonb,p_ready boolean)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text; dest uuid;
begin
 if jsonb_typeof(p_target) is distinct from 'object' then return false; end if;
 k=p_target->>'kind';
 if k='hangup' then return p_target='{"kind":"hangup"}'::jsonb; end if;
 if k not in ('extension','queue') or k is null or not(p_target ?& array['kind','id'])
  or (p_target-array['kind','id'])<>'{}'::jsonb or jsonb_typeof(p_target->'id') is distinct from 'string' then return false; end if;
 begin dest=(p_target->>'id')::uuid; exception when invalid_text_representation then return false; end;
 if k='extension' then
  return exists(select 1 from public.pbx_extensions e where e.id=dest and e.organization_id=p_org
   and (not p_ready or (e.desired_enabled and (e.provisioning_status='applied'
    or (private.is_platform_organization(p_org) and not e.is_managed and e.number=301
      and e.endpoint_name='union-301' and e.provisioning_status='manual')))));
 end if;
 return exists(select 1 from public.pbx_queues q where q.id=dest and q.organization_id=p_org
  and (not p_ready or (q.enabled and q.provisioning_status='applied')));
end;
$$;

create function private.pbx_prompt_object_ready(p_prompt uuid,p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pbx_audio_prompts p join storage.objects o
  on o.bucket_id='pbx-audio-prompts' and o.name=p.storage_path
  where p.id=p_prompt and p.organization_id=p_org and p.status='uploaded'
   and o.metadata->>'mimetype'='audio/wav'
   and case when o.metadata->>'size' ~ '^[0-9]{1,9}$'
     then (o.metadata->>'size')::bigint=p.size_bytes else false end);
$$;

create function private.pbx_validate_flow_config(p_org uuid,p_config jsonb,p_ready boolean)
returns void language plpgsql security definer set search_path='' as $$
declare keys text[]=array['version','mode','prompt_id','closed_prompt_id','options','fallback','closed_target',
 'timezone','schedule_enabled','windows','holidays','timeout_seconds','repeats']; item jsonb; d jsonb;
 prompt uuid; seen text[]='{}'; txt text; holiday date;
begin
 if jsonb_typeof(p_config) is distinct from 'object' or not(p_config ?& keys)
  or (p_config-keys)<>'{}'::jsonb or p_config->'version'<>'1'::jsonb
  or p_config->>'mode' not in ('menu','direct') or jsonb_typeof(p_config->'mode')<>'string'
  or jsonb_typeof(p_config->'schedule_enabled')<>'boolean'
  or jsonb_typeof(p_config->'timezone')<>'string'
  or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_config->>'timezone')
  or jsonb_typeof(p_config->'timeout_seconds')<>'number'
  or (p_config->>'timeout_seconds') !~ '^(5|[6-9]|[12][0-9]|30)$'
  or jsonb_typeof(p_config->'repeats')<>'number' or (p_config->>'repeats') !~ '^[0-3]$'
  or jsonb_typeof(p_config->'options')<>'array' or jsonb_typeof(p_config->'windows')<>'array'
  or jsonb_typeof(p_config->'holidays')<>'array' then
  raise exception 'Configuracao de fluxo invalida.' using errcode='23514';
 end if;
 if jsonb_array_length(p_config->'options')>10 or jsonb_array_length(p_config->'windows')>28
  or jsonb_array_length(p_config->'holidays')>366
  or (p_config->'schedule_enabled'='true'::jsonb and jsonb_array_length(p_config->'windows')=0)
  or (p_config->>'mode'='menu' and (p_config->'prompt_id'='null'::jsonb or jsonb_array_length(p_config->'options')=0))
  or (p_config->>'mode'='direct' and (p_config->'prompt_id'<>'null'::jsonb or jsonb_array_length(p_config->'options')<>0)) then
  raise exception 'Menu, aviso ou limites invalidos.' using errcode='23514';
 end if;
 foreach txt in array array['prompt_id','closed_prompt_id'] loop
  if p_config->txt<>'null'::jsonb then
   if jsonb_typeof(p_config->txt)<>'string' then raise exception 'Aviso invalido.' using errcode='23514'; end if;
   begin prompt=(p_config->>txt)::uuid; exception when invalid_text_representation then
    raise exception 'Aviso invalido.' using errcode='23514'; end;
   if not exists(select 1 from public.pbx_audio_prompts where id=prompt and organization_id=p_org)
    or (p_ready and not private.pbx_prompt_object_ready(prompt,p_org)) then
    raise exception 'Aviso de outra empresa ou upload incompleto.' using errcode='23514';
   end if;
  end if;
 end loop;
 if not private.pbx_flow_target_valid(p_org,p_config->'fallback',p_ready)
  or not private.pbx_flow_target_valid(p_org,p_config->'closed_target',p_ready) then
  raise exception 'Destino indisponivel ou de outra empresa.' using errcode='23514';
 end if;
 for item in select value from jsonb_array_elements(p_config->'options') loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['digit','target'])
   or (item-array['digit','target'])<>'{}'::jsonb or jsonb_typeof(item->'digit')<>'string'
   or (item->>'digit') !~ '^[0-9]$' or item->>'digit'=any(seen)
   or not private.pbx_flow_target_valid(p_org,item->'target',p_ready) then
   raise exception 'Opcao de menu invalida.' using errcode='23514';
  end if;
  seen=array_append(seen,item->>'digit');
 end loop;
 for item in select value from jsonb_array_elements(p_config->'windows') loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['days','start','end'])
   or (item-array['days','start','end'])<>'{}'::jsonb or jsonb_typeof(item->'days')<>'array'
   or jsonb_typeof(item->'start')<>'string' or jsonb_typeof(item->'end')<>'string'
   or (item->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or (item->>'end') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
   or item->>'start'=item->>'end' then
   raise exception 'Janela de horario invalida.' using errcode='23514';
  end if;
  if jsonb_array_length(item->'days') not between 1 and 7 then raise exception 'Dias invalidos.' using errcode='23514'; end if;
  seen='{}';
  for d in select value from jsonb_array_elements(item->'days') loop
   if jsonb_typeof(d)<>'number' or d::text !~ '^[1-7]$' or d::text=any(seen) then
    raise exception 'Dias invalidos.' using errcode='23514'; end if;
   seen=array_append(seen,d::text);
  end loop;
 end loop;
 seen='{}';
 for item in select value from jsonb_array_elements(p_config->'holidays') loop
  txt=item#>>'{}';
  if jsonb_typeof(item)<>'string' or txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or txt=any(seen) then
   raise exception 'Feriado invalido.' using errcode='23514'; end if;
  begin holiday=txt::date; exception when others then raise exception 'Feriado invalido.' using errcode='23514'; end;
  if to_char(holiday,'YYYY-MM-DD')<>txt then raise exception 'Feriado invalido.' using errcode='23514'; end if;
  seen=array_append(seen,txt);
 end loop;
end;
$$;

-- Single organization lock orders activation, number reservation and dependency changes.
create function private.pbx_flow_uses_target(p_config jsonb,p_kind text,p_id uuid)
returns boolean language sql immutable set search_path='' as $$
 select p_config->'fallback' @> jsonb_build_object('kind',p_kind,'id',p_id)
  or p_config->'closed_target' @> jsonb_build_object('kind',p_kind,'id',p_id)
  or exists(select 1 from jsonb_array_elements(p_config->'options') v
    where v->'target' @> jsonb_build_object('kind',p_kind,'id',p_id));
$$;
create function private.pbx_guard_number_and_flow_dependencies()
returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid; row_id uuid; n integer; kind text; blocked boolean=false;
begin
 if tg_op='DELETE' then org=old.organization_id; row_id=old.id;
 else org=new.organization_id; row_id=new.id; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pbx-routing:'||org::text,0));
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then
  raise exception 'Empresa PBX imutavel.' using errcode='23514'; end if;
 if tg_table_name='pbx_extensions' then
  kind='extension';
  if tg_op<>'DELETE' then n=new.number; end if;
  if tg_op='DELETE' then blocked=true;
  elsif tg_op='UPDATE' then blocked=not new.desired_enabled or new.number<>old.number; end if;
 elsif tg_table_name='pbx_queues' then
  kind='queue';
  if tg_op<>'DELETE' then n=new.test_extension; end if;
  if tg_op='DELETE' then blocked=true;
  elsif tg_op='UPDATE' then blocked=not new.enabled or new.test_extension<>old.test_extension; end if;
 else
  kind='flow'; if tg_op<>'DELETE' then n=new.test_extension; end if;
 end if;
 if blocked and exists(select 1 from public.pbx_call_flows f where f.organization_id=org and f.enabled
  and private.pbx_flow_uses_target(f.config,kind,row_id)) then
  raise exception 'Destino usado em fluxo ativo; remova a dependencia primeiro.' using errcode='23514'; end if;
 if tg_op='DELETE' then return old; end if;
 if n=900 or (tg_table_name<>'pbx_extensions' and exists(select 1 from public.pbx_extensions where organization_id=org and number=n))
  or (tg_table_name<>'pbx_queues' and exists(select 1 from public.pbx_queues where organization_id=org and test_extension=n))
  or (tg_table_name<>'pbx_call_flows' and exists(select 1 from public.pbx_call_flows where organization_id=org and test_extension=n)) then
  raise exception 'Numero PBX ja reservado.' using errcode='23505'; end if;
 return new;
end;
$$;
create trigger pbx_extensions_flow_number_guard before insert or update or delete on public.pbx_extensions
 for each row execute function private.pbx_guard_number_and_flow_dependencies();
create trigger pbx_queues_flow_number_guard before insert or update or delete on public.pbx_queues
 for each row execute function private.pbx_guard_number_and_flow_dependencies();
create trigger pbx_call_flows_number_guard before insert or update or delete on public.pbx_call_flows
 for each row execute function private.pbx_guard_number_and_flow_dependencies();

create function private.pbx_guard_call_flow()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pbx-routing:'||new.organization_id::text,0));
 if tg_op='UPDATE' then
  if new.id<>old.id or new.organization_id<>old.organization_id or new.created_at<>old.created_at then
   raise exception 'Identidade do fluxo imutavel.' using errcode='23514'; end if;
  -- Signed service reports change only outcome fields. They must still be able
  -- to report a failed asset, without revalidating it or changing job identity.
  if (to_jsonb(new)-array['provisioning_status','last_error'])=
    (to_jsonb(old)-array['provisioning_status','last_error']) then
   new.updated_at=old.updated_at; return new;
  end if;
  -- Disable remains possible when an old asset/target no longer passes validation.
  if not new.enabled and new.config=old.config then
   new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond'); return new;
  end if;
 end if;
 perform private.pbx_validate_flow_config(new.organization_id,new.config,new.enabled);
 if tg_op='INSERT' then new.updated_at=clock_timestamp();
 else new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond'); end if;
 return new;
end;
$$;
create trigger pbx_call_flows_validate before insert or update on public.pbx_call_flows
 for each row execute function private.pbx_guard_call_flow();

create function private.pbx_guard_audio_prompt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') or old.status='uploaded' and new.status<>'uploaded' then
  raise exception 'Metadados do aviso imutaveis.' using errcode='23514'; end if;
 return new;
end;
$$;
create trigger pbx_audio_prompts_immutable before update on public.pbx_audio_prompts
 for each row execute function private.pbx_guard_audio_prompt();

create function private.pbx_create_audio_prompt(p_organization_id uuid,p_label text,p_sha256 text,p_duration_seconds numeric,p_size_bytes integer)
returns public.pbx_audio_prompts language plpgsql security definer set search_path='' as $$
declare result public.pbx_audio_prompts; prompt uuid=gen_random_uuid();
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Sem permissao PABX.' using errcode='42501'; end if;
 insert into public.pbx_audio_prompts(id,organization_id,label,storage_path,sha256,duration_seconds,size_bytes,created_by)
 values(prompt,p_organization_id,btrim(p_label),p_organization_id::text||'/'||prompt::text||'.wav',p_sha256,p_duration_seconds,p_size_bytes,auth.uid()) returning * into result;
 return result;
end;
$$;
create function private.pbx_finish_audio_prompt_upload(p_organization_id uuid,p_prompt_id uuid)
returns public.pbx_audio_prompts language plpgsql security definer set search_path='' as $$
declare result public.pbx_audio_prompts;
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Sem permissao PABX.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pbx-routing:'||p_organization_id::text,0));
 select * into result from public.pbx_audio_prompts where id=p_prompt_id and organization_id=p_organization_id for update;
 if not found or not exists(select 1 from storage.objects o where o.bucket_id='pbx-audio-prompts' and o.name=result.storage_path
  and o.metadata->>'mimetype'='audio/wav' and case when o.metadata->>'size' ~ '^[0-9]{1,9}$'
   then (o.metadata->>'size')::bigint=result.size_bytes else false end) then
  raise exception 'Upload do aviso ausente ou invalido.' using errcode='23514'; end if;
 update public.pbx_audio_prompts set status='uploaded' where id=result.id returning * into result;
 return result;
end;
$$;
create function private.pbx_delete_audio_prompt(p_organization_id uuid,p_prompt_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare path text;
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Sem permissao PABX.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pbx-routing:'||p_organization_id::text,0));
 select storage_path into path from public.pbx_audio_prompts where id=p_prompt_id and organization_id=p_organization_id for update;
 if not found then raise exception 'Aviso inexistente.' using errcode='23514'; end if;
 if exists(select 1 from storage.objects where bucket_id='pbx-audio-prompts' and name=path)
  or exists(select 1 from public.pbx_call_flows where organization_id=p_organization_id and enabled
    and (config->>'prompt_id'=p_prompt_id::text or config->>'closed_prompt_id'=p_prompt_id::text)) then
  raise exception 'Remova o arquivo pelo Storage e as dependencias ativas primeiro.' using errcode='23514'; end if;
 delete from public.pbx_audio_prompts where id=p_prompt_id and organization_id=p_organization_id;
end;
$$;

create function private.pbx_save_call_flow(p_organization_id uuid,p_flow_id uuid,p_name text,p_test_extension integer,p_enabled boolean,p_config jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Sem permissao PABX.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pbx-routing:'||p_organization_id::text,0));
 if p_flow_id is null then
  insert into public.pbx_call_flows(organization_id,name,test_extension,enabled,config)
  values(p_organization_id,btrim(p_name),p_test_extension,p_enabled,p_config) returning id into result;
 else
  update public.pbx_call_flows set name=btrim(p_name),test_extension=p_test_extension,enabled=p_enabled,config=p_config,
   provisioning_status='pending',last_error=null,
   updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
   where id=p_flow_id and organization_id=p_organization_id returning id into result;
  if not found then raise exception 'Fluxo inexistente.' using errcode='23514'; end if;
 end if;
 return result;
end;
$$;
create function private.pbx_retry_call_flow(p_organization_id uuid,p_flow_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Sem permissao PABX.' using errcode='42501'; end if;
 update public.pbx_call_flows set provisioning_status='pending',last_error=null,
  updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
 where organization_id=p_organization_id and id=p_flow_id;
 if not found then raise exception 'Fluxo inexistente.' using errcode='23514'; end if;
end;
$$;

create function private.pbx_list_audio_prompts(p_organization_id uuid)
returns setof public.pbx_audio_prompts language plpgsql stable security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.view') then raise exception 'Sem permissao PABX.' using errcode='42501'; end if;
 return query select * from public.pbx_audio_prompts where organization_id=p_organization_id order by created_at desc;
end;
$$;
create function private.pbx_list_call_flows(p_organization_id uuid)
returns setof public.pbx_call_flows language plpgsql stable security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.view') then raise exception 'Sem permissao PABX.' using errcode='42501'; end if;
 return query select * from public.pbx_call_flows where organization_id=p_organization_id order by updated_at desc;
end;
$$;
create function private.pbx_available_test_flows(p_organization_id uuid)
returns table(id uuid,name text,test_extension integer) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.view') then raise exception 'Sem permissao PABX.' using errcode='42501'; end if;
 return query select f.id,f.name,f.test_extension from public.pbx_call_flows f
 where f.organization_id=p_organization_id and f.enabled and f.provisioning_status='applied' order by f.test_extension;
end;
$$;

-- Storage policy helpers never parse caller-supplied paths as UUIDs.
create function private.pbx_prompt_storage_access(p_name text,p_action text)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.pbx_audio_prompts;
begin
 select * into p from public.pbx_audio_prompts where storage_path=p_name;
 if not found then return false; end if;
 if p_action='read' then return private.pbx_has_permission(p.organization_id,'pbx.view'); end if;
 if p_action not in ('insert','delete') or not private.pbx_has_permission(p.organization_id,'pbx.manage') then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pbx-routing:'||p.organization_id::text,0));
 -- Recheck the full row after lock: finalization/deletion may have completed.
 select * into p from public.pbx_audio_prompts where storage_path=p_name;
 if not found then return false; end if;
 if p_action='insert' then return p.status='pending'; end if;
 return not exists(select 1 from public.pbx_call_flows f where f.organization_id=p.organization_id and f.enabled
  and (f.config->>'prompt_id'=p.id::text or f.config->>'closed_prompt_id'=p.id::text));
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('pbx-audio-prompts','pbx-audio-prompts',false,1000000,array['audio/wav'])
 on conflict(id) do update set public=false,file_size_limit=1000000,allowed_mime_types=array['audio/wav'];
create policy pbx_prompt_objects_read on storage.objects for select to authenticated
 using(bucket_id='pbx-audio-prompts' and private.pbx_prompt_storage_access(name,'read'));
create policy pbx_prompt_objects_insert on storage.objects for insert to authenticated
 with check(bucket_id='pbx-audio-prompts' and private.pbx_prompt_storage_access(name,'insert'));
create policy pbx_prompt_objects_delete on storage.objects for delete to authenticated
 using(bucket_id='pbx-audio-prompts' and private.pbx_prompt_storage_access(name,'delete'));
-- Restrictive guards prevent a pre-existing broad Storage policy from widening this bucket.
create policy pbx_prompt_objects_read_guard on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'pbx-audio-prompts' or private.pbx_prompt_storage_access(name,'read'));
create policy pbx_prompt_objects_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'pbx-audio-prompts' or private.pbx_prompt_storage_access(name,'insert'));
create policy pbx_prompt_objects_delete_guard on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'pbx-audio-prompts' or private.pbx_prompt_storage_access(name,'delete'));
create policy pbx_prompt_objects_no_overwrite on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'pbx-audio-prompts') with check(bucket_id<>'pbx-audio-prompts');

-- Every new private function has explicit ACLs; only the public invoker facades
-- and Storage RLS helper are callable by authenticated actors.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('pbx_flow_target_valid','pbx_prompt_object_ready','pbx_validate_flow_config',
  'pbx_flow_uses_target','pbx_guard_number_and_flow_dependencies','pbx_guard_call_flow','pbx_guard_audio_prompt',
  'pbx_create_audio_prompt','pbx_finish_audio_prompt_upload','pbx_delete_audio_prompt','pbx_save_call_flow',
  'pbx_retry_call_flow','pbx_list_audio_prompts','pbx_list_call_flows','pbx_available_test_flows','pbx_prompt_storage_access') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function private.pbx_prompt_storage_access(text,text) to authenticated;

create function public.pbx_create_audio_prompt(p_organization_id uuid,p_label text,p_sha256 text,p_duration_seconds numeric,p_size_bytes integer)
returns public.pbx_audio_prompts language sql security invoker set search_path='' as $$
 select private.pbx_create_audio_prompt(p_organization_id,p_label,p_sha256,p_duration_seconds,p_size_bytes); $$;
create function public.pbx_finish_audio_prompt_upload(p_organization_id uuid,p_prompt_id uuid)
returns public.pbx_audio_prompts language sql security invoker set search_path='' as $$
 select private.pbx_finish_audio_prompt_upload(p_organization_id,p_prompt_id); $$;
create function public.pbx_delete_audio_prompt(p_organization_id uuid,p_prompt_id uuid)
returns void language sql security invoker set search_path='' as $$ select private.pbx_delete_audio_prompt(p_organization_id,p_prompt_id); $$;
create function public.pbx_save_call_flow(p_organization_id uuid,p_flow_id uuid,p_name text,p_test_extension integer,p_enabled boolean,p_config jsonb)
returns uuid language sql security invoker set search_path='' as $$
 select private.pbx_save_call_flow(p_organization_id,p_flow_id,p_name,p_test_extension,p_enabled,p_config); $$;
create function public.pbx_retry_call_flow(p_organization_id uuid,p_flow_id uuid)
returns void language sql security invoker set search_path='' as $$ select private.pbx_retry_call_flow(p_organization_id,p_flow_id); $$;
create function public.pbx_list_audio_prompts(p_organization_id uuid)
returns setof public.pbx_audio_prompts language sql stable security invoker set search_path='' as $$ select * from private.pbx_list_audio_prompts(p_organization_id); $$;
create function public.pbx_list_call_flows(p_organization_id uuid)
returns setof public.pbx_call_flows language sql stable security invoker set search_path='' as $$ select * from private.pbx_list_call_flows(p_organization_id); $$;
create function public.pbx_available_test_flows(p_organization_id uuid)
returns table(id uuid,name text,test_extension integer) language sql stable security invoker set search_path='' as $$ select * from private.pbx_available_test_flows(p_organization_id); $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.proname in ('pbx_create_audio_prompt','pbx_finish_audio_prompt_upload',
   'pbx_delete_audio_prompt','pbx_save_call_flow','pbx_retry_call_flow','pbx_list_audio_prompts','pbx_list_call_flows','pbx_available_test_flows') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

-- Preserve tenant admission, replay checks and the poll-only capability lease.
-- The sole protocol change here admits the signed flow outcome action.
create or replace function private.pbx_admit_agent_request(p_agent_id uuid,p_sequence bigint,p_action text,
 p_protocol_version integer,p_profile_id text,p_profile_context text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pbx_agents%rowtype; platform boolean; valid boolean;
begin
 select * into a from public.pbx_agents where id=p_agent_id for update;
 if not found or not a.enabled or p_sequence is null or p_sequence<=0 or a.last_sequence is distinct from p_sequence then
  return jsonb_build_object('allowed',false);
 end if;
 platform=private.is_platform_organization(a.organization_id);
 if p_action='poll' then
  valid=private.pbx_org_enabled(a.organization_id) and (
   (platform and p_protocol_version=2 and p_profile_id is null and p_profile_context is null)
   or (not platform and p_protocol_version=3 and p_profile_id=a.organization_id::text
    and p_profile_context='uwi-'||replace(a.organization_id::text,'-','')));
  update public.pbx_agents set
   protocol_version=case when p_protocol_version in (1,2,3) then p_protocol_version else 1 end,
   profile_id=case when coalesce(valid,false) and not platform then a.organization_id else null end,
   profile_context=case when coalesce(valid,false) and not platform then p_profile_context else null end,
   capability_seen_at=case when coalesce(valid,false) then now() else null end
  where id=a.id;
  return jsonb_build_object('allowed',coalesce(valid,false),'is_platform',platform);
 end if;
 if (p_protocol_version is not null and p_protocol_version<>a.protocol_version)
  or (p_profile_id is not null and p_profile_id is distinct from a.profile_id::text)
  or (p_profile_context is not null and p_profile_context is distinct from a.profile_context) then
  return jsonb_build_object('allowed',false,'is_platform',platform);
 end if;
 return jsonb_build_object('allowed',p_action in ('report','report_login','report_queue','report_calls','report_availability','report_flow')
  and private.pbx_agent_runtime_ready(a.id),'is_platform',platform);
end;
$$;
-- CREATE OR REPLACE preserves existing ownership/ACL; repeat the intended ACL
-- explicitly so a deployment never widens admission to browser callers.
revoke all on function private.pbx_admit_agent_request(uuid,bigint,text,integer,text,text) from public,anon,authenticated;
grant execute on function private.pbx_admit_agent_request(uuid,bigint,text,integer,text,text) to service_role;
commit;
