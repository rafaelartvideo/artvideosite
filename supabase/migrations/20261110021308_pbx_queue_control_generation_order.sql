-- Ordering comes from a locked row counter, not wall clocks or random UUIDs.
alter table public.pbx_queue_member_controls add column request_generation bigint not null default 1
 check(request_generation>0);
create function private.pbx_queue_control_generation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.request_generation=1;
 elsif new.revision is distinct from old.revision then new.request_generation=old.request_generation+1;
 else new.request_generation=old.request_generation;
 end if;
 return new;
end;
$$;
revoke all on function private.pbx_queue_control_generation() from public,anon,authenticated;
create trigger pbx_queue_control_generation before insert or update on public.pbx_queue_member_controls
 for each row execute function private.pbx_queue_control_generation();
