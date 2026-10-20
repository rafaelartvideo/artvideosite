-- Union WhatsApp: durable server-side idempotency for text sending.
-- Provider IDs are NOT idempotency guarantees; one application request
-- must never re-dispatch on timeout/retry.
begin;
create table if not exists public.union_whatsapp_send_attempts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 channel_id uuid not null,
 conversation_id uuid not null,
 user_id uuid not null references auth.users(id) on delete restrict,
 client_message_id uuid not null,
 body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
 status text not null default 'sending' check (status in ('sending','sent','unknown')),
 provider_message_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (conversation_id, organization_id, channel_id)
   references public.union_whatsapp_conversations(id, organization_id, channel_id) on delete cascade,
 constraint union_whatsapp_send_idempotency unique (organization_id,client_message_id)
);
create index if not exists union_whatsapp_send_attempts_thread_idx
  on public.union_whatsapp_send_attempts(conversation_id,created_at desc);
alter table public.union_whatsapp_send_attempts enable row level security;
revoke all on public.union_whatsapp_send_attempts from anon,authenticated;
comment on table public.union_whatsapp_send_attempts is
 'Private delivery attempt journal. Prevents duplicate provider sends on retries. No message body or tokens stored.';
commit;