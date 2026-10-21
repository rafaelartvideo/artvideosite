begin;

-- O WhatsApp pode alternar entre identificadores PN (número) e LID (privado).
-- Somente pares recebidos explicitamente no mesmo evento do provedor são
-- tratados como a mesma identidade. Nunca relacionar por nome, foto ou DDD.
create table if not exists public.union_whatsapp_verified_jid_aliases (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.whatsapp_channel_connections(id) on delete cascade,
  account_phone text not null,
  lid_jid text not null check (lid_jid ~ '^[0-9]{5,20}@lid$'),
  phone_jid text not null check (phone_jid ~ '^[0-9]{10,15}@s\.whatsapp\.net$'),
  first_verified_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  primary key (channel_id,account_phone,lid_jid)
);
create index if not exists union_whatsapp_verified_jid_aliases_pn_idx
  on public.union_whatsapp_verified_jid_aliases(channel_id,account_phone,phone_jid);
alter table public.union_whatsapp_verified_jid_aliases enable row level security;
revoke all on public.union_whatsapp_verified_jid_aliases from public,anon,authenticated;
-- Consultas/escritas na Edge Function utilizam service_role, nunca o navegador.

alter table public.union_whatsapp_messages
  add column if not exists origin text not null default 'legacy';
alter table public.union_whatsapp_messages
  add constraint union_whatsapp_messages_origin_check
  check(origin in ('legacy','whatsapp_contact','whatsapp_device','union'));

-- Uma mensagem ENVIADA PELO PRÓPRIO CELULAR, para um contato com o qual
-- ainda não havia conversa, deve ser sincronizada, mas não entrar em
-- Aguardando. Ela inicia histórico/protocolo já encerrado, sem operador.
-- Um retorno posterior do cliente abre novo protocolo normalmente.
create or replace function private.union_whatsapp_sync_protocol()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
declare active_protocol public.union_whatsapp_protocols%rowtype;
declare created_number bigint;
begin
 select * into active_protocol from public.union_whatsapp_protocols
 where conversation_id=new.id and closed_at is null for update;
 if new.status in ('finished','abandoned') then
   if found then
     update public.union_whatsapp_protocols
       set status=new.status,assigned_to=new.assigned_to,
         department_id=new.department_id,closed_at=now(),updated_at=now()
       where id=active_protocol.id;
   elsif tg_op='INSERT' then
     -- Protocolo histórico necessário para anexar o evento de saída,
     -- mas não há protocolo aberto/cliente aguardando.
     created_number:=private.union_whatsapp_next_protocol_number(new.organization_id);
     insert into public.union_whatsapp_protocols(
       organization_id,conversation_id,channel_id,account_phone,protocol_number,
       status,assigned_to,department_id,opened_at,closed_at
     ) values (
       new.organization_id,new.id,new.channel_id,new.account_phone,created_number,
       new.status,new.assigned_to,new.department_id,now(),now()
     );
     update public.union_whatsapp_conversations
       set last_protocol_number=created_number where id=new.id;
   end if;
   return new;
 end if;
 if not found then
   created_number:=private.union_whatsapp_next_protocol_number(new.organization_id);
   insert into public.union_whatsapp_protocols(
     organization_id,conversation_id,channel_id,account_phone,protocol_number,
     status,assigned_to,department_id,opened_at,assigned_at
   ) values (
     new.organization_id,new.id,new.channel_id,new.account_phone,created_number,
     new.status,new.assigned_to,new.department_id,now(),
     case when new.status='in_att' then now() else null end
   );
   update public.union_whatsapp_conversations
      set last_protocol_number=created_number where id=new.id;
 else
   update public.union_whatsapp_protocols set
     status=new.status,assigned_to=new.assigned_to,department_id=new.department_id,
     assigned_at=case when assigned_at is null and new.status='in_att'
       then now() else assigned_at end,updated_at=now()
   where id=active_protocol.id
     and (status,assigned_to,department_id) is distinct from
         (new.status,new.assigned_to,new.department_id);
 end if;
 return new;
end;
$$;
revoke all on function private.union_whatsapp_sync_protocol() from public,anon,authenticated;

commit;