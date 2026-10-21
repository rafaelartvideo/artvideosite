-- Multiple stored sessions with a single active/connecting session per company.
-- Keep all existing session IDs, provider credentials and historical associations.
begin;
alter table public.whatsapp_channel_connections
  drop constraint if exists whatsapp_channel_connections_org_provider_unique;
create unique index if not exists whatsapp_channels_one_active_per_company
  on public.whatsapp_channel_connections(organization_id,provider)
  where state in ('connected','connecting');
create index if not exists whatsapp_channels_company_history
  on public.whatsapp_channel_connections(organization_id,provider,created_at desc);

create or replace function private.union_whatsapp_limit_connections()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare registered int;
begin
  perform pg_advisory_xact_lock(hashtext('union_whatsapp_sessions'),hashtext(new.organization_id::text));
  if tg_op='INSERT' then
    select count(*) into registered from public.whatsapp_channel_connections
      where organization_id=new.organization_id and provider=new.provider;
    if registered>=3 then
      raise exception 'Maximum of 3 WhatsApp sessions per company reached'
        using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.union_whatsapp_limit_connections() from public,anon,authenticated;
drop trigger if exists union_whatsapp_limit_connections on public.whatsapp_channel_connections;
create trigger union_whatsapp_limit_connections
  before insert on public.whatsapp_channel_connections
  for each row execute function private.union_whatsapp_limit_connections();
commit;