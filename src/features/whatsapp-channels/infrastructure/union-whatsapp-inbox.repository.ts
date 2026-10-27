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
  last_protocol_number: number | null;
  queue_entered_at: string | null;
  forwarded_by: string | null;
  forwarded_to: string | null;
  forwarded_to_department: string | null;
  forwarded_by_name: string | null;
  forwarded_to_name: string | null;
  forwarded_at: string | null;
};

export type UnionWhatsAppProtocol = {
  id: string;
  conversation_id: string;
  protocol_number: number;
  status: UnionWhatsAppConversation["status"];
  assigned_to: string | null;
  department_id: string | null;
  opened_at: string;
  assigned_at: string | null;
  closed_at: string | null;
  first_reply_at: string | null;
  message_count: number;
  opened_by: string | null;
  closed_by: string | null;
};
export const unionWhatsAppProtocolLabel = (number: number) => `ATD-${String(number).padStart(6,"0")}`;

export type UnionWhatsAppMessage = {
  id: string;
  organization_id: string;
  conversation_id: string;
  protocol_id: string | null;
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

export type UnionWhatsAppQueueSettings = {
  warning_minutes:number;
  critical_minutes:number;
  show_wait_time:boolean;
  show_queue_position:boolean;
  show_forward_badges:boolean;
};
export const DEFAULT_WHATSAPP_QUEUE_SETTINGS:UnionWhatsAppQueueSettings = {
  warning_minutes:5,critical_minutes:15,
  show_wait_time:true,show_queue_position:true,show_forward_badges:true,
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

export type UnionWhatsAppInboxFilter="waiting"|"in_att"|"forwarded"|"finished";
export type UnionWhatsAppConversationCounts={
  waiting:number;in_att:number;forwarded:number;finished:number;total:number;unread:number;
};
export type UnionWhatsAppMessageCursor={sent_at:string;id:string};
export type UnionWhatsAppMessagePage={
  items:UnionWhatsAppMessage[];hasMore:boolean;nextCursor:UnionWhatsAppMessageCursor|null;
};
export type UnionWhatsAppProtocolPage={
  items:UnionWhatsAppProtocol[];hasMore:boolean;
};
const INBOX_PAGE_SIZE=50;
const MESSAGE_PAGE_SIZE=60;
const PROTOCOL_PAGE_SIZE=25;
const columns="id,organization_id,channel_id,account_phone,chat_jid,contact_name,contact_phone,status,assigned_to,department_id,service_order_id,contact_presence,contact_presence_at,last_message,last_message_at,unread_count,created_at,last_protocol_number,queue_entered_at,forwarded_by,forwarded_to,forwarded_to_department,forwarded_by_name,forwarded_to_name,forwarded_at";

export async function listUnionWhatsAppConversationCounts(
  organizationId:string,channelId:string,accountPhone:string,
):Promise<UnionWhatsAppConversationCounts>{
  const {data,error}=await supabase.rpc("union_whatsapp_inbox_counts",{
    p_organization:organizationId,p_channel:channelId,p_account_phone:accountPhone,
  });
  raise(error);
  const row=Array.isArray(data)?data[0]:data;
  return {
    waiting:Number(row?.waiting_count||0),in_att:Number(row?.in_att_count||0),
    forwarded:Number(row?.forwarded_count||0),finished:Number(row?.finished_count||0),
    total:Number(row?.total_count||0),unread:Number(row?.unread_count||0),
  };
}

export async function listUnionWhatsAppConversations(
  organizationId:string,channelId:string,accountPhone:string,
  options:{filter:UnionWhatsAppInboxFilter;department:string;search:string;page:number;viewerId?:string;canViewAll?:boolean},
):Promise<{items:UnionWhatsAppConversation[];hasMore:boolean}>{
  const page=Math.max(0,Math.floor(options.page));
  let query=supabase.from("union_whatsapp_conversations")
    .select(columns)
    .eq("organization_id",organizationId)
    .eq("channel_id",channelId)
    .eq("account_phone",accountPhone);
  if(options.filter==="forwarded"){
    query=query.not("forwarded_at","is",null).neq("status","finished").neq("status","abandoned");
    // The sender does not retain an operator inbox entry after handing off.
    // Manager visibility is preserved through view_all and the database policy.
    if(!options.canViewAll){
      if(!options.viewerId) return {items:[],hasMore:false};
      query=query.neq("forwarded_by",options.viewerId);
    }
  }else{
    query=query.eq("status",options.filter);
    // Protocolos finalizados podem conservar o encaminhamento no histórico.
    if(options.filter!=="finished")query=query.is("forwarded_at",null);
  }
  if(options.department==="none")query=query.is("department_id",null);
  else if(options.department!=="all")query=query.eq("department_id",options.department);

  // Os caracteres de controle do PostgREST são excluídos da pesquisa.
  const search=options.search.trim().replace(/[,()%*\\"']/g," ").replace(/\s+/g," ").trim().slice(0,70);
  if(search){
    const term=search.replace(/\s+/g,"%");
    const digits=options.search.replace(/\D/g,"").slice(0,15);
    const where=[
      `contact_name.ilike.%${term}%`,
      `contact_phone.ilike.%${term}%`,
      `chat_jid.ilike.%${term}%`,
    ];
    if(digits.length>=5)where.push(`contact_phone.ilike.%${digits}%`);
    const protocol=search.match(/^(?:ATD[-\s]*)?(\d{1,12})$/i);
    if(protocol)where.push(`last_protocol_number.eq.${Number(protocol[1])}`);
    query=query.or(where.join(","));
  }
  const sort=options.filter==="waiting"?"queue_entered_at":
    options.filter==="forwarded"?"forwarded_at":"last_message_at";
  const {data,error}=await query.order(sort,{ascending:options.filter==="waiting",nullsFirst:false})
    .order("id",{ascending:options.filter==="waiting"})
    .range(page*INBOX_PAGE_SIZE,(page+1)*INBOX_PAGE_SIZE);
  raise(error);
  const entries=(data||[]) as UnionWhatsAppConversation[];
  return {items:entries.slice(0,INBOX_PAGE_SIZE),hasMore:entries.length>INBOX_PAGE_SIZE};
}

// Carrega pontualmente o atendimento aberto por um atalho, mesmo quando
// não está entre os 50 registros da página atual. A RLS continua ativa.
export async function getUnionWhatsAppConversation(
  organizationId:string,conversationId:string,channelId:string,accountPhone:string,
):Promise<UnionWhatsAppConversation|null>{
  const {data,error}=await supabase.from("union_whatsapp_conversations")
    .select(columns).eq("organization_id",organizationId)
    .eq("channel_id",channelId).eq("account_phone",accountPhone)
    .eq("id",conversationId).maybeSingle();
  raise(error);
  return data as UnionWhatsAppConversation|null;
}

export async function listUnionWhatsAppMessages(
  organizationId:string,conversationId:string,channelId:string,accountPhone:string,
  protocolId?:string|null,before?:UnionWhatsAppMessageCursor|null,
):Promise<UnionWhatsAppMessagePage>{
  let query=supabase.from("union_whatsapp_messages")
    .select("id,organization_id,conversation_id,protocol_id,provider_message_id,direction,message_type,body_text,sender_name,sent_at,delivery_status,media_path,media_name,media_mime,media_available")
    .eq("organization_id",organizationId).eq("channel_id",channelId)
    .eq("account_phone",accountPhone).eq("conversation_id",conversationId);
  if(protocolId)query=query.eq("protocol_id",protocolId);
  if(before){
    query=query.or(`sent_at.lt.${before.sent_at},and(sent_at.eq.${before.sent_at},id.lt.${before.id})`);
  }
  const {data,error}=await query.order("sent_at",{ascending:false})
    .order("id",{ascending:false}).limit(MESSAGE_PAGE_SIZE+1);
  raise(error);
  const rows=((data||[]) as UnionWhatsAppMessage[]);
  const current=rows.slice(0,MESSAGE_PAGE_SIZE);
  const oldest=current[current.length-1];
  return {items:current.reverse(),hasMore:rows.length>MESSAGE_PAGE_SIZE,
    nextCursor:oldest?{sent_at:oldest.sent_at,id:oldest.id}:null};
}

export async function listUnionWhatsAppProtocols(
  organizationId:string,conversationId:string,channelId:string,accountPhone:string,
  page=0,
):Promise<UnionWhatsAppProtocolPage>{
  const limit=PROTOCOL_PAGE_SIZE;
  const start=Math.max(0,Math.floor(page))*limit;
  const {data,error}=await supabase.from("union_whatsapp_protocols")
    .select("id,conversation_id,protocol_number,status,assigned_to,department_id,opened_at,assigned_at,closed_at,first_reply_at,message_count,opened_by,closed_by")
    .eq("organization_id",organizationId).eq("channel_id",channelId)
    .eq("account_phone",accountPhone).eq("conversation_id",conversationId)
    .order("opened_at",{ascending:false}).order("id",{ascending:false})
    .range(start,start+limit);
  raise(error);
  const rows=(data||[]) as UnionWhatsAppProtocol[];
  return {items:rows.slice(0,limit),hasMore:rows.length>limit};
}

export type UnionWhatsAppParticipant = { user_id:string; name:string; status:"active"|"requested"; requested_by:string|null; decided_by:string|null; created_at:string; updated_at:string };
export type UnionWhatsAppInboxAction = "participants" | "participant_add" | "participant_respond" | "participant_remove" | "participant_request_protocol" | "assume" | "return_queue" | "finish" | "reopen" | "mark_read" | "send_text" | "members" | "transfer" | "send_media" | "media_view" | "start" | "check_number" | "channel_status" | "prepare_media" | "resolve_contact" | "contact_avatar" | "customer_match" | "departments_list" | "department_save" | "department_members" | "department_set_member" | "operator_list" | "operator_set" | "role_permissions_list" | "role_permissions_save" | "queue_default" | "queue_settings_get" | "queue_settings_save" | "transfer_department" | "handoff_history" | "order_options" | "order_link" | "presence_subscribe" | "contacts_list" | "contacts_import" | "contacts_save" | "contacts_import_device" | "contacts_import_batch" | "contacts_apply_names";

export async function operateUnionWhatsAppInbox(
  organizationId: string,
  conversationId: string,
  action: UnionWhatsAppInboxAction,
  extra: { text?: string; client_message_id?: string; target_user_id?: string; approve?: boolean; protocol_number?: number;
    media_base64?: string; media_name?: string; media_mime?: string; media_type?: string; message_id?: string; phone?: string; contact_name?: string; media_size?: number; media_path?: string; department_id?: string; name?: string; is_active?: boolean; enabled?: boolean; permissions?: Array<{capability:string;enabled:boolean}>; staff_role?: "manager"|"operator"|"both"; service_order_id?: string; chat_jid?: string; display_name?: string; search?: string; page?: number; contacts?: Array<{name:string;phone:string}>; account_phone?: string; warning_minutes?: number; critical_minutes?: number; show_wait_time?: boolean; show_queue_position?: boolean; show_forward_badges?: boolean } = {},
): Promise<{ success: true; already_sent?: boolean; provider_confirmed?: boolean; message_id?: string; provider_message_id?: string; conversation_id?: string; contact_name?: string; name_source?: "agenda"|"agenda_whatsapp"|"conversa"|"whatsapp"|null; avatar_url?: string | null; contacts?: UnionWhatsAppContact[]; total?: number; imported?: number; truncated?: boolean; contact?: UnionWhatsAppContact; phone?: string; adjusted?: boolean; distinct_identities?: boolean; verified_name?: string; alternatives?: Array<{phone:string;query?:string;verified_name?:string}>; customer?: {id:string;name:string} | null; ambiguous?: boolean; channel_connected?: boolean; channel_id?: string|null; channel_phone?: string|null; staff_role?: "manager"|"operator"|"both"|null; capabilities?: Record<string,boolean>; capability_definitions?: Array<{key:string;label:string;category:"Conversas"|"Administração";sort_order:number;manager:boolean;operator:boolean}>; upload_path?: string; upload_token?: string; url?: string; filename?: string; mime?: string; members?: Array<{id:string;name:string}>; departments?: Array<{id:string;name:string;is_active:boolean;is_default?:boolean}>; member_ids?: string[]; operators?: Array<{id:string;name:string;eligible:boolean;can_attend:boolean;is_active:boolean;staff_role:"manager"|"operator"|"both";is_manager?:boolean}>;
  participants?: UnionWhatsAppParticipant[]; participation_status?: "requested" | "active";
  queue_settings?: UnionWhatsAppQueueSettings;
  orders?: Array<{id:string;os_number:string;created_at:string}>; service_order_id?: string|null;
  history?: Array<{id:string;protocol_id:string|null;action:string;actor_id:string;to_user_id:string|null;to_department_id:string|null;created_at:string}> }> {
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
