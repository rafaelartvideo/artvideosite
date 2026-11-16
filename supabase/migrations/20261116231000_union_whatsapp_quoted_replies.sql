-- Reply-to metadata for native WhatsApp quote/reply rendering.
-- Quotes are scoped to their existing conversation/channel/account in the Edge Function.
-- Do not expose cross-tenant message foreign keys or provider JIDs.
begin;
alter table public.union_whatsapp_messages
  add column if not exists reply_to_provider_message_id text
    check (reply_to_provider_message_id is null or char_length(reply_to_provider_message_id) between 1 and 180),
  add column if not exists reply_to_text text
    check (reply_to_text is null or char_length(reply_to_text) <= 400),
  add column if not exists reply_to_message_type text,
  add column if not exists reply_to_direction text
    check (reply_to_direction is null or reply_to_direction in ('incoming','outgoing'));
comment on column public.union_whatsapp_messages.reply_to_provider_message_id is 'WhatsApp stanza ID quoted by the message; resolved within the same conversation and channel.';
comment on column public.union_whatsapp_messages.reply_to_text is 'Short immutable quoted preview (no media URL or sensitive binary data).';
commit;
