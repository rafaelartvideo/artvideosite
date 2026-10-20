-- Target connected channel's inbox; avoid reading unrelated channel history.
create index if not exists union_whatsapp_conv_channel_recent_idx
  on public.union_whatsapp_conversations
  (organization_id,channel_id,last_message_at desc nulls last);
