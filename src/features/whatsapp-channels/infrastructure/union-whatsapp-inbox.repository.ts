import { supabase } from "@/lib/supabase";

export type UnionWhatsAppConversation = {
  id: string;
  organization_id: string;
  channel_id: string;
  chat_jid: string;
  contact_name: string;
  contact_phone: string | null;
  status: "waiting" | "in_att" | "abandoned" | "finished";
  assigned_to: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
};

export type UnionWhatsAppMessage = {
  id: string;
  organization_id: string;
  conversation_id: string;
  provider_message_id: string;
  direction: "incoming" | "outgoing";
  message_type: "text" | "image" | "video" | "audio" | "file" | "location" | "contact" | "unknown";
  body_text: string;
  sender_name: string | null;
  sent_at: string;
};

const raise = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function listUnionWhatsAppConversations(organizationId: string): Promise<UnionWhatsAppConversation[]> {
  const { data, error } = await supabase.from("union_whatsapp_conversations")
    .select("id,organization_id,channel_id,chat_jid,contact_name,contact_phone,status,assigned_to,last_message,last_message_at,unread_count,created_at")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(150);
  raise(error);
  return (data || []) as UnionWhatsAppConversation[];
}

export async function listUnionWhatsAppMessages(
  organizationId: string, conversationId: string,
): Promise<UnionWhatsAppMessage[]> {
  const { data, error } = await supabase.from("union_whatsapp_messages")
    .select("id,organization_id,conversation_id,provider_message_id,direction,message_type,body_text,sender_name,sent_at")
    .eq("organization_id", organizationId).eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false }).limit(120);
  raise(error);
  return ((data || []) as UnionWhatsAppMessage[]).reverse();
}
