import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Public WuzAPI webhook. Per-channel HMAC-SHA256 signatures are preferred;
// existing high-entropy session-token digests are a temporary compatibility
// fallback while the VPS bridge is updated. Never accept unsigned events
// without a verified token or leak provider tokens via URL/logs.
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const str = (value: unknown, max = 4000) => typeof value === "string" ? value.slice(0, max) : "";
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const get = (value: Record<string, unknown>, ...keys: string[]) =>
  keys.map(key => value[key]).find(item => item !== undefined && item !== null);
const digest = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
)).map(byte => byte.toString(16).padStart(2, "0")).join("");
const hmacHex = async (key: Uint8Array<ArrayBuffer> | string, value: string) => {
  const encoder = new TextEncoder();
  const bytes = typeof key === "string" ? encoder.encode(key) : key;
  const imported = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(value))))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
};
const constantTimeHexEqual = (left: string, right: string) => {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
};
// Go's url.Values.Encode sorts form keys before producing the HMAC input.
const canonicalForm = (input: string) => {
  // Go net/url.QueryEscape keeps ~ literal; URLSearchParams.toString() does
  // not. Exact byte equivalence matters for signatures on customer messages.
  const encoder = new TextEncoder();
  const encode = (value: string) => Array.from(encoder.encode(value)).map(byte =>
    (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122)
      || (byte >= 48 && byte <= 57) || [45, 46, 95, 126].includes(byte)
      ? String.fromCharCode(byte)
      : byte === 32 ? "+" : "%" + byte.toString(16).toUpperCase().padStart(2, "0")
  ).join("");
  const entries = [...new URLSearchParams(input).entries()];
  entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return entries.map(([key, value]) => encode(key) + "=" + encode(value)).join("&");
};
const dateOf = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value < 1e11 ? value * 1000 : value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
  }
  if (typeof value === "string" && value.length < 64) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1000000000) return dateOf(numeric);
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
};

