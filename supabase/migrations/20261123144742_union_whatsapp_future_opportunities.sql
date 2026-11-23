-- Union World: oportunidades persistentes por contato/empresa, sem envio automatico.
begin;
create table if not exists public.union_whatsapp_future_opportunities(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 channel_id uuid not null references public.whatsapp_channel_connections(id) on delete restrict,
 account_phone text not null,
 chat_jid text not null,
 contact_id uuid references public.union_whatsapp_contacts(id) on delete set null,
 conversation_id uuid references public.union_whatsapp_conversations(id) on delete set null,
 contact_name text not null default 'Contato WhatsApp',
 contact_phone text,
 equipment_type text not null default '',
 service_interest text not null check(length(btrim(service_interest)) between 2 and 180),
 reason text not null default 'service_unavailable'
  check(reason in ('service_unavailable','equipment_unavailable','capacity','other')),
 notes text not null default '' check(length(notes)<=2000),
 status text not null default 'waiting'
  check(status in ('waiting','available','contacted','converted','lost')),
 consent_to_contact boolean not null default false,
 consent_recorded_at timestamptz,
 consent_source text not null default 'manual_whatsapp'
  check(consent_source in ('manual_whatsapp','manual_in_person','other')),
 service_type_id uuid references public.service_types(id) on delete set null,
 service_order_id uuid references public.service_orders(id) on delete set null,
 last_contact_at timestamptz,
 converted_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint future_opportunity_chat_jid_nonempty check(length(btrim(chat_jid)) between 7 and 96),
 constraint future_opportunity_equipment_length check(length(equipment_type)<=160)
);
create index if not exists union_wa_future_org_status_idx
 on public.union_whatsapp_future_opportunities(organization_id,status,updated_at desc,id);
create index if not exists union_wa_future_contact_idx
 on public.union_whatsapp_future_opportunities(organization_id,channel_id,account_phone,chat_jid,created_at desc);
create index if not exists union_wa_future_service_idx
 on public.union_whatsapp_future_opportunities(organization_id,lower(btrim(service_interest)))
 where status='waiting';
