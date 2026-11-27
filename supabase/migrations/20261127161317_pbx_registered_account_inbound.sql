-- One explicitly mapped public number per registered account.
-- Duplicate public DIDs are permitted only for identical destination and same registered contract.
do $migration$
declare body text:=pg_get_functiondef('private.pbx_validate_universal(uuid,jsonb)'::regprocedure);
 old_guard text:=$old$if exists(select 1 from jsonb_array_elements(d->'dids') a where a->>'id'<>r->>'id' and a->>'number'=r->>'number') then perform private.pbx_universal_error(); end if;$old$;
 new_guard text:=$new$if exists(select 1 from jsonb_array_elements(d->'dids') a
     where a->>'id'<>r->>'id' and a->>'number'=r->>'number'
     and not (a->>'connection_id'<>r->>'connection_id'
       and a->>'destination_id'=r->>'destination_id' and a->>'destination_kind'=r->>'destination_kind'
       and exists(select 1 from jsonb_array_elements(d->'connections') ca
         cross join jsonb_array_elements(d->'connections') cb
         where ca->>'id'=a->>'connection_id' and cb->>'id'=r->>'connection_id'
         and ca->>'auth_mode'='registration' and cb->>'auth_mode'='registration'
         and ca->>'provider_id'=cb->>'provider_id' and ca->>'contract_id'=cb->>'contract_id'
         and lower(ca->>'host')=lower(cb->>'host'))))
     then perform private.pbx_universal_error(); end if;$new$;
 tail text:=$tail$exception when invalid_text_representation or numeric_value_out_of_range then perform private.pbx_universal_error();$tail$;
 add_guard text:=$add$for r in select c from jsonb_array_elements(d->'connections') c
   join jsonb_array_elements(d->'providers') p on p->>'id'=c->>'provider_id'
   where c->'enabled'='true' and c->'inbound_enabled'='true' and p->'options'->>'did_source'='registered_account'
 loop
   if r->>'auth_mode'<>'registration' or (select count(*) from jsonb_array_elements(d->'dids') a where a->>'connection_id'=r->>'id' and a->'enabled'='true')<>1 then perform private.pbx_universal_error(); end if;
 end loop;
 $add$;
begin
 if strpos(body,old_guard)=0 or strpos(body,tail)=0 or strpos(body,$source$not in ('request_uri','to_header')$source$)=0 then raise exception 'Unexpected validator version'; end if;
 body:=replace(body,$source$not in ('request_uri','to_header')$source$,$source$not in ('request_uri','to_header','registered_account')$source$);
 body:=replace(body,old_guard,new_guard);
 body:=replace(body,tail,add_guard||tail);
 execute body;
end
$migration$;
