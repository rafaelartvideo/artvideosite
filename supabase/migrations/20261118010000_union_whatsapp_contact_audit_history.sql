-- Contact history: transactional edits of the manual Union WhatsApp address book.
-- Automated imports keep their own source columns and never create "operator edited" events.
create table if not exists public.union_whatsapp_contact_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  channel_id uuid not null,
  account_phone text not null,
  contact_id uuid not null,
  chat_jid text not null,
  previous_chat_jid text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name_snapshot text not null,
  action text not null check (action in ('created','updated')),
  changed_fields jsonb not null check (jsonb_typeof(changed_fields) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists union_whatsapp_contact_audit_history_idx
  on public.union_whatsapp_contact_audit
  (organization_id,channel_id,account_phone,contact_id,created_at desc,id desc);

alter table public.union_whatsapp_contact_audit enable row level security;
revoke all on public.union_whatsapp_contact_audit from public, anon, authenticated;
grant select,insert on public.union_whatsapp_contact_audit to service_role;
grant usage,select on sequence public.union_whatsapp_contact_audit_id_seq to service_role;

-- Only the server-side, permission-checked WhatsApp Edge Function can invoke this RPC.
-- The write, the conversation's display name and the audit record commit atomically.
create or replace function public.union_whatsapp_save_contact_audited(
  p_organization uuid,
  p_channel uuid,
  p_account_phone text,
  p_original_jid text,
  p_target_jid text,
  p_display_name text,
  p_contact_phone text,
  p_actor uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.union_whatsapp_contacts%rowtype;
  v_target public.union_whatsapp_contacts%rowtype;
  v_saved public.union_whatsapp_contacts%rowtype;
  v_actor_name text;
  v_phone text;
  v_changed jsonb := '{}'::jsonb;
  v_created boolean;
begin
  if p_organization is null or p_channel is null or p_actor is null
     or p_account_phone !~ '^[0-9]{10,15}$'
     or p_original_jid !~ '^[0-9]{5,20}@(s\.whatsapp\.net|lid)$'
     or p_target_jid !~ '^[0-9]{5,20}@(s\.whatsapp\.net|lid)$'
     or char_length(btrim(coalesce(p_display_name,''))) not between 2 and 160 then
    raise exception 'Dados inválidos para salvar contato' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.whatsapp_channel_connections c
    where c.id=p_channel and c.organization_id=p_organization
      and c.phone=p_account_phone and c.provider='wuzapi' and c.state='connected'
  ) then
    raise exception 'Conexão WhatsApp inválida' using errcode='22023';
  end if;

  select nullif(btrim(p.full_name),'') into v_actor_name
  from public.profiles p where p.id=p_actor;
  if v_actor_name is null then
    raise exception 'Usuário responsável não identificado' using errcode='22023';
  end if;

  select * into v_old from public.union_whatsapp_contacts c
  where c.organization_id=p_organization and c.channel_id=p_channel
    and c.account_phone=p_account_phone and c.chat_jid=p_original_jid
  for update;

  if p_target_jid <> p_original_jid then
    select * into v_target from public.union_whatsapp_contacts c
    where c.organization_id=p_organization and c.channel_id=p_channel
      and c.account_phone=p_account_phone and c.chat_jid=p_target_jid
    for update;
    if v_old.id is not null and v_target.id is not null and v_old.id<>v_target.id then
      raise exception 'O número confirmado já está salvo em outro contato. Resolva a duplicidade antes de alterar.'
        using errcode='23505';
    end if;
    if v_old.id is null and v_target.id is not null then
      v_old := v_target;
    end if;
  end if;

  v_created := v_old.id is null;
  v_phone := coalesce(nullif(btrim(p_contact_phone),''),v_old.contact_phone);

  if v_created then
    insert into public.union_whatsapp_contacts (
      organization_id,channel_id,account_phone,chat_jid,contact_phone,display_name,updated_at
    ) values (
      p_organization,p_channel,p_account_phone,p_target_jid,v_phone,p_display_name,now()
    )
    on conflict (channel_id,account_phone,chat_jid)
    do update set
      contact_phone=coalesce(excluded.contact_phone,public.union_whatsapp_contacts.contact_phone),
      display_name=excluded.display_name,updated_at=now()
    returning * into v_saved;
  else
    update public.union_whatsapp_contacts c
      set chat_jid=p_target_jid,contact_phone=v_phone,display_name=p_display_name,updated_at=now()
      where c.id=v_old.id and c.organization_id=p_organization
        and c.channel_id=p_channel and c.account_phone=p_account_phone
      returning * into v_saved;
  end if;

  if v_created or v_old.display_name is distinct from v_saved.display_name then
    v_changed:=v_changed||jsonb_build_object('display_name',
      jsonb_build_object('before',case when v_created then null else v_old.display_name end,
                         'after',v_saved.display_name));
  end if;
  if v_created or v_old.contact_phone is distinct from v_saved.contact_phone then
    v_changed:=v_changed||jsonb_build_object('contact_phone',
      jsonb_build_object('before',case when v_created then null else v_old.contact_phone end,
                         'after',v_saved.contact_phone));
  end if;
  if not v_created and v_old.chat_jid is distinct from v_saved.chat_jid then
    v_changed:=v_changed||jsonb_build_object('chat_jid',
      jsonb_build_object('before',v_old.chat_jid,'after',v_saved.chat_jid));
  end if;

  update public.union_whatsapp_conversations c
    set contact_name=p_display_name,updated_at=now()
    where c.organization_id=p_organization and c.channel_id=p_channel
      and c.account_phone=p_account_phone and c.chat_jid=p_target_jid;

  if v_changed<>'{}'::jsonb then
    insert into public.union_whatsapp_contact_audit (
      organization_id,channel_id,account_phone,contact_id,chat_jid,previous_chat_jid,
      actor_user_id,actor_name_snapshot,action,changed_fields
    ) values (
      p_organization,p_channel,p_account_phone,v_saved.id,v_saved.chat_jid,
      case when v_saved.chat_jid<>p_original_jid then p_original_jid else null end,
      p_actor,v_actor_name,case when v_created then 'created' else 'updated' end,v_changed
    );
  end if;

  return jsonb_build_object(
    'id',v_saved.id,'chat_jid',v_saved.chat_jid,
    'contact_phone',v_saved.contact_phone,'display_name',v_saved.display_name,
    'updated_at',v_saved.updated_at
  );
end;
$$;

revoke all on function public.union_whatsapp_save_contact_audited(
 uuid,uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.union_whatsapp_save_contact_audited(
 uuid,uuid,text,text,text,text,text,uuid) to service_role;
