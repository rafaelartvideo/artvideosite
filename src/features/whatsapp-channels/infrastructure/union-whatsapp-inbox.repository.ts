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
  awaiting_reply_since: string | null;
  forwarded_by: string | null;
  forwarded_to: string | null;
  forwarded_to_department: string | null;
  forwarded_by_name: string | null;
  forwarded_to_name: string | null;
  forwarded_at: string | null;
  finished_by?: string | null;
  finished_by_name?: string | null;
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
export type UnionWhatsAppProtocolMarker = Pick<UnionWhatsAppProtocol,"id"|"protocol_number"|"opened_at"|"closed_at">;

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
  auto_prioritize_unanswered:boolean;
  unanswered_priority_minutes:number;
};
export const DEFAULT_WHATSAPP_QUEUE_SETTINGS:UnionWhatsAppQueueSettings = {
  warning_minutes:5,critical_minutes:15,
  show_wait_time:true,show_queue_position:true,show_forward_badges:true,
  auto_prioritize_unanswered:true,unanswered_priority_minutes:15,
};

export type UnionWhatsAppGroup = {
  jid:string;
  name:string;
  topic:string;
  participants_count:number;
  is_announce:boolean;
};

export type UnionWhatsAppGroupMember = {
  jid:string;is_admin:boolean;is_super_admin:boolean;name?:string|null;
};
export type UnionWhatsAppGroupDetails = UnionWhatsAppGroup & {
  is_locked:boolean;participants:UnionWhatsAppGroupMember[];
};

export type UnionWhatsAppGroupMessage = {
  id:number;sender_jid:string;sent_at:string;message_type:string;text:string;
};
export type UnionWhatsAppGroupJoinRequest = {jid:string;requested_at:string};
export type UnionWhatsAppInviteInfo = {name:string;jid:string};

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

