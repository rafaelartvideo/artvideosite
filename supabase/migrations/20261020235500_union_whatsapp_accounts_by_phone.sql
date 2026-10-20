-- Account separation for the Union World WhatsApp inbox; no deletions.
begin;
alter table public.union_whatsapp_contacts add column if not exists account_phone text;
alter table public.union_whatsapp_conversations add column if not exists account_phone text;
alter table public.union_whatsapp_messages add column if not exists account_phone text;
update public.union_whatsapp_contacts t set account_phone=c.phone from public.whatsapp_channel_connections c
 where t.channel_id=c.id and t.organization_id=c.organization_id and t.account_phone is null and c.phone ~ '^[0-9]{10,15}$';
update public.union_whatsapp_conversations t set account_phone=c.phone from public.whatsapp_channel_connections c
 where t.channel_id=c.id and t.organization_id=c.organization_id and t.account_phone is null and c.phone ~ '^[0-9]{10,15}$';
update public.union_whatsapp_messages t set account_phone=c.phone from public.whatsapp_channel_connections c
 where t.channel_id=c.id and t.organization_id=c.organization_id and t.account_phone is null and c.phone ~ '^[0-9]{10,15}$';
do $guard$
begin
  if exists(select 1 from public.union_whatsapp_contacts where account_phone is null)
    or exists(select 1 from public.union_whatsapp_conversations where account_phone is null)
    or exists(select 1 from public.union_whatsapp_messages where account_phone is null) then
    raise exception 'account_phone_backfill_failed';
  end if;
end;
$guard$;
alter table public.union_whatsapp_contacts alter column account_phone set not null;
alter table public.union_whatsapp_conversations alter column account_phone set not null;
alter table public.union_whatsapp_messages alter column account_phone set not null;
alter table public.union_whatsapp_contacts add constraint union_wa_contacts_account_phone_chk check (account_phone ~ '^[0-9]{10,15}$');
alter table public.union_whatsapp_conversations add constraint union_wa_conversations_account_phone_chk check (account_phone ~ '^[0-9]{10,15}$');
alter table public.union_whatsapp_messages add constraint union_wa_messages_account_phone_chk check (account_phone ~ '^[0-9]{10,15}$');
alter table public.union_whatsapp_contacts drop constraint union_whatsapp_contacts_channel_id_chat_jid_key;
alter table public.union_whatsapp_contacts add constraint union_wa_contacts_account_jid_key unique(channel_id,account_phone,chat_jid);
alter table public.union_whatsapp_conversations drop constraint union_whatsapp_conversations_channel_id_chat_jid_key;
alter table public.union_whatsapp_conversations add constraint union_wa_conversations_account_jid_key unique(channel_id,account_phone,chat_jid);
alter table public.union_whatsapp_messages drop constraint union_whatsapp_messages_channel_id_provider_message_id_key;
alter table public.union_whatsapp_messages add constraint union_wa_messages_account_provider_key unique(channel_id,account_phone,provider_message_id);
alter table public.union_whatsapp_conversations
 add constraint union_wa_conversations_id_account_fk_key unique(id,organization_id,channel_id,account_phone);
alter table public.union_whatsapp_messages
 add constraint union_wa_messages_conversation_account_fk
 foreign key(conversation_id,organization_id,channel_id,account_phone)
 references public.union_whatsapp_conversations(id,organization_id,channel_id,account_phone) on delete cascade;
create index if not exists union_wa_contacts_account_recent_idx on public.union_whatsapp_contacts(organization_id,channel_id,account_phone,updated_at desc);
create index if not exists union_wa_conversations_account_recent_idx on public.union_whatsapp_conversations(organization_id,channel_id,account_phone,last_message_at desc nulls last);

