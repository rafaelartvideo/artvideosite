-- A third-party WhatsApp contact may be associated with an OS without
-- ever changing the customer's registered phone number.
CREATE TABLE IF NOT EXISTS public.union_whatsapp_order_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 channel_id uuid NOT NULL REFERENCES public.whatsapp_channel_connections(id) ON DELETE CASCADE,
 account_phone text NOT NULL,
 service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES public.union_whatsapp_conversations(id) ON DELETE CASCADE,
 chat_jid text NOT NULL,
 contact_phone text NOT NULL,
 contact_name text NOT NULL DEFAULT '',
 linked_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT union_whatsapp_order_contacts_unique UNIQUE(organization_id,service_order_id,conversation_id),
 CONSTRAINT union_whatsapp_order_contacts_phone_check CHECK (contact_phone ~ '^[0-9]{10,15}$')
);
CREATE INDEX IF NOT EXISTS union_whatsapp_order_contacts_order_idx
 ON public.union_whatsapp_order_contacts(organization_id,service_order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS union_whatsapp_order_contacts_conversation_idx
 ON public.union_whatsapp_order_contacts(organization_id,conversation_id);
ALTER TABLE public.union_whatsapp_order_contacts ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies or grants: all reads and writes are performed
-- by the existing authorization-checked Edge Function using service credentials.
REVOKE ALL ON TABLE public.union_whatsapp_order_contacts FROM anon,authenticated;
COMMENT ON TABLE public.union_whatsapp_order_contacts IS
 'Scoped link between a WhatsApp identity and an OS; never modifies customers.phone or customers.whatsapp.';
