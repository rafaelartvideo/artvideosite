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
  viewer_participating?: boolean;
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
  reply_to_provider_message_id?: string | null;
  reply_to_text?: string | null;
  reply_to_message_type?: string | null;
  reply_to_direction?: "incoming" | "outgoing" | null;
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

export type UnionWhatsAppSavedSticker = {
  id: string;
  preview_url: string | null;
  is_favorite: boolean;
  created_at: string;
  last_used_at: string | null;
  file_size: number;
  can_remove: boolean;
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

export type UnionWhatsAppGroup = {
  jid:string;
  name:string;
  topic:string;
  participants_count:number;
  is_announce:boolean;
};

export type UnionWhatsAppContactChange = {
  id:number;
  action:"created"|"updated";
  actor_name_snapshot:string;
  created_at:string;
  changed_fields:Record<string,{before:unknown;after:unknown}>;
};

export type UnionWhatsAppContact = {
  id: string;
  chat_jid: string;
  contact_phone: string | null;
  display_name: string | null;
  crm_name?: string | null;
  imported_name: string | null;
  device_name: string | null;
  profile_name: string | null;
  updated_at: string;
};

const raise = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export type UnionWhatsAppInboxFilter="waiting"|"in_att"|"forwarded"|"finished"|"unread";
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
const columns="id,organization_id,channel_id,account_phone,chat_jid,contact_name,contact_phone,status,assigned_to,department_id,service_order_id,last_message,last_message_at,unread_count,created_at,last_protocol_number,queue_entered_at,forwarded_by,forwarded_to,forwarded_to_department,forwarded_by_name,forwarded_to_name,forwarded_at";

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
  options:{filter:UnionWhatsAppInboxFilter;department:string;operator?:string;search:string;page:number;pageSize?:number;sortByRecent?:boolean;viewerId?:string;canViewAll?:boolean},
):Promise<{items:UnionWhatsAppConversation[];hasMore:boolean}>{
  const page=Math.max(0,Math.floor(options.page));
  // O mini-Atendimentos solicita só 8 registros; a lista completa mantém 50.
  const pageSize=options.pageSize===undefined?INBOX_PAGE_SIZE:
    Math.min(INBOX_PAGE_SIZE,Math.max(1,Math.floor(options.pageSize)));
  // RLS exposes only the current operator's membership. Embed it in the same
  // paginated request to avoid one participation lookup per conversation.
  let query=supabase.from("union_whatsapp_conversations")
    .select(`${columns},viewer_membership:union_whatsapp_conversation_participants(user_id,status)`)
    .eq("organization_id",organizationId)
    .eq("channel_id",channelId)
    .eq("account_phone",accountPhone);
  if(options.viewerId){
    query=query.eq("viewer_membership.user_id",options.viewerId)
      .eq("viewer_membership.status","active");
  }
  if(options.filter==="unread"){
    // Filter server-side before pagination; don't download the whole inbox.
    query=query.gt("unread_count",0);
  }else if(options.filter==="forwarded"){
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
  // Filter BEFORE pagination so the manager sees the complete result set.
  // Finalizados retain the last assignee; Encaminhadas use the sender, since
  // assigning to another operator or returning to a department changes assigned_to.
  if(options.canViewAll && options.operator && options.operator!=="all"){
    if(options.filter==="in_att" || options.filter==="finished")
      query=query.eq("assigned_to",options.operator);
    else if(options.filter==="forwarded")
      query=query.eq("forwarded_by",options.operator);
  }

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
  const sort=options.filter==="waiting" && !options.sortByRecent?"queue_entered_at":
    options.filter==="forwarded"?"forwarded_at":"last_message_at";
  const {data,error}=await query.order(sort,{ascending:options.filter==="waiting" && !options.sortByRecent,nullsFirst:false})
    .order("id",{ascending:options.filter==="waiting" && !options.sortByRecent})
    .range(page*pageSize,(page+1)*pageSize);
  raise(error);
  const entries=(data||[]) as Array<UnionWhatsAppConversation & {
    viewer_membership?: Array<{user_id:string;status:string}>;
  }>;
  const items=entries.slice(0,pageSize).map(({viewer_membership,...conversation})=>({
    ...conversation,
    viewer_participating:conversation.status==="in_att" &&
      Boolean(options.viewerId && conversation.assigned_to!==options.viewerId &&
        viewer_membership?.some(member=>member.user_id===options.viewerId && member.status==="active")),
  }));
  return {items,hasMore:entries.length>pageSize};
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
    .select("id,organization_id,conversation_id,protocol_id,provider_message_id,direction,message_type,body_text,sender_name,sent_at,delivery_status,media_path,media_name,media_mime,media_available,reply_to_provider_message_id,reply_to_text,reply_to_message_type,reply_to_direction")
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

// Compartilhamentos do perfil da conversa: carregamento por aba, paginado,
// com o mesmo escopo e políticas RLS já usados no histórico.
export type UnionWhatsAppSharedTab="media"|"documents"|"links";
const SHARED_PAGE_SIZE=24;
export async function listUnionWhatsAppSharedItems(
  organizationId:string,conversationId:string,channelId:string,accountPhone:string,
  category:UnionWhatsAppSharedTab,page=0,
):Promise<{items:UnionWhatsAppMessage[];hasMore:boolean}>{
  let query=supabase.from("union_whatsapp_messages")
    .select("id,organization_id,conversation_id,protocol_id,provider_message_id,direction,message_type,body_text,sender_name,sent_at,delivery_status,media_path,media_name,media_mime,media_available")
    .eq("organization_id",organizationId)
    .eq("channel_id",channelId)
    .eq("account_phone",accountPhone)
    .eq("conversation_id",conversationId);
  if(category==="media")query=query.in("message_type",["image","video","sticker","audio"]);
  else if(category==="documents")query=query.eq("message_type","file");
  else query=query.eq("message_type","text")
    .or("body_text.ilike.%http%,body_text.ilike.%www.%");
  const offset=Math.max(0,Math.floor(page))*SHARED_PAGE_SIZE;
  const {data,error}=await query.order("sent_at",{ascending:false})
    .order("id",{ascending:false}).range(offset,offset+SHARED_PAGE_SIZE);
  raise(error);
  const rows=(data||[]) as UnionWhatsAppMessage[];
  return {items:rows.slice(0,SHARED_PAGE_SIZE),hasMore:rows.length>SHARED_PAGE_SIZE};
}

// Consulta sob RLS e escopo estrito: somente a conversa do contato selecionado.
export async function findUnionWhatsAppConversationByContact(
  organizationId:string,channelId:string,accountPhone:string,chatJid:string,
):Promise<UnionWhatsAppConversation|null>{
  const {data,error}=await supabase.from("union_whatsapp_conversations")
    .select(columns).eq("organization_id",organizationId)
    .eq("channel_id",channelId).eq("account_phone",accountPhone)
    .eq("chat_jid",chatJid).maybeSingle();
  raise(error);
  return data as UnionWhatsAppConversation|null;
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
export type UnionWhatsAppInboxAction = "participants" | "participant_add" | "participant_respond" | "participant_remove" | "participant_request_protocol" | "os_join" | "contact_join" | "assume" | "return_queue" | "finish" | "reopen" | "mark_read" | "send_text" | "members" | "transfer" | "send_media" | "sticker_send" | "sticker_list" | "sticker_saved_ids" | "sticker_prepare" | "sticker_commit" | "sticker_save" | "sticker_favorite" | "sticker_remove" | "media_view" | "start" | "check_number" | "number_verification_status" | "contact_names_batch" | "channel_status" | "prepare_media" | "resolve_contact" | "contact_avatar" | "customer_match" | "departments_list" | "department_save" | "department_members" | "department_set_member" | "operator_list" | "operator_filter_list" | "operator_set" | "role_permissions_list" | "role_permissions_save" | "queue_default" | "queue_settings_get" | "queue_settings_save" | "transfer_department" | "handoff_history" | "order_recipients" | "order_options" | "order_link" | "presence_subscribe" | "contacts_list" | "contacts_avatar" | "contacts_groups" | "contacts_crm_match" | "contacts_import" | "contacts_save" | "contacts_import_device" | "contacts_import_batch" | "contacts_apply_names" | "contacts_history";

export async function operateUnionWhatsAppInbox(
  organizationId: string,
  conversationId: string,
  action: UnionWhatsAppInboxAction,
  extra: { filter?: "in_att"|"finished"|"forwarded"; channel_id?: string; department_filter?: string; text?: string; client_message_id?: string; reply_to_message_id?: string; no_operator_prefix?: boolean; message_ids?: string[]; target_user_id?: string; approve?: boolean; protocol_number?: number;
    first_message?: string; conversation_ids?: string[]; sticker_id?: string; is_favorite?: boolean; media_base64?: string; media_name?: string; media_mime?: string; media_type?: string; message_id?: string; phone?: string; contact_name?: string; media_size?: number; media_path?: string; department_id?: string; name?: string; is_active?: boolean; enabled?: boolean; permissions?: Array<{capability:string;enabled:boolean}>; staff_role?: "manager"|"operator"|"both"; service_order_id?: string; unlink?: boolean; linked_conversation_id?: string; registered_phone_field?: "whatsapp"|"phone"; chat_jid?: string; display_name?: string; search?: string; page?: number; contacts?: Array<{name:string;phone:string}>; account_phone?: string; warning_minutes?: number; critical_minutes?: number; show_wait_time?: boolean; show_queue_position?: boolean; show_forward_badges?: boolean } = {},
  mediaRequestSignal?: AbortSignal,
): Promise<{ success: true; already_sent?: boolean; provider_confirmed?: boolean; message_id?: string; provider_message_id?: string; conversation_id?: string; contact_name?: string; name_source?: "agenda"|"agenda_whatsapp"|"conversa"|"whatsapp"|null; avatar_url?: string | null; contacts?: UnionWhatsAppContact[]; groups?: UnionWhatsAppGroup[]; history?: UnionWhatsAppContactChange[]; has_more?: boolean; total?: number; imported?: number; truncated?: boolean; contact?: UnionWhatsAppContact; phone?: string; verified?: boolean; verified_at?: string | null; adjusted?: boolean; distinct_identities?: boolean; verified_name?: string; alternatives?: Array<{phone:string;query?:string;verified_name?:string}>; customer?: {id:string;name:string;customer_type?:string|null;gender?:string|null;document?:string|null;cnpj?:string|null;trade_name?:string|null;legal_name?:string|null;email?:string|null;phone?:string|null;whatsapp?:string|null;state_registration?:string|null;municipal_registration?:string|null;addresses?:Array<{id:string;street:string|null;number:string|null;complement:string|null;neighborhood:string|null;city:string|null;state:string|null;zip_code:string|null;reference:string|null;is_default:boolean|null}>} | null; ambiguous?: boolean; channel_connected?: boolean; channel_id?: string|null; channel_phone?: string|null; staff_role?: "manager"|"operator"|"both"|null; capabilities?: Record<string,boolean>; capability_definitions?: Array<{key:string;label:string;category:"Conversas"|"Administração";sort_order:number;manager:boolean;operator:boolean}>; upload_path?: string; upload_token?: string; url?: string; filename?: string; mime?: string; members?: Array<{id:string;name:string}>; departments?: Array<{id:string;name:string;is_active:boolean;is_default?:boolean}>; member_ids?: string[]; operators?: Array<{id:string;name:string;eligible:boolean;can_attend:boolean;is_active:boolean;staff_role:"manager"|"operator"|"both";is_manager?:boolean}>;
  operator_counts?: Record<string,number>;
  participants?: UnionWhatsAppParticipant[]; participation_status?: "requested" | "active";
  found?: boolean; can_start?: boolean; first_message_sent?: boolean; participating?: boolean; responsible_name?: string | null;
  queue_settings?: UnionWhatsAppQueueSettings;
  stickers?: UnionWhatsAppSavedSticker[]; saved_message_ids?: string[]; sticker_id?: string; already_saved?: boolean;
  orders?: Array<{id:string;os_number:string;created_at:string;customer_name?:string}>;
  linked_orders?: Array<{id:string;os_number:string;created_at:string;customer_name?:string}>;
  display_names?: Array<{id:string;name:string}>;
  linked_via_order?: boolean;
  recipients?: Array<{kind:"registered"|"linked";name:string;phone:string;
    field?:"whatsapp"|"phone";conversation_id?:string}>;
  service_order_id?: string|null;
  history?: Array<{id:string;protocol_id:string|null;action:string;actor_id:string;to_user_id:string|null;to_department_id:string|null;created_at:string}>;
  equipments?: Array<{id:string;equipment_type_name:string|null;equipment_brand_name:string|null;equipment_model_name:string|null;serial_number:string|null;technical_values?:Array<{technical_field_id?:string;label_snapshot?:string|null;field_key_snapshot?:string|null;value_text?:string|null;value_number?:number|null}>|null;created_at?:string|null;updated_at?:string|null}>;
  crm_orders?: Array<{id:string;os_number:string;created_at:string;completed_at:string|null;cancelled_at?:string|null;return_root_id?:string|null;model:string|null;customer_equipment?:{equipment_type_name:string|null;equipment_brand_name:string|null;equipment_model_name:string|null}|null;equipment_type?:{name:string}|null;equipment_brand?:{name:string}|null;equipment_model?:{name:string}|null;order_status?:{name:string;color?:string|null}|null;situation?:{name:string;color?:string|null}|null}> }> {
  const { data, error } = await supabase.functions.invoke("union-whatsapp-inbox", {
    body: {
      action, organization_id: organizationId, conversation_id: conversationId, ...extra,
    },
    signal: mediaRequestSignal,
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


/**
 * A prévia do WhatsApp não cria atendimento. Somente o envio explícito da
 * primeira mensagem aciona start e send_text, preservando o histórico.
 * O ID do primeiro envio é único e passado ao servidor para deduplicação.
 */
export async function startUnionWhatsAppWithFirstMessage(
  organizationId:string,phone:string,contactName:string,message:string,
  clientMessageId:string=crypto.randomUUID(),
):Promise<string>{
  const text=message.trim();
  if(!text)throw new Error("Digite a primeira mensagem antes de iniciar o atendimento.");
  if(text.length>4000)throw new Error("Mensagem muito longa. Reduza o texto.");
  // start + envio são tratados como uma única intenção no backend.
  // A ponte confirma a mensagem antes da criação/reabertura do protocolo.
  const sent=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"start",{
    phone,contact_name:contactName,first_message:text,client_message_id:clientMessageId,
  });
  if(!sent.conversation_id || !sent.first_message_sent)
    throw new Error("Não foi possível confirmar o envio da primeira mensagem.");
  return sent.conversation_id;
}