Deno.serve(async request => {
  if (request.method !== "POST") return json({ ok: false }, 405);
  const channelId = new URL(request.url).searchParams.get("channel") || "";
  if (!uuid(channelId)) return json({ ok: false }, 404);
  let adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!adminKey) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      adminKey = String(keys.default || Object.values(keys)[0] || "");
    } catch { /* Leave unconfigured rather than trust an invalid key. */ }
  }
  const url = Deno.env.get("SUPABASE_URL");
  if (!url || !adminKey) return json({ ok: false }, 503);
  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const raw = await request.text();
    if (raw.length > 1024 * 1024) return json({ ok: true, ignored: "size" }, 202);
    let payload: Record<string, unknown>;
    let token = "";
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(raw);
      token = form.get("token") || "";
      payload = obj(JSON.parse(form.get("jsonData") || "{}"));
    } else if (contentType.includes("application/json")) {
      payload = obj(JSON.parse(raw));
      token = str(payload.token, 256);
    } else return json({ ok: false }, 415);

    const providerSignature = str(request.headers.get("x-hmac-signature"), 128);
    let authenticated = false;
    if (providerSignature) {
      // Signed callbacks: don't permit fallback to weaker credentials on an
      // invalid signature. The same shared secret is already installed in
      // both the bridge service and the Supabase Edge Functions environment.
      const shared = Deno.env.get("UNION_WUZAPI_BRIDGE_SECRET")?.trim() || "";
      if (shared.length < 32 || !/^[a-f0-9]{64}$/i.test(providerSignature)) {
        return json({ ok: false }, 401);
      }
      const derivedKey = await hmacHex(shared, "union-whatsapp-webhook:v1:" + channelId);
      const signable = contentType.includes("application/x-www-form-urlencoded") ? canonicalForm(raw) : raw;
      const expected = await hmacHex(derivedKey, signable);
      authenticated = constantTimeHexEqual(expected, providerSignature);
      if (!authenticated) return json({ ok: false }, 401);
    } else if (/^[a-f0-9]{64}$/i.test(token)) {
      // Backwards-compatible signed-in session format. Existing probes and
      // current form callbacks remain supported without moving any secrets.
      const hash = await digest(token);
      const { data: registered, error: keyError } = await admin
        .from("union_whatsapp_webhook_keys").select("token_sha256")
        .eq("channel_id", channelId).maybeSingle();
      if (keyError || !registered) return json({ ok: false }, 401);
      authenticated = constantTimeHexEqual(registered.token_sha256, hash);
    }
    if (!authenticated) return json({ ok: false }, 401);

    const { data: channel, error: channelError } = await admin
      .from("whatsapp_channel_connections").select("organization_id,phone,state,webhook_ready,last_connected_at").eq("id", channelId).eq("provider", "wuzapi").maybeSingle();
    if (channelError || !channel) return json({ ok: false }, 404);
    // A technical WuzAPI channel can be paired with a different phone later.
    // Do not accept callbacks while disconnected or without a verified account.
    if(channel.state!=="connected" || !channel.webhook_ready ||
      !/^[0-9]{10,15}$/.test(String(channel.phone||"")))
      return json({ok:true,ignored:"inactive_channel"});
    const accountPhone=channel.phone;
    // Non-writing authenticated probe for verifying VPS-to-Supabase delivery.
    // It NEVER inserts a conversation or stores a test message.
    if (payload.type === "UnionProbe") return json({ ok: true, probe: "authenticated" });
    const eventType = str(get(payload, "type", "Type", "event"), 60);
    if(eventType==="Presence" || eventType==="events.Presence") {
      const jid=str(get(payload,"from","From"),160);
      const state=str(get(payload,"state","State"),30).toLowerCase();
      if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid) ||
        !["online","offline"].includes(state))
        return json({ok:true,ignored:"unrecognized_presence"});
      const {error:presenceError}=await admin.from("union_whatsapp_conversations")
        .update({contact_presence:state,contact_presence_at:new Date().toISOString()})
        .eq("organization_id",channel.organization_id)
        .eq("channel_id",channelId).eq("account_phone",accountPhone).eq("chat_jid",jid);
      if(presenceError)throw presenceError;
      return json({ok:true});
    }
    if(["ChatPresence","events.ChatPresence"].includes(eventType)){
      // Evento transitório do WuzAPI/Whatsmeow. Não cria contatos nem
      // altera mensagens; em ausência de eventos, não simular digitação.
      const detail=obj(get(payload,"event","Event"));
      const compact=obj(get(payload,"data","Data"));
      const entry=Object.keys(compact).length?compact:detail;
      const info=obj(get(entry,"Chat","chat"));
      const rawChat=get(entry,"Chat","chat","ChatJID","chatJid","From","from");
      const chatJid=typeof rawChat==="string"?str(rawChat,160):
        str(get(info,"User","user"),30)+"@"+str(get(info,"Server","server"),40);
      const state=str(get(entry,"State","state") ?? get(payload,"state","State"),32).toLowerCase();
      const media=str(get(entry,"Media","media"),30).toLowerCase();
      if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(chatJid) ||
        !["composing","paused"].includes(state))
        return json({ok:true,ignored:"invalid_chat_presence"});
      const presence=state==="paused"?"paused":
        media==="audio"?"recording":"composing";
      // Segundos depois a interface desconsidera o sinal, mesmo se o
      // evento paused for perdido por desconexão.
      const {error:typingError}=await admin.from("union_whatsapp_conversations")
        .update({contact_presence:presence,contact_presence_at:new Date().toISOString()})
        .eq("organization_id",channel.organization_id).eq("channel_id",channelId)
        .eq("account_phone",accountPhone).eq("chat_jid",chatJid);
      if(typingError)throw typingError;
      return json({ok:true});
    }
    if (["ReadReceipt","events.ReadReceipt","Receipt","events.Receipt"].includes(eventType)) {
      // WuzAPI serializes receipts as { type:"ReadReceipt", state:"Delivered"
      // | "Read" | "ReadSelf", event:{ MessageIDs, Chat, Sender, Type } }.
      // The mere event name is NEVER proof that the recipient read a
      // message. Old logic treated a missing state as read: false blue ticks.
      const rawEvent = obj(get(payload, "event", "Event"));
      const compact = obj(get(payload, "data", "Data"));
      const state = str(get(payload,"state","State") ??
        get(compact,"state","State","type","Type") ??
        get(rawEvent,"state","State","type","Type"), 40).toLowerCase();
      if (state !== "delivered" && state !== "read")
        return json({ok:true,ignored:"unconfirmed_receipt_state"});
      const ids = get(rawEvent,"MessageIDs","messageIDs","messageIds","ids","IDs") ??
        get(compact,"MessageIDs","messageIDs","messageIds","ids","IDs");
      if (!Array.isArray(ids)) return json({ok:true,ignored:"invalid_receipt"});
      const uniqueIds = [...new Set(ids.filter((id): id is string =>
        typeof id === "string" && id.length > 0 && id.length <= 180))].slice(0,100);
      if (!uniqueIds.length) return json({ok:true,ignored:"empty_receipt"});
      // The receipt must reference a concrete recipient chat. Never match
      // bare message IDs across contacts, and never mark self-read as read.
      const jidValue = get(rawEvent,"Chat","chat") ?? get(compact,"Chat","chat");
      const jidObject = obj(jidValue);
      const chatUser=str(get(jidObject,"User","user"),30);
      const chatServer=str(get(jidObject,"Server","server"),40);
      const chatJid = typeof jidValue==="string" ? str(jidValue,160) :
        chatUser && chatServer ? chatUser+"@"+chatServer : "";
      if (!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(chatJid))
        return json({ok:true,ignored:"invalid_receipt_chat"});
      const {data:conversation,error:conversationError}=await admin.from("union_whatsapp_conversations")
        .select("id").eq("organization_id",channel.organization_id)
        .eq("channel_id",channelId).eq("account_phone",accountPhone).eq("chat_jid",chatJid).maybeSingle();
      if(conversationError) throw conversationError;
      let receiptThread=conversation;
      // A PN receipt may arrive for a canonical LID thread (verified phone only).
      if(!receiptThread && chatJid.endsWith("@s.whatsapp.net")){
        const {data:byPhone,error:byPhoneError}=await admin.from("union_whatsapp_conversations")
          .select("id").eq("organization_id",channel.organization_id)
          .eq("channel_id",channelId).eq("account_phone",accountPhone)
          .eq("contact_phone",chatJid.split("@")[0]).order("last_message_at",{ascending:false}).limit(1);
        if(byPhoneError)throw byPhoneError;
        receiptThread=byPhone?.[0]||null;
      }
      if(!receiptThread) return json({ok:true,ignored:"unknown_receipt_chat"});
      let query = admin.from("union_whatsapp_messages")
        .update({delivery_status:state==="read"?"read":"delivered"})
        .eq("organization_id",channel.organization_id).eq("channel_id",channelId).eq("account_phone",accountPhone)
        .eq("conversation_id",receiptThread.id)
        .eq("direction","outgoing").in("provider_message_id",uniqueIds);
      if(state==="delivered") query=query.neq("delivery_status","read");
      const {error:receiptError}=await query;
      if(receiptError) throw receiptError;
      return json({ok:true});
    }
    if (eventType !== "Message" && eventType !== "events.Message") return json({ ok: true, ignored: "event_type" });

    // WuzAPI versions expose either {type:"Message",event:{Info,Message}}
    // or {event:"Message",data:{id,chat,message,...}}.
    const event = obj(get(payload, "event", "Event"));
    const compact = obj(get(payload, "data", "Data"));
    const info = Object.keys(compact).length > 0 ? compact : obj(get(event, "Info", "info"));
    const message = Object.keys(compact).length > 0
      ? obj(get(compact, "message", "Message"))
      : obj(get(event, "Message", "message"));
    const providerMessageId = str(get(info, "ID", "Id", "id"), 180);
    // Whatsmeow may serialize the JID either as a string or a {User,Server}
    // object, and some WuzAPI versions use RemoteJid rather than Chat.
    const chatValue = get(info, "Chat", "chat", "RemoteJid", "RemoteJID", "remoteJid", "remoteJID");
    const chatObj = obj(chatValue);
    const chatJid = str(chatValue, 160) || (
      str(get(chatObj, "User", "user"), 30) && str(get(chatObj, "Server", "server"), 40)
        ? str(get(chatObj, "User", "user"), 30) + "@" + str(get(chatObj, "Server", "server"), 40)
        : ""
    );
    // First stage is direct conversations only; do not misclassify groups,
    // statuses, broadcasts or WhatsApp newsletter traffic.
    if (!providerMessageId || !/^\d{5,20}@(s\.whatsapp\.net|lid)$/.test(chatJid)) {
      return json({ ok: true, ignored: "unsupported_chat" });
    }
    const isFromMe = get(info, "IsFromMe", "isFromMe", "fromMe") === true;
    const typeHint = message.stickerMessage || message.StickerMessage ? "sticker"
      : message.imageMessage || message.ImageMessage ? "image"
      : message.videoMessage || message.VideoMessage ? "video"
      : message.audioMessage || message.AudioMessage ? "audio"
      : message.documentMessage || message.DocumentMessage ? "file"
      : message.locationMessage || message.LocationMessage ? "location"
      : message.contactMessage || message.ContactMessage ? "contact" : "text";
    const extended = obj(get(message, "extendedTextMessage", "ExtendedTextMessage"));
    const media = obj(get(message, "imageMessage", "ImageMessage", "videoMessage", "VideoMessage", "audioMessage", "AudioMessage", "documentMessage", "DocumentMessage", "stickerMessage", "StickerMessage"));
    const body = str(get(message, "conversation", "Conversation") ?? get(extended, "text", "Text") ?? get(media, "caption", "Caption"), 4000);
    // WuzAPI can emit a sent/echo envelope without an actual message body.
    // These blank "text" events previously created a phantom contact and
    // made one incoming message look like two separate conversations.
    if (typeHint === "text" && !body.trim()) {
      return json({ ok: true, ignored: "empty_text_event" });
    }
    const displayText = body || ({ image: "Imagem", video: "Vídeo", audio: "Áudio", file: "Documento", location: "Localização", contact: "Contato", sticker:"Figurinha" }[typeHint] || "Mensagem");
    const mediaKind=["image","audio","video","file","sticker"].includes(typeHint);
    const mime=str(get(media,"mimetype","Mimetype","mimeType","MimeType"),160);
    const originalName=str(get(media,"fileName","FileName","filename"),180).replace(/[^\\p{L}\\p{N}._() -]/gu,"");
    const fileLength=Number(get(media,"fileLength","FileLength","fileSize","FileSize") || 0);
    const fileUrl=str(get(media,"URL","Url","url"),2000);
    const mediaKey=str(get(media,"mediaKey","MediaKey"),512);
    const fileHash=str(get(media,"fileSHA256","FileSHA256"),512);
    const fileEncHash=str(get(media,"fileEncSHA256","FileEncSHA256"),512);
    let validMedia=false;
    try {
      const addr=new URL(fileUrl);
      validMedia=mediaKind && addr.protocol==="https:" &&
        (addr.hostname==="whatsapp.net" || addr.hostname.endsWith(".whatsapp.net") ||
          addr.hostname==="fbcdn.net" || addr.hostname.endsWith(".fbcdn.net")) &&
        fileLength>0 && fileLength<=5242880 && Boolean(mediaKey && fileHash && mime);
    } catch { /* A media thumbnail alone is not a decryptable attachment. */ }
    // PushName on IsFromMe events identifies OUR OWN WhatsApp account,
    // not the recipient. Never assign it to the conversation contact.
    const name = isFromMe ? "" : str(get(info, "PushName", "pushName") || "", 160).trim();
    // WhatsApp privacy JIDs (@lid) aren't phone numbers. Only fill a real
    // number when Whatsmeow provides a verified alternate phone JID.
    const altJid = str(get(info,"ChatAlt","chatAlt","chat_alt",
      ...(!isFromMe ? ["SenderAlt","senderAlt"] : [])),160);
    const validPN=(jid:string)=>/^[0-9]{10,15}@s\.whatsapp\.net$/.test(jid);
    const validLID=(jid:string)=>/^[0-9]{5,20}@lid$/.test(jid);
    const verifiedLid=validLID(chatJid)&&validPN(altJid)?chatJid:
      validPN(chatJid)&&validLID(altJid)?altJid:"";
    const verifiedPN=validLID(chatJid)&&validPN(altJid)?altJid:
      validPN(chatJid)&&validLID(altJid)?chatJid:"";
    let savedVerifiedPhone="";
    if(verifiedLid&&verifiedPN){
      // Só pares PN/LID confirmados no mesmo evento autenticado.
      const {error:aliasError}=await admin.from("union_whatsapp_verified_jid_aliases")
        .upsert({organization_id:channel.organization_id,channel_id:channelId,
          account_phone:accountPhone,lid_jid:verifiedLid,phone_jid:verifiedPN,
          last_verified_at:new Date().toISOString()},
          {onConflict:"channel_id,account_phone,lid_jid"});
      if(aliasError)throw aliasError;
      savedVerifiedPhone=verifiedPN;
    }else if(validLID(chatJid)){
      const {data:alias,error:aliasError}=await admin.from("union_whatsapp_verified_jid_aliases")
        .select("phone_jid").eq("organization_id",channel.organization_id)
        .eq("channel_id",channelId).eq("account_phone",accountPhone)
        .eq("lid_jid",chatJid).maybeSingle();
      if(aliasError)throw aliasError;
      savedVerifiedPhone=validPN(String(alias?.phone_jid||""))?String(alias.phone_jid):"";
    }
    const phoneJid=validPN(chatJid)?chatJid:validPN(altJid)?altJid:savedVerifiedPhone;
    const candidatePhone=phoneJid.split("@")[0];
    const phone=/^[0-9]{10,15}$/.test(candidatePhone)?candidatePhone:null;
    const org = channel.organization_id;
    // A WuzAPI ChatAlt/SenderAlt phone JID is the only accepted PN↔LID
    // bridge. We never guess numbers from a public profile or an @lid value.
    const possibleJids=[chatJid,...(phoneJid && phoneJid!==chatJid?[phoneJid]:[])];
    const {data:storedNames,error:contactError}=await admin.from("union_whatsapp_contacts")
      .select("chat_jid,display_name,device_name,imported_name,profile_name,wuzapi_verified_saved")
      .eq("organization_id",org).eq("channel_id",channelId).eq("account_phone",accountPhone)
      .in("chat_jid",possibleJids);
    if(contactError)throw contactError;
    const orderedNames=[...(storedNames||[])].sort((a,b)=>{
      const rank=(r:typeof a)=>(r.display_name?3:r.device_name?2:r.wuzapi_verified_saved&&r.imported_name?1:0);
      return rank(b)-rank(a) || Number(b.chat_jid===chatJid)-Number(a.chat_jid===chatJid);
    });
    const savedContact=orderedNames[0];
    const preferredContactName=String(savedContact?.display_name ||
      savedContact?.device_name ||
      (savedContact?.wuzapi_verified_saved?savedContact.imported_name:null) || "").trim();
    const timestamp = dateOf(get(info, "Timestamp", "timestamp"));
    // Discard delayed/replayed messages from a pairing that ended before
    // this number became the active account. Do not import old events into B.
    const pairedAt=Date.parse(String(channel.last_connected_at||""));
    if(Number.isFinite(pairedAt) && Date.parse(timestamp)+120_000<pairedAt)
      return json({ok:true,ignored:"before_active_account_pairing"});

    // Callback repetido sob outro JID nunca abre uma conversa vazia.
    const {data:existingMessage,error:messageLookupError}=await admin.from("union_whatsapp_messages")
      .select("id").eq("channel_id",channelId).eq("account_phone",accountPhone)
      .eq("provider_message_id",providerMessageId).maybeSingle();
    if(messageLookupError)throw messageLookupError;
    if(existingMessage)return json({ok:true,ignored:"already_synced"});

    // Prefer the existing thread for an EXACT, provider-verified phone.
    // PN and LID can be two identities for the same WhatsApp user.
    const scopedThreads=()=>admin.from("union_whatsapp_conversations")
      .select("id,last_message_at,unread_count,contact_name,status,chat_jid,contact_phone")
      .eq("channel_id",channelId).eq("account_phone",accountPhone).eq("organization_id",org);
    const {data:exact,error:exactError}=await scopedThreads().eq("chat_jid",chatJid).maybeSingle();
    if(exactError)throw exactError;
    let thread=exact;
    if(!thread && phone){
      const {data:byPhone,error:byPhoneError}=await scopedThreads()
        .eq("contact_phone",phone).order("last_message_at",{ascending:false}).limit(1);
      if(byPhoneError)throw byPhoneError;
      thread=byPhone?.[0]||null;
    }
    if(!thread){
      const {error:ensureError}=await admin.from("union_whatsapp_conversations")
        .upsert({
          organization_id:org,channel_id:channelId,account_phone:accountPhone,chat_jid:chatJid,
          contact_name:preferredContactName||name||(phone||"Contato WhatsApp"),
          contact_phone:phone,
          // Envio pelo aparelho: armazenar histórico sem gerar fila.
          status:isFromMe?"finished":"waiting",
        },{onConflict:"channel_id,account_phone,chat_jid",ignoreDuplicates:true});
      if(ensureError)throw ensureError;
      const {data:newThread,error:threadError}=await scopedThreads().eq("chat_jid",chatJid).single();
      if(threadError || !newThread)throw threadError||Error("conversation_missing");
      thread=newThread;
    }
    // Backfill only Whatsmeow-verified phone aliases on existing LID
    // conversations. This permits later VCF matching without merging chats.
    if(chatJid.endsWith("@lid") && phone) {
      const {error:phoneError}=await admin.from("union_whatsapp_conversations")
        .update({contact_phone:phone}).eq("id",thread.id)
        .eq("organization_id",org).is("contact_phone",null);
      if(phoneError)throw phoneError;
    }

    // Uma nova mensagem após o encerramento inicia OUTRO protocolo, mantendo
    // a mesma conversa e todo o histórico. Duplicatas nunca reabrem atendimento.
    if(!isFromMe && (thread.status==="finished" || thread.status==="abandoned")){
      const {data:alreadySaved,error:duplicateError}=await admin.from("union_whatsapp_messages")
        .select("id").eq("channel_id",channelId).eq("account_phone",accountPhone)
        .eq("provider_message_id",providerMessageId).maybeSingle();
      if(duplicateError)throw duplicateError;
      if(!alreadySaved){
        const {data:reopened,error:reopenError}=await admin.from("union_whatsapp_conversations")
          .update({status:"waiting",assigned_to:null,updated_at:new Date().toISOString()})
          .eq("id",thread.id).eq("organization_id",org)
          .in("status",["finished","abandoned"]).select("id").maybeSingle();
        if(reopenError)throw reopenError;
        if(reopened)thread={...thread,status:"waiting"};
      }
    }

    const { data: inserted, error: messageError } = await admin.from("union_whatsapp_messages")
      .upsert({
        organization_id: org, channel_id: channelId, account_phone:accountPhone, conversation_id: thread.id,
        provider_message_id: providerMessageId, direction: isFromMe ? "outgoing" : "incoming",
        message_type: typeHint, body_text: body, sender_name: name || null, sent_at: timestamp,
        delivery_status: isFromMe ? "sent" : null,
        origin:isFromMe?"whatsapp_device":"whatsapp_contact",
        media_name:mediaKind ? (originalName || null) : null,
        media_mime:mediaKind ? (mime || null) : null,
        media_available:validMedia,
      }, { onConflict: "channel_id,account_phone,provider_message_id", ignoreDuplicates: true })
      .select("id").maybeSingle();
    if (messageError) throw messageError;
    if(validMedia && !isFromMe) {
      const existingId=inserted?.id || (await admin.from("union_whatsapp_messages")
        .select("id").eq("channel_id",channelId).eq("account_phone",accountPhone).eq("provider_message_id",providerMessageId)
        .maybeSingle()).data?.id;
      if(existingId) {
        const {error:descriptorError}=await admin.from("union_whatsapp_inbound_media_refs")
          .upsert({
            message_id:existingId,organization_id:org,channel_id:channelId,
            mime_type:mime,file_url:fileUrl,media_key:mediaKey,file_sha256:fileHash,
            file_enc_sha256:fileEncHash || null,file_length:fileLength,
            media_type:typeHint,file_name:originalName || null,
          },{onConflict:"message_id"});
        if(descriptorError) throw descriptorError;
      }
    }
    if (inserted) {
      // Do not let delayed historical events replace the latest preview.
      const later = !thread.last_message_at || new Date(timestamp) >= new Date(thread.last_message_at);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (later) { patch.last_message = displayText; patch.last_message_at = timestamp; }
      if (!isFromMe) {
        patch.unread_count = Math.min(Number(thread.unread_count || 0) + 1, 2147483647);
      }
      if(preferredContactName && thread.contact_name!==preferredContactName) {
        patch.contact_name=preferredContactName;
      } else if(!preferredContactName && !isFromMe && name &&
        (thread.contact_name === (phone || "Contato WhatsApp") ||
         thread.contact_name === "Contato WhatsApp")) patch.contact_name=name;
      const { error: updateError } = await admin.from("union_whatsapp_conversations")
        .update(patch).eq("id", thread.id).eq("organization_id", org);
      if (updateError) throw updateError;
    }
    return json({ ok: true });
  } catch (error) {
    console.error("union-whatsapp-webhook:", error instanceof SyntaxError ? "invalid_json" : "processing_failed");
    return json({ ok: false }, 500);
  }
});