CREATE OR REPLACE FUNCTION public.union_whatsapp_apply_contact_names(p_organization uuid, p_channel uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare changed integer;
begin
  if auth.role()<>'service_role' and current_user<>'postgres' then
    raise exception 'access_denied';
  end if;
  with preferred as (
    select c.id,c.contact_name,c.contact_phone,
      a.display_name,a.device_name,a.imported_name,a.profile_name,
      a.wuzapi_verified_saved
    from public.union_whatsapp_conversations c
    join lateral (
      select a.display_name,a.device_name,a.imported_name,
        a.profile_name,a.wuzapi_verified_saved
      from public.union_whatsapp_contacts a
      where a.organization_id=c.organization_id and a.channel_id=c.channel_id
        and a.account_phone=c.account_phone
        and (a.chat_jid=c.chat_jid or (
          c.contact_phone is not null and c.contact_phone<>''
          and a.contact_phone=c.contact_phone
          and a.chat_jid like '%@s.whatsapp.net'
        ))
      order by (case
        when nullif(btrim(a.display_name),'') is not null then 3
        when nullif(btrim(a.device_name),'') is not null then 2
        when a.wuzapi_verified_saved and nullif(btrim(a.imported_name),'') is not null then 1
        else 0 end) desc,
        (a.chat_jid=c.chat_jid) desc
      limit 1
    ) a on true
    where c.organization_id=p_organization and c.channel_id=p_channel
      and exists(select 1 from public.whatsapp_channel_connections ch where ch.id=c.channel_id and ch.organization_id=c.organization_id and ch.state='connected' and ch.phone=c.account_phone)
  ), chosen as (
    select id,contact_name,
      coalesce(nullif(btrim(display_name),''),
               nullif(btrim(device_name),''),
               case when wuzapi_verified_saved
                 then nullif(btrim(imported_name),'') else null end) as proposed,
      nullif(btrim(display_name),'') is not null as manual,
      contact_phone,profile_name
    from preferred
  )
  update public.union_whatsapp_conversations c
  set contact_name=p.proposed,updated_at=now()
  from chosen p
  where c.id=p.id and p.proposed is not null
    and c.contact_name is distinct from p.proposed
    and (
      p.manual
      or c.contact_name is null or c.contact_name='Contato WhatsApp'
      or c.contact_name=p.contact_phone
      or c.contact_name=p.profile_name
      or exists(
        select 1 from public.union_whatsapp_messages m
        where m.conversation_id=c.id and m.direction='incoming'
          and m.sender_name=c.contact_name
      )
    );
  get diagnostics changed=row_count;
  return changed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.union_whatsapp_import_contacts_batch(p_organization uuid, p_channel uuid, p_contacts jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare processed integer; v_account text;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'access_denied';
  end if;
  if p_contacts is null or jsonb_typeof(p_contacts)<>'array'
      or jsonb_array_length(p_contacts)>250
      or jsonb_array_length(p_contacts)<1 then
    raise exception 'invalid_batch';
  end if;
  select c.phone into v_account from public.whatsapp_channel_connections c
  where c.id=p_channel and c.organization_id=p_organization
    and c.provider='wuzapi' and c.state='connected' and c.webhook_ready;
  if v_account is null or v_account !~ '^[0-9]{10,15}$' then
    raise exception 'channel_not_connected';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_contacts) as item(value)
    where item.value->>'account_phone' is distinct from v_account
  ) then
    raise exception 'account_mismatch';
  end if;

  with valid as (
    select distinct on (x.phone)
      x.phone as phone,
      left(btrim(regexp_replace(x.name,'[[:space:]]+',' ','g')),160) as name
    from jsonb_to_recordset(p_contacts) as x(name text,phone text)
    where x.phone ~ '^55[1-9][0-9][0-9]{8,9}$'
      and x.name is not null and length(btrim(x.name)) between 2 and 160
    order by x.phone
  )
  insert into public.union_whatsapp_contacts(
    organization_id,channel_id,account_phone,chat_jid,contact_phone,device_name,updated_at
  )
  select p_organization,p_channel,v_account,
    valid.phone||'@s.whatsapp.net',valid.phone,valid.name,now()
  from valid
  on conflict (channel_id,account_phone,chat_jid) do update
    set device_name=excluded.device_name,
        contact_phone=coalesce(excluded.contact_phone,
                               public.union_whatsapp_contacts.contact_phone),
        updated_at=now();
  get diagnostics processed=row_count;
  return processed;
end;
$function$
;

alter policy union_whatsapp_conversations_read on public.union_whatsapp_conversations
using (((private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.view'::text) AND (private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.manage'::text) OR ((EXISTS ( SELECT 1
   FROM union_whatsapp_operator_bindings binding
  WHERE ((binding.organization_id = union_whatsapp_conversations.organization_id) AND (binding.user_id = ( SELECT auth.uid() AS uid)) AND (binding.is_active = true)))) AND ((assigned_to = ( SELECT auth.uid() AS uid)) OR ((status = 'waiting'::text) AND (assigned_to IS NULL) AND ((department_id IS NULL) OR (EXISTS ( SELECT 1
   FROM union_whatsapp_department_members dept
  WHERE ((dept.organization_id = union_whatsapp_conversations.organization_id) AND (dept.department_id = union_whatsapp_conversations.department_id) AND (dept.user_id = ( SELECT auth.uid() AS uid)))))))))))) and exists(
 select 1 from public.whatsapp_channel_connections active
 where active.id=union_whatsapp_conversations.channel_id
 and active.organization_id=union_whatsapp_conversations.organization_id
 and active.phone=union_whatsapp_conversations.account_phone and active.state='connected'
));

alter policy union_whatsapp_messages_read on public.union_whatsapp_messages
using (((private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.view'::text) AND (EXISTS ( SELECT 1
   FROM union_whatsapp_conversations thread
  WHERE ((thread.id = union_whatsapp_messages.conversation_id) AND (thread.organization_id = union_whatsapp_messages.organization_id) AND (thread.channel_id = union_whatsapp_messages.channel_id)))))) and exists(
 select 1 from public.whatsapp_channel_connections active
 where active.id=union_whatsapp_messages.channel_id
 and active.organization_id=union_whatsapp_messages.organization_id
 and active.phone=union_whatsapp_messages.account_phone and active.state='connected'
));

commit;
