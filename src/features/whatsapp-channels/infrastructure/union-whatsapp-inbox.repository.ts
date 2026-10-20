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
  delivery_status?: "sent" | "delivered" | "read" | null;
  media_path?: string | null;
  media_name?: string | null;
  media_mime?: string | null;
  media_available?: boolean;
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
    .select("id,organization_id,conversation_id,provider_message_id,direction,message_type,body_text,sender_name,sent_at,delivery_status,media_path,media_name,media_mime,media_available")
    .eq("organization_id", organizationId).eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false }).limit(120);
  raise(error);
  return ((data || []) as UnionWhatsAppMessage[]).reverse();
}

export type UnionWhatsAppInboxAction = "assume" | "return_queue" | "finish" | "reopen" | "mark_read" | "send_text" | "members" | "transfer" | "send_media" | "media_view" | "start" | "channel_status" | "prepare_media" | "resolve_contact";

export async function operateUnionWhatsAppInbox(
  organizationId: string,
  conversationId: string,
  action: UnionWhatsAppInboxAction,
  extra: { text?: string; client_message_id?: string; target_user_id?: string;
    media_base64?: string; media_name?: string; media_mime?: string; media_type?: string; message_id?: string; phone?: string; contact_name?: string; media_size?: number; media_path?: string } = {},
): Promise<{ success: true; already_sent?: boolean; provider_confirmed?: boolean; message_id?: string; conversation_id?: string; contact_name?: string; channel_connected?: boolean; upload_path?: string; upload_token?: string; url?: string; filename?: string; mime?: string; members?: Array<{id:string;name:string}> }> {
  const { data, error } = await supabase.functions.invoke("union-whatsapp-inbox", {
    body: {
      action, organization_id: organizationId, conversation_id: conversationId, ...extra,
    },
  });
  if (error) {
    // Supabase can return the Edge Function's JSON error in the Response
    // carried by FunctionsHttpError; do not replace actionable feedback
    // with a generic connection failure.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      const result = await response.json().catch(() => null);
      if (result?.error) throw new Error(String(result.error));
    }
    throw new Error(error.message || "Não foi possível comunicar com o atendimento WhatsApp.");
  }
  if (!data?.success) throw new Error(String(data?.error || "Não foi possível concluir esta operação."));
  return data;
}
