-- Enable scoped realtime notifications only for the new Union WhatsApp inbox.
-- RLS on both tables still governs what authenticated clients can receive.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'union_whatsapp_conversations'
  ) then
    alter publication supabase_realtime add table public.union_whatsapp_conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'union_whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.union_whatsapp_messages;
  end if;
end $$;
