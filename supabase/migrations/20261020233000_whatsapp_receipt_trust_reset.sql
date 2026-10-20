-- Previous webhook versions treated ReadReceipt with no explicit state as
-- read. Those historical blue ticks cannot be trusted. Revert to the
-- conservative state until a *new* authenticated, explicitly-typed receipt
-- confirms delivery or recipient read.
update public.union_whatsapp_messages
set delivery_status='sent'
where direction='outgoing' and delivery_status='read';