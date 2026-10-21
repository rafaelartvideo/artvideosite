import { supabase } from "@/lib/supabase";

export type UnionWhatsAppConversation = {
  id: string;
  organization_id: string;
  channel_id: string;
  account_phone: string;
  chat_jid: string;
  contact_name: string;
  contact_phone: string | null;
  status: "waiting" | "in_att" | "abandoned" | "finished";
  assigned_to: string | null;
  department_id: string | null;
  service_order_id: string | null;
  contact_presence: "online"|"offline"|"composing"|"paused"|"recording"|null;
  contact_presence_at: string|null;
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
  message_type: "text" | "image" | "video" | "audio" | "file" | "sticker" | "location" | "contact" | "unknown";
  body_text: string;
  sender_name: string | null;
  sent_at: string;
  delivery_status?: "sent" | "delivered" | "read" | null;
  media_path?: string | null;
  media_name?: string | null;
  media_mime?: string | null;
  media_available?: boolean;
};

export type UnionWhatsAppContact = {
  id: string;
  chat_jid: string;
  contact_phone: string | null;
  display_name: string | null;
  imported_name: string | null;
  device_name: string | null;
  profile_name: string | null;
  updated_at: string;
};

const raise = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function listUnionWhatsAppConversations(organizationId: string, channelId: string, accountPhone: string): Promise<UnionWhatsAppConversation[]> {
  const { data, error } = await supabase.from("union_whatsapp_conversations")
    .select("id,organization_id,channel_id,account_phone,chat_jid,contact_name,contact_phone,status,assigned_to,department_id,service_order_id,contact_presence,contact_presence_at,last_message,last_message_at,unread_count,created_at")
    .eq("organization_id", organizationId).eq("channel_id", channelId).eq("account_phone",accountPhone)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(150);
  raise(error);
  return (data || []) as UnionWhatsAppConversation[];
}

export async function listUnionWhatsAppMessages(
  organizationId: string, conversationId: string, channelId: string,accountPhone:string,
): Promise<UnionWhatsAppMessage[]> {
  const { data, error } = await supabase.from("union_whatsapp_messages")
    .select("id,organization_id,conversation_id,provider_message_id,direction,message_type,body_text,sender_name,sent_at,delivery_status,media_path,media_name,media_mime,media_available")
    .eq("organization_id", organizationId).eq("channel_id",channelId).eq("account_phone",accountPhone)
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false }).limit(120);
  raise(error);
  return ((data || []) as UnionWhatsAppMessage[]).reverse();
}

export type UnionWhatsAppInboxAction = "assume" | "return_queue" | "finish" | "reopen" | "mark_read" | "send_text" | "members" | "transfer" | "send_media" | "media_view" | "start" | "check_number" | "channel_status" | "prepare_media" | "resolve_contact" | "contact_avatar" | "customer_match" | "departments_list" | "department_save" | "department_members" | "department_set_member" | "operator_list" | "operator_set" | "queue_default" | "transfer_department" | "handoff_history" | "order_options" | "order_link" | "presence_subscribe" | "contacts_list" | "contacts_import" | "contacts_save" | "contacts_import_device" | "contacts_import_batch" | "contacts_apply_names";

export async function operateUnionWhatsAppInbox(
  organizationId: string,
  conversationId: string,
  action: UnionWhatsAppInboxAction,
  extra: { text?: string; client_message_id?: string; target_user_id?: string;
    media_base64?: string; media_name?: string; media_mime?: string; media_type?: string; message_id?: string; phone?: string; contact_name?: string; media_size?: number; media_path?: string; department_id?: string; name?: string; is_active?: boolean; enabled?: boolean; staff_role?: "manager"|"operator"|"both"; service_order_id?: string; chat_jid?: string; display_name?: string; search?: string; page?: number; contacts?: Array<{name:string;phone:string}>; account_phone?: string } = {},
): Promise<{ success: true; already_sent?: boolean; provider_confirmed?: boolean; message_id?: string; conversation_id?: string; contact_name?: string; avatar_url?: string | null; contacts?: UnionWhatsAppContact[]; total?: number; imported?: number; truncated?: boolean; contact?: UnionWhatsAppContact; phone?: string; adjusted?: boolean; verified_name?: string; alternatives?: Array<{phone:string;verified_name?:string}>; customer?: {id:string;name:string} | null; ambiguous?: boolean; channel_connected?: boolean; channel_id?: string|null; channel_phone?: string|null; staff_role?: "manager"|"operator"|"both"|null; upload_path?: string; upload_token?: string; url?: string; filename?: string; mime?: string; members?: Array<{id:string;name:string}>; departments?: Array<{id:string;name:string;is_active:boolean;is_default?:boolean}>; member_ids?: string[]; operators?: Array<{id:string;name:string;eligible:boolean;can_attend:boolean;is_active:boolean;staff_role:"manager"|"operator"|"both";is_manager?:boolean}>;
  orders?: Array<{id:string;os_number:string;created_at:string}>; service_order_id?: string|null;
  history?: Array<{id:string;action:string;actor_id:string;to_user_id:string|null;to_department_id:string|null;created_at:string}> }> {
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