export type UnionWhatsAppInboxFilter="waiting"|"in_att"|"forwarded"|"finished"|"unread"|"unanswered";
export type UnionWhatsAppConversationCounts={
  waiting:number;in_att:number;forwarded:number;finished:number;total:number;unread:number;unanswered:number;
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
const columns="id,organization_id,channel_id,account_phone,chat_jid,contact_name,contact_phone,status,assigned_to,department_id,service_order_id,last_message,last_message_at,unread_count,created_at,last_protocol_number,queue_entered_at,awaiting_reply_since,forwarded_by,forwarded_to,forwarded_to_department,forwarded_by_name,forwarded_to_name,forwarded_at";

type FinishAttribution = {assignedTo:string|null;closedBy:string|null;actorName:string|null;cachedAt:number};
const finishAttributionCache=new Map<string,FinishAttribution>();
const FINISH_ATTRIBUTION_TTL_MS=120_000;
const finishAttributionKey=(org:string,item:UnionWhatsAppConversation)=>
  org+":"+item.id+":"+item.last_protocol_number;

// Consulta em lote apenas os protocolos finalizados na página visível.
// A atribuição continua vinculada ao protocolo, não ao histórico completo.
async function withFinishAttributions(
  organizationId:string,channelId:string,accountPhone:string,
  conversations:UnionWhatsAppConversation[],
):Promise<UnionWhatsAppConversation[]>{
  const finished=conversations.filter(item=>item.status==="finished" && item.last_protocol_number!=null);
  if(!finished.length)return conversations;
  const now=Date.now();
  const missing=finished.filter(item=>{
    const cached=finishAttributionCache.get(finishAttributionKey(organizationId,item));
    return !cached || now-cached.cachedAt>=FINISH_ATTRIBUTION_TTL_MS;
  });
  if(missing.length){
    try{
      const numbers=[...new Set(missing.map(item=>Number(item.last_protocol_number)))];
      const {data:protocols,error}=await supabase.from("union_whatsapp_protocols")
        .select("conversation_id,protocol_number,assigned_to,closed_by")
        .eq("organization_id",organizationId).eq("channel_id",channelId)
        .eq("account_phone",accountPhone).eq("status","finished")
        .in("protocol_number",numbers);
      raise(error);
      const byProtocol=new Map((protocols||[]).map(row=>[
        row.conversation_id+":"+row.protocol_number,row,
      ]));
      const actorIds=[...new Set((protocols||[])
        .filter(row=>row.closed_by && row.assigned_to && row.closed_by!==row.assigned_to)
        .map(row=>row.closed_by as string))];
      const {data:profiles,error:profileError}=actorIds.length
        ? await supabase.from("profiles").select("id,full_name,username").in("id",actorIds)
        : {data:[],error:null};
      raise(profileError);
      const names=new Map((profiles||[]).map(profile=>[
        profile.id,String(profile.full_name||profile.username||"").trim(),
      ]));
      for(const item of missing){
        const record=byProtocol.get(item.id+":"+item.last_protocol_number);
        finishAttributionCache.set(finishAttributionKey(organizationId,item),{
          assignedTo:record?.assigned_to||null,
          closedBy:record?.closed_by||null,
          actorName:record?.closed_by ? names.get(record.closed_by)||"Usuário" : null,
          cachedAt:now,
        });
      }
      while(finishAttributionCache.size>300)
        finishAttributionCache.delete(finishAttributionCache.keys().next().value!);
    }catch{
      // Uma falha de atribuição complementar nunca bloqueia o atendimento.
    }
  }
  return conversations.map(item=>{
    if(item.status!=="finished" || item.last_protocol_number==null)return item;
    const attribution=finishAttributionCache.get(finishAttributionKey(organizationId,item));
    if(!attribution?.closedBy || !attribution.assignedTo ||
       attribution.closedBy===attribution.assignedTo)return item;
    return {...item,finished_by:attribution.closedBy,
      finished_by_name:attribution.actorName||"Usuário"};
  });
}


// Uses the existing partial index and RLS. Count only; never fetch all messages or contacts.
const unansweredCutoff=(minutes:number):string=>
  new Date(Date.now()-Math.min(1440,Math.max(1,Math.floor(minutes||15)))*60_000).toISOString();

export async function listUnionWhatsAppUnansweredCount(
  organizationId:string,channelId:string,accountPhone:string,priorityMinutes=15,
):Promise<number>{
  const {count,error}=await supabase.from("union_whatsapp_conversations")
    .select("id",{count:"exact",head:true})
    .eq("organization_id",organizationId).eq("channel_id",channelId)
    .eq("account_phone",accountPhone).eq("status","in_att")
    .is("forwarded_at",null).lte("awaiting_reply_since",unansweredCutoff(priorityMinutes));
  raise(error);
  return count??0;
}

// Counts do not need to run on every message event or page refresh.
// Share concurrent requests and reuse tenant/channel-scoped results briefly.
// Failed requests are evicted immediately so the next refresh can recover.
const WHATSAPP_COUNTS_CACHE_TTL_MS=20_000;
const whatsappCountsCache=new Map<string,{
  expiresAt:number;pending:boolean;request:Promise<UnionWhatsAppConversationCounts>;
}>();
export function listUnionWhatsAppConversationCounts(
  organizationId:string,channelId:string,accountPhone:string,priorityMinutes=15,viewerId?:string,
):Promise<UnionWhatsAppConversationCounts>{
  const minutes=Math.min(1440,Math.max(1,Math.floor(priorityMinutes||15)));
  const key=JSON.stringify([organizationId,channelId,accountPhone,minutes,viewerId]);
  const now=Date.now();
  const cached=viewerId?whatsappCountsCache.get(key):undefined;
  if(cached && (cached.pending || cached.expiresAt>now))return cached.request;
  const request=(async():Promise<UnionWhatsAppConversationCounts>=>{
    const [{data,error},unanswered]=await Promise.all([
      supabase.rpc("union_whatsapp_inbox_counts",{
        p_organization:organizationId,p_channel:channelId,p_account_phone:accountPhone,
      }),
      listUnionWhatsAppUnansweredCount(organizationId,channelId,accountPhone,minutes),
    ]);
    raise(error);
    const row=Array.isArray(data)?data[0]:data;
    return {
      waiting:Number(row?.waiting_count||0),in_att:Number(row?.in_att_count||0),
      forwarded:Number(row?.forwarded_count||0),finished:Number(row?.finished_count||0),
      total:Number(row?.total_count||0),unread:Number(row?.unread_count||0),unanswered,
    };
  })();
  if(!viewerId)return request;
  whatsappCountsCache.delete(key);
  whatsappCountsCache.set(key,{expiresAt:now+WHATSAPP_COUNTS_CACHE_TTL_MS,pending:true,request});
  while(whatsappCountsCache.size>16)
    whatsappCountsCache.delete(whatsappCountsCache.keys().next().value!);
  void request.then(()=>{
    const current=whatsappCountsCache.get(key);
    if(current?.request===request)current.pending=false;
  },()=>{
    if(whatsappCountsCache.get(key)?.request===request)whatsappCountsCache.delete(key);
  });
  return request;
}

export async function listUnionWhatsAppConversations(
  organizationId:string,channelId:string,accountPhone:string,
  options:{filter:UnionWhatsAppInboxFilter;department:string;operator?:string;search:string;page:number;pageSize?:number;sortByRecent?:boolean;viewerId?:string;canViewAll?:boolean;includeCount?:boolean;prioritizeUnanswered?:boolean;priorityMinutes?:number},
):Promise<{items:UnionWhatsAppConversation[];hasMore:boolean;total:number|null}>{
  const page=Math.max(0,Math.floor(options.page));
  // O mini-Atendimentos solicita só 8 registros; a lista completa mantém 50.
  const pageSize=options.pageSize===undefined?INBOX_PAGE_SIZE:
    Math.min(INBOX_PAGE_SIZE,Math.max(1,Math.floor(options.pageSize)));
  // RLS exposes only the current operator's membership. Embed it in the same
  // paginated request to avoid one participation lookup per conversation.
  let query=supabase.from("union_whatsapp_conversations")
    .select(`${columns},viewer_membership:union_whatsapp_conversation_participants(user_id,status)`,options.includeCount===false?undefined:{count:"exact"})
    .eq("organization_id",organizationId)
    .eq("channel_id",channelId)
    .eq("account_phone",accountPhone);
  if(options.viewerId){
    query=query.eq("viewer_membership.user_id",options.viewerId)
      .eq("viewer_membership.status","active");
  }
  if(options.filter==="unanswered"){
    // Filter overdue active chats globally BEFORE pagination; normal inbox stays recent-first.
    query=query.eq("status","in_att").is("forwarded_at",null)
      .lte("awaiting_reply_since",unansweredCutoff(options.priorityMinutes??15));
  }else if(options.filter==="unread"){
    // Filter server-side before pagination; don't download the whole inbox.
    query=query.gt("unread_count",0);
  }else if(options.filter==="forwarded"){
    query=query.not("forwarded_at","is",null).neq("status","finished").neq("status","abandoned");
    // The sender does not retain an operator inbox entry after handing off.
    // Manager visibility is preserved through view_all and the database policy.
    if(!options.canViewAll){
      if(!options.viewerId) return {items:[],hasMore:false,total:0};
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
  const {data,error,count}=await query.order(sort,{ascending:options.filter==="waiting" && !options.sortByRecent,nullsFirst:false})
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
  return {items:await withFinishAttributions(organizationId,channelId,accountPhone,items),
    hasMore:entries.length>pageSize,total:count??null};
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
  return data ? (await withFinishAttributions(organizationId,channelId,accountPhone,
    [data as UnionWhatsAppConversation]))[0] : null;
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
  category:UnionWhatsAppSharedTab,before:UnionWhatsAppMessageCursor|null=null,
):Promise<{items:UnionWhatsAppMessage[];hasMore:boolean;nextCursor:UnionWhatsAppMessageCursor|null}>{
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
  if(before)query=query.or(`sent_at.lt.${before.sent_at},and(sent_at.eq.${before.sent_at},id.lt.${before.id})`);
  const {data,error}=await query.order("sent_at",{ascending:false})
    .order("id",{ascending:false}).limit(SHARED_PAGE_SIZE+1);
  raise(error);
  const rows=(data||[]) as UnionWhatsAppMessage[];
  const items=rows.slice(0,SHARED_PAGE_SIZE),oldest=items[items.length-1];
  return {items,hasMore:rows.length>SHARED_PAGE_SIZE,
    nextCursor:oldest?{sent_at:oldest.sent_at,id:oldest.id}:null};
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
  return data ? (await withFinishAttributions(organizationId,channelId,accountPhone,
    [data as UnionWhatsAppConversation]))[0] : null;
}

// Lightweight metadata for chat separators. A conversation with just one
// attendance receives no separators; no message history is fetched here.
export async function listUnionWhatsAppProtocolMarkers(
  organizationId:string,conversationId:string,channelId:string,accountPhone:string,
):Promise<UnionWhatsAppProtocolMarker[]>{
  const pageSize=100;
  const markers:UnionWhatsAppProtocolMarker[]=[];
  for(let offset=0;offset<2000;offset+=pageSize){
    const {data,error}=await supabase.from("union_whatsapp_protocols")
      .select("id,protocol_number,opened_at,closed_at")
      .eq("organization_id",organizationId).eq("channel_id",channelId)
      .eq("account_phone",accountPhone).eq("conversation_id",conversationId)
      .order("opened_at",{ascending:false}).order("id",{ascending:false})
      .range(offset,offset+pageSize-1);
    raise(error);
    const page=(data||[]) as UnionWhatsAppProtocolMarker[];
    markers.push(...page);
    if(page.length<pageSize)break;
  }
  return markers;
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
export type UnionWhatsAppInboxAction = "participants" | "participant_add" | "participant_respond" | "participant_remove" | "participant_request_protocol" | "os_join" | "contact_join" | "assume" | "return_queue" | "finish" | "reopen" | "mark_read" | "send_text" | "members" | "transfer" | "send_media" | "sticker_send" | "sticker_list" | "sticker_saved_ids" | "sticker_prepare" | "sticker_commit" | "sticker_save" | "sticker_favorite" | "sticker_remove" | "media_view" | "start" | "check_number" | "number_verification_status" | "contact_names_batch" | "channel_status" | "prepare_media" | "resolve_contact" | "contact_avatar" | "customer_match" | "departments_list" | "department_save" | "department_members" | "department_set_member" | "operator_list" | "operator_filter_list" | "operator_set" | "role_permissions_list" | "role_permissions_save" | "queue_default" | "queue_settings_get" | "queue_settings_save" | "transfer_department" | "handoff_history" | "order_recipients" | "order_options" | "order_link" | "presence_subscribe" | "contacts_list" | "contacts_avatar" | "contacts_groups" | "contacts_groups_avatar" | "contacts_groups_manage" | "contacts_crm_match" | "contacts_import" | "contacts_save" | "contacts_import_device" | "contacts_import_batch" | "contacts_apply_names" | "contacts_history";

export async function operateUnionWhatsAppInbox(
  organizationId: string,
  conversationId: string,
  action: UnionWhatsAppInboxAction,
  extra: { filter?: "in_att"|"finished"|"forwarded"; channel_id?: string; department_filter?: string; text?: string; client_message_id?: string; reply_to_message_id?: string; no_operator_prefix?: boolean; message_ids?: string[]; target_user_id?: string; approve?: boolean; protocol_number?: number;
    first_message?: string; conversation_ids?: string[]; sticker_id?: string; is_favorite?: boolean; media_base64?: string; media_name?: string; media_mime?: string; media_type?: string; message_id?: string; phone?: string; contact_name?: string; media_size?: number; media_path?: string; department_id?: string; name?: string; is_active?: boolean; enabled?: boolean; permissions?: Array<{capability:string;enabled:boolean}>; staff_role?: "manager"|"operator"|"both"; service_order_id?: string; unlink?: boolean; linked_conversation_id?: string; registered_phone_field?: "whatsapp"|"phone"; entity_contact_id?: string; entity_id?: string; customer_id?: string; chat_jid?: string; display_name?: string; search?: string; page?: number; contacts?: Array<{name:string;phone:string}>; account_phone?: string; group_command?: "create"|"details"|"leave"|"participants"|"name"|"topic"|"send"|"invite"|"announce"|"locked"|"memberaddmode"|"ephemeral"|"joinapproval"|"join"|"inviteinfo"|"requests"|"requests_update"|"photo"|"photo_remove"|"history"|"send_image"; group_jid?: string; group_name?: string; group_topic?: string; group_phones?: string[]; group_participant_action?: "add"|"remove"|"promote"|"demote"; group_message?: string; group_mode?:boolean|"admin_add"|"all_member_add"; group_duration?:"off"|"24h"|"7d"|"90d"; group_invite_code?:string; group_reset?:boolean; group_photo?:string; group_before?:number; warning_minutes?: number; critical_minutes?: number; show_wait_time?: boolean; show_queue_position?: boolean; show_forward_badges?: boolean; auto_prioritize_unanswered?:boolean; unanswered_priority_minutes?:number } = {},
  mediaRequestSignal?: AbortSignal,
): Promise<{ success: true; already_sent?: boolean; provider_confirmed?: boolean; message_id?: string; provider_message_id?: string; conversation_id?: string; contact_name?: string; name_source?: "agenda"|"agenda_whatsapp"|"conversa"|"whatsapp"|null; avatar_url?: string | null; contacts?: UnionWhatsAppContact[]; groups?: UnionWhatsAppGroup[]; group?: UnionWhatsAppGroupDetails; jid?:string; changed?:number; invite_link?:string; invite_info?:UnionWhatsAppInviteInfo; requests?:UnionWhatsAppGroupJoinRequest[]; history_available?:boolean; messages?:UnionWhatsAppGroupMessage[]; next_before?:number|null; history?: UnionWhatsAppContactChange[]; has_more?: boolean; total?: number; imported?: number; truncated?: boolean; contact?: UnionWhatsAppContact; phone?: string; verified?: boolean; verified_at?: string | null; adjusted?: boolean; distinct_identities?: boolean; verified_name?: string; alternatives?: Array<{phone:string;query?:string;verified_name?:string}>; customer?: {id:string;name:string;customer_type?:string|null;gender?:string|null;document?:string|null;cnpj?:string|null;trade_name?:string|null;legal_name?:string|null;email?:string|null;phone?:string|null;whatsapp?:string|null;state_registration?:string|null;municipal_registration?:string|null;addresses?:Array<{id:string;street:string|null;number:string|null;complement:string|null;neighborhood:string|null;city:string|null;state:string|null;zip_code:string|null;reference:string|null;is_default:boolean|null}>} | null; ambiguous?: boolean; channel_connected?: boolean; channel_id?: string|null; channel_phone?: string|null; staff_role?: "manager"|"operator"|"both"|null; capabilities?: Record<string,boolean>; capability_definitions?: Array<{key:string;label:string;category:"Conversas"|"Administração";sort_order:number;manager:boolean;operator:boolean}>; upload_path?: string; upload_token?: string; url?: string; download_url?: string|null; filename?: string; mime?: string; members?: Array<{id:string;name:string}>; departments?: Array<{id:string;name:string;is_active:boolean;is_default?:boolean}>; member_ids?: string[]; operators?: Array<{id:string;name:string;eligible:boolean;can_attend:boolean;is_active:boolean;staff_role:"manager"|"operator"|"both";is_manager?:boolean}>;
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
    field?:"whatsapp"|"phone";conversation_id?:string;entity_contact_id?:string}>;
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