create table if not exists public.union_whatsapp_future_opportunity_history(
 id bigint generated always as identity primary key,
 opportunity_id uuid not null references public.union_whatsapp_future_opportunities(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 action text not null check(action in ('created','updated','status','consent')),
 before_value jsonb not null default '{}'::jsonb,
 after_value jsonb not null default '{}'::jsonb,
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists union_wa_future_history_idx
 on public.union_whatsapp_future_opportunity_history(opportunity_id,created_at desc);

CREATE OR REPLACE FUNCTION private.union_wa_future_opportunity_prepare()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conversation record;
  v_contact record;
begin
  if (select auth.uid()) is null
     or not private.has_effective_organization_permission(new.organization_id,'whatsapp.inbox.send') then
    raise exception 'Sem permissão para registrar oportunidades nesta empresa.' using errcode='42501';
  end if;

  if tg_op='UPDATE' then
    if (new.organization_id,new.channel_id,new.account_phone,new.chat_jid) is distinct from
       (old.organization_id,old.channel_id,old.account_phone,old.chat_jid)
       or (new.conversation_id is distinct from old.conversation_id and new.conversation_id is not null) then
      raise exception 'O vínculo do contato com a oportunidade não pode ser alterado.' using errcode='23514';
    end if;
    new.created_by:=old.created_by;
    new.created_at:=old.created_at;
  end if;

  if new.conversation_id is not null then
    select c.contact_name,c.contact_phone,c.chat_jid
      into v_conversation
    from public.union_whatsapp_conversations c
    where c.id=new.conversation_id and c.organization_id=new.organization_id
      and c.channel_id=new.channel_id and c.account_phone=new.account_phone
      and c.chat_jid=new.chat_jid;
    if not found then
      raise exception 'A conversa não pertence a este contato/empresa.' using errcode='23514';
    end if;
    new.contact_name:=coalesce(nullif(btrim(v_conversation.contact_name),''),'Contato WhatsApp');
    new.contact_phone:=v_conversation.contact_phone;
  end if;
  select c.id,c.contact_phone,
         coalesce(nullif(c.display_name,''),nullif(c.imported_name,''),
                  nullif(c.device_name,''),nullif(c.profile_name,''),'Contato WhatsApp') as name
    into v_contact
  from public.union_whatsapp_contacts c
  where c.organization_id=new.organization_id and c.channel_id=new.channel_id
    and c.account_phone=new.account_phone and c.chat_jid=new.chat_jid
  limit 1;
  if new.conversation_id is null and not found and tg_op='INSERT' then
    raise exception 'Contato não encontrado nesta empresa.' using errcode='23514';
  end if;
  if v_contact.id is not null then
    new.contact_id:=v_contact.id;
    if new.conversation_id is null then
      new.contact_name:=v_contact.name;
      new.contact_phone:=v_contact.contact_phone;
    end if;
  else
    new.contact_id:=null;
  end if;

  if new.service_order_id is not null and not exists(
    select 1 from public.service_orders o
    where o.id=new.service_order_id and o.organization_id=new.organization_id
  ) then
    raise exception 'A OS informada não pertence a esta empresa.' using errcode='23514';
  end if;
  if new.service_type_id is not null and not exists(
    select 1 from public.service_types s
    where s.id=new.service_type_id and s.organization_id=new.organization_id
  ) then
    raise exception 'O serviço vinculado não pertence a esta empresa.' using errcode='23514';
  end if;
  new.updated_at:=now();
  new.updated_by:=(select auth.uid());
  if tg_op='INSERT' then new.created_by:=(select auth.uid()); end if;
  if new.consent_to_contact and (tg_op='INSERT' or not old.consent_to_contact) then
    new.consent_recorded_at:=now();
  elsif not new.consent_to_contact then
    new.consent_recorded_at:=null;
  else
    new.consent_recorded_at:=old.consent_recorded_at;
  end if;
  if new.status='contacted' and (tg_op='INSERT' or old.status is distinct from 'contacted') then
    new.last_contact_at:=now();
  end if;
  if new.status='converted' and (tg_op='INSERT' or old.status is distinct from 'converted') then
    new.converted_at:=now();
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.union_wa_future_opportunity_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action text;
begin
  v_action:=case when tg_op='INSERT' then 'created'
    when old.status is distinct from new.status then 'status'
    when old.consent_to_contact is distinct from new.consent_to_contact then 'consent'
    else 'updated' end;
  insert into public.union_whatsapp_future_opportunity_history
    (opportunity_id,organization_id,action,before_value,after_value,actor_id)
  values(new.id,new.organization_id,v_action,
    case when tg_op='INSERT' then '{}'::jsonb
         else jsonb_build_object('status',old.status,'consent',old.consent_to_contact,'notes',old.notes) end,
    jsonb_build_object('status',new.status,'consent',new.consent_to_contact,'notes',new.notes),
    (select auth.uid()));
  return new;
end $function$
;
drop trigger if exists union_wa_future_prepare on public.union_whatsapp_future_opportunities;
create trigger union_wa_future_prepare before insert or update on public.union_whatsapp_future_opportunities
 for each row execute function private.union_wa_future_opportunity_prepare();
drop trigger if exists union_wa_future_audit on public.union_whatsapp_future_opportunities;
create trigger union_wa_future_audit after insert or update on public.union_whatsapp_future_opportunities
 for each row execute function private.union_wa_future_opportunity_audit();

alter table public.union_whatsapp_future_opportunities enable row level security;
alter table public.union_whatsapp_future_opportunity_history enable row level security;
revoke all on public.union_whatsapp_future_opportunities from public,anon;
revoke all on public.union_whatsapp_future_opportunity_history from public,anon,authenticated;
grant select,insert,update on public.union_whatsapp_future_opportunities to authenticated;
grant select on public.union_whatsapp_future_opportunity_history to authenticated;
create policy union_wa_future_select on public.union_whatsapp_future_opportunities
 for select to authenticated using (
 private.has_effective_organization_permission(organization_id,'whatsapp.inbox.view'));
create policy union_wa_future_insert on public.union_whatsapp_future_opportunities
 for insert to authenticated with check (
 private.has_effective_organization_permission(organization_id,'whatsapp.inbox.send')
 and created_by=(select auth.uid()));
create policy union_wa_future_update on public.union_whatsapp_future_opportunities
 for update to authenticated using (
 private.has_effective_organization_permission(organization_id,'whatsapp.inbox.send'))
 with check (private.has_effective_organization_permission(organization_id,'whatsapp.inbox.send'));
create policy union_wa_future_history_select on public.union_whatsapp_future_opportunity_history
 for select to authenticated using (
 private.has_effective_organization_permission(organization_id,'whatsapp.inbox.view'));

CREATE OR REPLACE FUNCTION private.union_wa_future_service_available()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Ativar o catalogo nunca pode falhar porque o usuario nao tem permissao no WhatsApp.
  if new.is_active
     and (tg_op='INSERT' or old.is_active is distinct from true)
     and (select auth.uid()) is not null
     and private.has_effective_organization_permission(new.organization_id,'whatsapp.inbox.send') then
    update public.union_whatsapp_future_opportunities o
      set status='available',service_type_id=new.id,updated_at=now()
    where o.organization_id=new.organization_id and o.status='waiting'
      and lower(btrim(o.service_interest))=lower(btrim(new.title));
  end if;
  return new;
end $function$
;
drop trigger if exists union_wa_future_service_active on public.service_types;
create trigger union_wa_future_service_active after insert or update of is_active on public.service_types
 for each row execute function private.union_wa_future_service_available();
commit;
