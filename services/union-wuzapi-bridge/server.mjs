// Union World / WuzAPI control bridge.
// Run on the VPS behind HTTPS reverse proxy. Never publish WuzAPI 18080.
// Requires Node.js 20+, UNION_WUZAPI_BRIDGE_SECRET, WUZAPI_ADMIN_TOKEN.
// No Supabase secret key is required on the VPS.
import { createServer, request as httpRequest } from "node:http";
import { randomBytes, createHmac, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = Number(process.env.UNION_BRIDGE_PORT || 19080);
const secret = process.env.UNION_WUZAPI_BRIDGE_SECRET || "";
const adminToken = process.env.WUZAPI_ADMIN_TOKEN || "";
const sessionsDir = process.env.UNION_WUZAPI_SESSIONS_DIR || "/opt/union-wuzapi-bridge/sessions";
const wuzapiBase = "http://127.0.0.1:18080";
if (secret.length < 32 || adminToken.length < 16 || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("Configuração da ponte inválida: configure os segredos e a porta.");
}
await mkdir(sessionsDir, { recursive: true, mode: 0o700 });
const seenNonces = new Map();
const pendingProvision = new Map();
// Pending downloads only: never retain fulfilled media or raw credentials.
const mediaPending = new Map();
const MEDIA_PENDING_MAX_ENTRIES = 128;
const contactsCache = new Map();
const contactsPending = new Map();
const CONTACTS_CACHE_TTL_MS = 5 * 60 * 1000;
const CONTACTS_CACHE_MAX_ENTRIES = 64;
const CONTACTS_CACHE_MAX_BYTES = 8 * 1024 * 1024;
let contactsCacheBytes = 0;
function removeContactsCacheEntry(key) {
  const entry = contactsCache.get(key);
  if (!entry) return;
  contactsCacheBytes -= entry.estimatedBytes;
  contactsCache.delete(key);
}
function saveContactsCacheEntry(key, contacts) {
  // Retain only fields used by lookup, with the same normalization. Provider
  // metadata and unbounded strings must not fill the shared bridge heap.
  const compact = Object.create(null);
  let estimatedBytes = 512 + 2 * key.length;
  for (const [jid, entry] of Object.entries(contacts)) {
    if (!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid) || !entry) continue;
    const fields = { Found: entry.Found !== false };
    estimatedBytes += 256 + 2 * jid.length;
    for (const field of ["FullName", "FirstName", "BusinessName", "PushName"]) {
      // V8 slices may keep the entire provider string alive. Copy UTF-16 code
      // units into a fresh string, preserving even a truncated lone surrogate.
      fields[field] = String(entry[field] || "").trim().slice(0,160).split("").join("");
      estimatedBytes += 2 * fields[field].length;
    }
    if (estimatedBytes > CONTACTS_CACHE_MAX_BYTES) return;
    compact[jid] = fields;
  }
  removeContactsCacheEntry(key);
  contactsCache.set(key, {contacts:compact, at:Date.now(), estimatedBytes});
  contactsCacheBytes += estimatedBytes;
  while (contactsCache.size > CONTACTS_CACHE_MAX_ENTRIES ||
      contactsCacheBytes > CONTACTS_CACHE_MAX_BYTES) {
    removeContactsCacheEntry(contactsCache.keys().next().value);
  }
}
const avatarCache = new Map();
const avatarPending = new Map();
// In-memory only. Estimate UTF-16 string size conservatively so CDN photos
// cannot exhaust the shared VPS even when many companies open the inbox.
const AVATAR_CACHE_MAX_BYTES = 24 * 1024 * 1024;
const AVATAR_CACHE_MAX_ENTRIES = 512;
const AVATAR_CACHE_FOUND_TTL_MS = 60 * 60 * 1000;
const AVATAR_CACHE_EMPTY_TTL_MS = 15 * 60 * 1000;
let avatarCacheBytes = 0;
const avatarEntryBytes = (key, entry) => 512 + 2 * (
  key.length + (entry.base64 || "").length + (entry.fallbackUrl || "").length
  + (entry.mime || "").length + (entry.status || "").length
);
function removeAvatarCacheEntry(key) {
  const entry = avatarCache.get(key);
  if (!entry) return;
  avatarCacheBytes -= entry.estimatedBytes;
  avatarCache.delete(key);
}
function saveAvatarCacheEntry(key, entry) {
  removeAvatarCacheEntry(key);
  const estimatedBytes = avatarEntryBytes(key, entry);
  if (estimatedBytes > AVATAR_CACHE_MAX_BYTES) return;
  avatarCache.set(key, { ...entry, estimatedBytes });
  avatarCacheBytes += estimatedBytes;
  while (avatarCacheBytes > AVATAR_CACHE_MAX_BYTES ||
      avatarCache.size > AVATAR_CACHE_MAX_ENTRIES) {
    removeAvatarCacheEntry(avatarCache.keys().next().value);
  }
}
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
// Browser recordings arrive as WebM/Opus or MP4/AAC. WhatsApp recipients
// have reported unplayable PTT voice notes, despite provider delivery ACKs.
// Send an ordinary MP3 audio attachment (PTT:false), with verified MPEG-1
// Layer III frames and an exact duration. No third-party media service.
// Conversion is intentionally on the private VPS; storage keeps the original
// recording so browser playback/history remain unchanged.
const inspectMp3 = bytes => {
  const bitrates=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
  let offset=0,frames=0;
  if(bytes.length<512) throw new Error("audio_conversion_failed");
  // The encoder below disables ID3 and Xing tags; only real audio frames
  // must be present. Reject inconsistent/truncated output before WuzAPI.
  while(offset+4<=bytes.length) {
    const a=bytes[offset],b=bytes[offset+1],c=bytes[offset+2];
    if(a!==0xff || (b&0xfe)!==0xfa || ((c>>4)&15)<1 ||
      ((c>>4)&15)>14 || ((c>>2)&3)!==0) throw new Error("audio_conversion_failed");
    const bitrate=bitrates[(c>>4)&15];
    const length=Math.floor(144000*bitrate/44100)+((c>>1)&1);
    if(length<24 || offset+length>bytes.length) throw new Error("audio_conversion_failed");
    offset+=length;
    frames++;
  }
  if(offset!==bytes.length || frames<2) throw new Error("audio_conversion_failed");
  const duration=frames*1152/44100;
  if(!Number.isFinite(duration)||duration<=0||duration>3600)
    throw new Error("audio_conversion_failed");
  return Math.max(1,Math.round(duration));
};
const toPlayableAudio = async input => {
  if(!input?.length || input.length>16*1048576) throw new Error("media_too_large");
  const ffmpeg=process.env.UNION_FFMPEG_PATH || "ffmpeg";
  return await new Promise((resolve,reject)=>{
    let settled=false;
    const fail=code=>{if(!settled){settled=true;reject(new Error(code));}};
    const convert=spawn(ffmpeg,[
      "-hide_banner","-loglevel","error","-nostdin","-i","pipe:0",
      "-map","0:a:0","-vn","-ac","1","-ar","44100",
      "-c:a","libmp3lame","-b:a","96k",
      "-id3v2_version","0","-write_xing","0","-f","mp3","pipe:1",
    ],{stdio:["pipe","pipe","ignore"]});
    const parts=[];
    let size=0;
    const timer=setTimeout(()=>{convert.kill("SIGKILL");fail("audio_conversion_timeout");},25000);
    convert.stdout.on("data",chunk=>{
      size+=chunk.length;
      if(size>16*1048576){convert.kill("SIGKILL");fail("media_too_large");}
      else parts.push(chunk);
    });
    convert.on("error",()=>{clearTimeout(timer);fail("audio_encoder_unavailable");});
    convert.on("close",code=>{
      clearTimeout(timer);
      if(settled)return;
      const bytes=Buffer.concat(parts);
      if(code!==0)return fail("audio_conversion_failed");
      try{
        const seconds=inspectMp3(bytes);
        settled=true;
        resolve({bytes,seconds});
      }catch{fail("audio_conversion_failed");}
    });
    convert.stdin.on("error",()=>undefined);
    convert.stdin.end(input);
  });
};
const reply = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
};
const tokenFile = id => join(sessionsDir, `${id}.json`);
// WuzAPI 1.0.9 uses connected/loggedIn; older releases use
// Connected/LoggedIn. An unknown response is NOT a disconnected session.
const readBool = (input, keys) => {
  for (const source of [input?.data, input]) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const key of keys) {
      if (typeof source[key] === "boolean") return source[key];
    }
  }
  return null;
};
const safeData = input => {
  const connected = readBool(input, ["connected", "Connected", "isConnected"]);
  const logged_in = readBool(input, ["loggedIn", "LoggedIn", "logged_in", "isLoggedIn"]);
  if (connected === null || logged_in === null) throw new Error("provider_status_invalid");
  return { connected, logged_in };
};
const phoneFromJid = value => {
  const jid = String(value || "");
  // Never mistake a WhatsApp LID or group identifier for a phone number.
  if (!/@s\.whatsapp\.net$/.test(jid)) return null;
  const digits = jid.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  return /^[0-9]{10,15}$/.test(digits) ? digits : null;
};
async function readSession(id, org) {
  let result;
  try { result = JSON.parse(await readFile(tokenFile(id), "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  if (result.organization_id !== org || !result.token) throw new Error("session_mismatch");
  return result;
}
async function saveSession(id, session) {
  const tmp = tokenFile(id) + ".tmp";
  await writeFile(tmp, JSON.stringify(session), { mode: 0o600, flag: "w" });
  await rename(tmp, tokenFile(id));
}

async function wuzapi(path, token, method = "GET", body) {
  let response;
  try {
    response = await fetch(wuzapiBase + path, {
      method,
      headers: {
        ...(path.startsWith("/admin/") ? { Authorization: adminToken } : { Token: token }),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(path.startsWith("/chat/download") || path.startsWith("/chat/send/") ? 55000 : 9000),
    });
  } catch(error){
    if(path==="/user/check") {
      if(error?.name==="TimeoutError" || error?.name==="AbortError")
        throw new Error("wuzapi_check_timeout");
      throw new Error("wuzapi_check_unreachable");
    }
    throw error;
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    if(path==="/user/check"){
      // WuzAPI reports explicit errors, but never expose its raw text,
      // query payload, session token or sensitive internal details to callers.
      const reason=String(result?.error||"").toLowerCase();
      if(response.status===401 || response.status===403)throw new Error("wuzapi_check_auth_failed");
      if(response.status===404)throw new Error("wuzapi_check_endpoint_missing");
      if(reason.includes("no session"))throw new Error("wuzapi_check_session_missing");
      if(reason.includes("frame socket is closed") || reason.includes("not connected"))
        throw new Error("wuzapi_check_socket_closed");
      if(reason.includes("deadline exceeded") || reason.includes("timed out") || reason.includes("timeout"))
        throw new Error("wuzapi_check_timeout");
      if(reason.includes("failed to check if users are on whatsapp"))
        throw new Error("wuzapi_check_lookup_failed");
      if(response.status>=500)throw new Error("wuzapi_check_internal_error");
      throw new Error("wuzapi_check_request_rejected");
    }
    // Distinguish absent media URL from transport/authorization failures.
    // Never log raw provider errors: they can include phone numbers or tokens.
    if(path.startsWith("/chat/download")){
      const reason=String(result?.error||result?.data?.error||"").toLowerCase();
      if(reason.includes("no url present"))throw new Error("media_provider_missing_url");
      if(response.status===401||response.status===403)throw new Error("media_provider_auth_failed");
      throw new Error("media_provider_download_failed");
    }
    throw new Error("provider_error");
  }
  return result;
}

async function provision(id, org) {
  if (pendingProvision.has(id)) return pendingProvision.get(id);
  const attempt = (async () => {
    const existing = await readSession(id, org);
    if (existing?.ready === true) return { ok: true, connected: false, logged_in: false };
    const token = existing?.token || randomBytes(32).toString("hex");
    const row = { organization_id: org, token, ready: false };
    const name = "union_" + id.replaceAll("-", "");
    // Commit the token locally before contacting WuzAPI. A retry reuses it;
    // it never silently creates a new token for an existing WuzAPI user.
    await saveSession(id, row);
    try {
      await wuzapi("/admin/users", adminToken, "POST", {
        name, token, webhook: "", events: "Message,ReadReceipt,HistorySync",
      });
    } catch (failure) {
      // Recover only if WuzAPI already contains the exact user AND token.
      // Do not treat a duplicate name using a different token as success.
      const users = await wuzapi("/admin/users", adminToken);
      const list = Array.isArray(users) ? users : (Array.isArray(users?.data) ? users.data : []);
      if (!list.some(user => user?.name === name && user?.token === token)) throw failure;
    }
    await saveSession(id, { ...row, ready: true });
    return { ok: true, connected: false, logged_in: false };
  })().finally(() => pendingProvision.delete(id));
  pendingProvision.set(id, attempt);
  return attempt;
}

// Visibilidade global somente leitura, protegida pela mesma assinatura HMAC.
// O usuário do serviço NÃO recebe acesso ao Docker ou comandos de atualização.
async function engineInfo() {
  let report = {};
  try {
    const raw = JSON.parse(await readFile("/opt/union-wuzapi-bridge/engine-release.json", "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) report = raw;
  } catch { /* Relatório ainda não instalado: versão desconhecida, nunca inferida. */ }
  let reachable = false;
  try {
    const response = await fetch(wuzapiBase + "/admin/users", {
      headers: { Authorization: adminToken },
      signal: AbortSignal.timeout(4000),
    });
    reachable = response.ok;
    // Intencionalmente não ler nem retornar usuários, tokens ou sessões.
    await response.body?.cancel();
  } catch { reachable = false; }
  return {
    ok: true, action: "engine_info", engine_reachable: reachable,
    version: typeof report.version === "string" && /^v?[0-9]+\.[0-9]+\.[0-9]+$/.test(report.version) ? report.version : null,
    image: typeof report.image === "string" && report.image.length <= 180 ? report.image : null,
    image_id: typeof report.image_id === "string" && /^sha256:[a-f0-9]{64}$/.test(report.image_id) ? report.image_id : null,
    observed_at: typeof report.observed_at === "string" ? report.observed_at : null,
  };
}
async function operate({ action, connection_id: id, organization_id: org, chat_jid: chatJid, body_text: bodyText, client_message_id: clientMessageId, media_url: mediaUrl, media_name: mediaName, media_mime: mediaMime, media_type: mediaType, download_url: downloadUrl, media_key: mediaKey, file_sha256: fileSHA256, file_enc_sha256: fileEncSHA256, file_length: fileLength, reply_to_id: replyToId, reply_participant: replyParticipant,
  group_command: groupCommand, group_jid: groupJid, group_name: groupName,
  group_topic: groupTopic, group_phones: groupPhones, group_participant_action: groupParticipantAction,
  group_message: groupMessage, group_mode: groupMode, group_duration: groupDuration,
  group_invite_code: groupInviteCode, group_reset: groupReset, group_photo: groupPhoto,
  group_before: groupBefore }) {
  // Consulta de infraestrutura não usa tenant ou sessão de WhatsApp.
  // A autenticação HMAC é exigida antes de chamar operate().
  if (action === "engine_info") return engineInfo();
  if (!uuid(id) || !uuid(org)) throw new Error("bad_request");
  if (!["provision", "connect", "disconnect", "delete", "status", "qr", "logout", "webhook_setup", "send_text", "send_media", "quote_capability", "download_media", "contact_lookup", "contact_avatar", "presence_subscribe", "contacts_export", "number_check", "groups_list", "groups_manage"].includes(action)) throw new Error("bad_request");
  if (action === "provision") return provision(id, org);
  if (action === "delete") {
    const stored = await readSession(id, org);
    if (stored) {
      // Match both the deterministic name and the persisted secret. Never
      // delete another provider user even if the provider recycled its ID.
      const name = "union_" + id.replaceAll("-", "");
      const response = await wuzapi("/admin/users", adminToken);
      const users = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
      const existing = users.find(user => user?.name === name);
      if (existing) {
        if (existing.token !== stored.token) throw new Error("session_mismatch");
        // WuzAPI supports numeric IDs on older versions and opaque string
        // identifiers (including hex/UUID IDs) on newer installations.
        // Never coerce the provider ID through Number: doing so loses hex IDs.
        const userId = typeof existing.id === "number"
          ? (Number.isSafeInteger(existing.id) && existing.id > 0 ? String(existing.id) : "")
          : (typeof existing.id === "string" && /^[a-z0-9_-]{1,64}$/i.test(existing.id)
            && existing.id !== "0" ? existing.id : "");
        if (!userId) throw new Error("provider_user_invalid");
        await wuzapi("/admin/users/" + encodeURIComponent(userId), adminToken, "DELETE");
      }
      // Credentials are removed only after provider confirmation. If anything
      // above fails, retain the token so the operation remains retryable.
      await unlink(tokenFile(id)).catch(error => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
    pendingProvision.delete(id);
    return { ok: true, deleted: true };
  }
  const session = await readSession(id, org);
  if (!session) throw new Error("session_missing");
  if (session.ready !== true) throw new Error("session_not_ready");
  // Explicit feature negotiation: an older bridge must never silently send
  // an ordinary text while the CRM believes it sent a native quoted reply.
  if(action==="quote_capability")return {ok:true,reply_supported:true};
  if (action === "download_media") {
    const kind=String(mediaType||"");
    const mime=String(mediaMime||"");
    const allowed=["image","video","audio","file","sticker"].includes(kind);
    const size=Number(fileLength);
    const maxBytes=kind==="video" ? 20*1048576 : 5*1048576;
    if(!allowed || !Number.isSafeInteger(size) || size<=0 || size>maxBytes ||
      !mime || mime.length>160 || typeof mediaKey!=="string" ||
      typeof fileSHA256!=="string" || mediaKey.length>512 || fileSHA256.length>512 ||
      !mediaKey || !fileSHA256) throw new Error("bad_request");
    let source;
    try { source=new URL(String(downloadUrl||"")); } catch { throw new Error("bad_request"); }
    const host=source.hostname;
    if(source.protocol!=="https:" ||
      !(host==="whatsapp.net" || host.endsWith(".whatsapp.net") ||
        host==="fbcdn.net" || host.endsWith(".fbcdn.net")) ||
      source.username || source.password) throw new Error("bad_request");
    const endpoints={image:"/chat/downloadimage",video:"/chat/downloadvideo",
      audio:"/chat/downloadaudio",file:"/chat/downloaddocument",sticker:"/chat/downloadsticker"};
    // Recent whatsmeow versions download media from DirectPath (not URL).
    // WuzAPI still accepts Url for legacy clients, but without DirectPath its
    // Download() returns "no url present" even when Url is populated.
    // Extract the original path + query only after validating the CDN hostname.
    // Whatsmeow appends its own &hash=... to this query on trusted media hosts.
    const directPath=source.pathname+source.search;
    if(!/^\/(?:o[0-9]+\/)?v\//.test(directPath) || directPath.length>2048 ||
      source.hash || source.port || source.username || source.password)
      throw new Error("bad_request");
    const fields={
      Url:source.href,DirectPath:directPath,
      MediaKey:mediaKey,Mimetype:mime,FileSHA256:fileSHA256,
      FileEncSHA256:String(fileEncSHA256||""),FileLength:size,
    };
    // All authorization and media validation above still apply to every caller.
    // Hash the exact normalized provider payload and session scope, so overlapping
    // token rotations and different encryption metadata never share a download.
    const pendingKey=createHash("sha256").update(JSON.stringify([
      org,id,session.token,kind,fields,
    ])).digest("hex");
    let pending=mediaPending.get(pendingKey);
    if(!pending) {
      pending=(async()=>{
        const result=await wuzapi(endpoints[kind],session.token,"POST",fields);
        const raw=result?.data??result;
        // WuzAPI /chat/download* returns {data:{Data:"data:audio/ogg;..."}},
        // not only the lowercase "data" or the specialized "Audio" field.
        const encoded=typeof raw==="string" ? raw
          : String(raw?.Data || raw?.Base64 || raw?.base64 || raw?.Image || raw?.Audio ||
            raw?.Video || raw?.Document || raw?.Media || raw?.data || "");
        const base64=encoded.replace(/^data:[^,]*,/, "").replace(/\s/g,"");
        if(!base64 || base64.length>Math.ceil(maxBytes/3)*4+8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
          throw new Error("media_download_unavailable");
        return {ok:true,base64};
      })();
      // At capacity keep serving downloads without tracking new keys. Do not
      // evict active owners or reject legitimate media because of other tenants.
      if(mediaPending.size<MEDIA_PENDING_MAX_ENTRIES)mediaPending.set(pendingKey,pending);
    }
    try { return await pending; }
    finally {
      if(mediaPending.get(pendingKey)===pending)mediaPending.delete(pendingKey);
    }
  }
  // Compatibility only: presence subscriptions were removed for account safety.
  if (action === "presence_subscribe") return {ok:true,presence_disabled:true};
  if(action==="groups_list") {
    // Somente metadados de grupos da conta autenticada. Não retornar a lista
    // de participantes nem fazer consultas extras a perfis individuais.
    const reply=await wuzapi("/group/list",session.token);
    const payload=reply?.data && typeof reply.data==="object" ? reply.data : reply;
    const entries=Array.isArray(payload?.Groups) ? payload.Groups :
      Array.isArray(payload?.groups) ? payload.groups : [];
    const groups=entries.slice(0,500).flatMap(group=>{
      const jid=String(group?.JID||group?.jid||"");
      if(!/^[0-9]{5,30}@g\.us$/.test(jid))return [];
      return [{
        jid,
        name:String(group?.Name||group?.name||"Grupo WhatsApp").replace(/[\x00-\x1f]/g," ").trim().slice(0,160),
        topic:String(group?.Topic||group?.topic||"").replace(/[\x00-\x1f]/g," ").trim().slice(0,300),
        participants_count:Array.isArray(group?.Participants)?group.Participants.length:0,
        is_announce:group?.IsAnnounce===true,
      }];
    });
    return {ok:true,groups,limit_reached:entries.length>500};
  }

  if(action==="groups_manage"){
    // All group mutations are bound to the signed tenant/channel session.
    // Membership is checked against this account, never another WhatsApp login.
    const command=String(groupCommand||"");
    const jid=String(groupJid||"");
    const validJid=/^[0-9]{5,30}@g\.us$/.test(jid);
    const name=String(groupName||"").trim();
    const topic=String(groupTopic||"").trim();
    const phones=Array.isArray(groupPhones)?[...new Set(groupPhones.map(String))]:[];
    const validPhone=value=>/^[1-9][0-9]{7,14}$/.test(value) ||
      /^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(value);
    if(!["create","details","leave","participants","name","topic","send","invite","announce","locked","memberaddmode","ephemeral","joinapproval","join","inviteinfo","requests","requests_update","photo","photo_remove","history","send_image"].includes(command) ||
      (!["create","join","inviteinfo"].includes(command) && !validJid))throw new Error("bad_request");
    if(command==="join"||command==="inviteinfo"){
      const rawCode=String(groupInviteCode||"").trim();
      const code=rawCode.replace(/^https:\/\/chat\.whatsapp\.com\//i,"").replace(/\?.*$/,"");
      if(!/^[a-zA-Z0-9]{18,32}$/.test(code))throw new Error("bad_request");
      if(command==="join"){
        const result=await wuzapi("/group/join",session.token,"POST",{Code:code});
        const data=result?.data??result;
        return {ok:true,jid:String(data?.GroupJID||data?.JID||data?.jid||"")};
      }
      const result=await wuzapi("/group/inviteinfo",session.token,"POST",{Code:code});
      const data=result?.data?.InviteInfo??result?.data??result;
      return {ok:true,invite_info:{name:String(data?.GroupName||data?.Name||"").slice(0,160),
        jid:String(data?.GroupJID||data?.JID||"").slice(0,60)}};
    }
    if(command==="create"){
      if(name.length<2 || name.length>100 || phones.length<1 || phones.length>50 ||
        phones.some(value=>!/^[1-9][0-9]{7,14}$/.test(value)))throw new Error("bad_request");
      const created=await wuzapi("/group/create",session.token,"POST",{name,participants:phones});
      const group=created?.data??created;
      const newJid=String(group?.JID||group?.jid||"");
      if(!/^[0-9]{5,30}@g\.us$/.test(newJid))throw new Error("provider_confirmation_unknown");
      return {ok:true,jid:newJid};
    }
    const list=await wuzapi("/group/list",session.token);
    const envelope=list?.data&&typeof list.data==="object"?list.data:list;
    const entries=Array.isArray(envelope?.Groups)?envelope.Groups:
      Array.isArray(envelope?.groups)?envelope.groups:[];
    const group=entries.find(row=>String(row?.JID||row?.jid||"")===jid);
    if(!group)throw new Error("group_not_found");
    if(command==="details"){
      const rawMembers=Array.isArray(group.Participants)?group.Participants:[];
      return {ok:true,jid,name:String(group.Name||group.name||"").slice(0,160),
        topic:String(group.Topic||group.topic||"").slice(0,500),
        is_announce:group.IsAnnounce===true,is_locked:group.IsLocked===true,
        participants:rawMembers.slice(0,1000).flatMap(member=>{
          const participantJid=String(member?.JID||member?.jid||"");
          if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(participantJid))return [];
          return [{jid:participantJid,is_admin:member?.IsAdmin===true,
            is_super_admin:member?.IsSuperAdmin===true}];
        }),participants_count:rawMembers.length};
    }
    if(command==="history"){
      const before=Number(groupBefore||0);
      if(!Number.isSafeInteger(before)||before<0)throw new Error("bad_request");
      let reply;
      try{
        reply=await wuzapi("/chat/messages?chat_jid="+encodeURIComponent(jid)+
          "&limit=30"+(before?"&before="+before:""),session.token);
      }catch{
        return {ok:true,jid,history_available:false,messages:[],has_more:false,next_before:null};
      }
      const data=reply?.data&&typeof reply.data==="object"?reply.data:reply;
      const list=Array.isArray(data?.messages)?data.messages:[];
      const messages=list.slice(0,30).flatMap(item=>{
        if(String(item?.chat_jid||"")!==jid)return [];
        const id=Number(item.id);
        if(!Number.isSafeInteger(id)||id<=0)return [];
        const sentAt=String(item.sent_at||item.timestamp||"").slice(0,45);
        const sender=String(item.sender_jid||"").slice(0,70);
        const kind=String(item.message_type||"unknown").slice(0,30).toLowerCase();
        return [{id,sender_jid:sender,sent_at:sentAt,message_type:kind,
          text:String(item.text_content||"").slice(0,4000)}];
      });
      const next=Number(data?.next_before||0);
      return {ok:true,jid,history_available:true,messages,
        has_more:data?.has_more===true,
        next_before:Number.isSafeInteger(next)&&next>0?next:null};
    }
    if(command==="send_image"){
      const photo=String(groupPhoto||"");
      const base64=photo.replace(/^data:image\/jpeg;base64,/,"");
      const caption=String(groupMessage||"").slice(0,4000);
      const clientId=String(clientMessageId||"");
      if(!uuid(clientId)||!photo.startsWith("data:image/jpeg;base64,") ||
        base64.length<100||base64.length>140000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
        throw new Error("bad_request");
      const result=await wuzapi("/chat/send/image",session.token,"POST",{
        Phone:jid,Image:photo,Caption:caption,Id:clientId.replaceAll("-","").toUpperCase(),
      });
      const providerMessageId=String(result?.data?.Id||result?.data?.id||"");
      if(!providerMessageId)throw new Error("provider_confirmation_unknown");
      return {ok:true,jid,provider_message_id:providerMessageId};
    }
    if(command==="invite"){
      const reset=groupReset===true;
      const result=await wuzapi("/group/invitelink?groupJID="+encodeURIComponent(jid)+(reset?"&reset=true":""),session.token);
      const link=String(result?.data?.InviteLink||result?.data?.inviteLink||"");
      if(!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{18,32}$/.test(link))
        throw new Error("provider_confirmation_unknown");
      return {ok:true,jid,invite_link:link};
    }
    if(command==="requests"){
      const result=await wuzapi("/group/requestparticipants?groupJID="+encodeURIComponent(jid),session.token);
      const data=Array.isArray(result?.data)?result.data:[];
      return {ok:true,jid,requests:data.slice(0,250).flatMap(item=>{
        const person=String(item?.JID||item?.jid||"");
        if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(person))return [];
        return [{jid:person,requested_at:String(item?.RequestedAt||"").slice(0,40)}];
      })};
    }
    if(command==="requests_update"){
      const operation=String(groupParticipantAction||"");
      if(!["approve","reject"].includes(operation)||phones.length<1||phones.length>50||
        phones.some(phone=>!validPhone(phone)))throw new Error("bad_request");
      await wuzapi("/group/updaterequestparticipants",session.token,"POST",
        {GroupJID:jid,Action:operation,Phone:phones});
      return {ok:true,jid,changed:phones.length};
    }
    if(command==="announce"||command==="locked"||command==="joinapproval"){
      if(typeof groupMode!=="boolean")throw new Error("bad_request");
      const route=command==="announce"?"/group/announce":
        command==="locked"?"/group/locked":"/group/joinapprovalmode";
      const body=command==="announce"?{GroupJID:jid,Announce:groupMode}:
        command==="locked"?{GroupJID:jid,Locked:groupMode}:
        {GroupJID:jid,Mode:groupMode};
      await wuzapi(route,session.token,"POST",body);
      return {ok:true,jid};
    }
    if(command==="memberaddmode"){
      if(!["admin_add","all_member_add"].includes(groupMode))throw new Error("bad_request");
      await wuzapi("/group/memberaddmode",session.token,"POST",{GroupJID:jid,Mode:groupMode});
      return {ok:true,jid};
    }
    if(command==="ephemeral"){
      if(!["off","24h","7d","90d"].includes(groupDuration))throw new Error("bad_request");
      await wuzapi("/group/ephemeral",session.token,"POST",{GroupJID:jid,Duration:groupDuration});
      return {ok:true,jid};
    }
    if(command==="photo"||command==="photo_remove"){
      if(command==="photo"){
        const value=String(groupPhoto||"");
        const base64=value.replace(/^data:image\/jpeg;base64,/,"");
        if(!/^data:image\/jpeg;base64,/.test(value) || base64.length>150000 ||
          base64.length<100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
          throw new Error("bad_request");
        await wuzapi("/group/photo",session.token,"POST",{GroupJID:jid,Image:value});
      }else{
        await wuzapi("/group/photo/remove",session.token,"POST",{GroupJID:jid});
      }
      return {ok:true,jid};
    }
    if(command==="participants"){
      const operation=String(groupParticipantAction||"");
      if(!["add","remove","promote","demote"].includes(operation) ||
        phones.length<1 || phones.length>50 || phones.some(value=>!validPhone(value)))
        throw new Error("bad_request");
      await wuzapi("/group/updateparticipants",session.token,"POST",
        {GroupJID:jid,Phone:phones,Action:operation});
      return {ok:true,jid,changed:phones.length};
    }
    if(command==="name"){
      if(name.length<2||name.length>100)throw new Error("bad_request");
      await wuzapi("/group/name",session.token,"POST",{GroupJID:jid,Name:name});
    } else if(command==="topic"){
      if(topic.length>500)throw new Error("bad_request");
      await wuzapi("/group/topic",session.token,"POST",{GroupJID:jid,Topic:topic});
    } else if(command==="leave"){
      await wuzapi("/group/leave",session.token,"POST",{GroupJID:jid});
    } else if(command==="send"){
      const message=typeof groupMessage==="string"?groupMessage.trim():"";
      const idText=String(clientMessageId||"");
      if(!message || message.length>4000 || !uuid(idText))throw new Error("bad_request");
      const sent=await wuzapi("/chat/send/text",session.token,"POST",{
        Phone:jid,Body:message,Id:idText.replaceAll("-","").toUpperCase(),
      });
      const providerMessageId=String(sent?.data?.Id||sent?.data?.id||"");
      if(!providerMessageId)throw new Error("provider_confirmation_unknown");
      return {ok:true,jid,provider_message_id:providerMessageId};
    }
    return {ok:true,jid};
  }
  if(action==="contacts_export") {
    const reply=await wuzapi("/user/contacts",session.token);
    const entries=reply?.data && typeof reply.data==="object" &&
      !Array.isArray(reply.data) ? reply.data : {};
    const contacts=[];
    for(const [jid,raw] of Object.entries(entries)) {
      if(contacts.length>=5000)break;
      if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid))continue;
      const entry=raw && typeof raw==="object" ? raw : {};
      if(entry.Found===false)continue;
      const clean=value=>String(value||"").replace(/[\x00-\x1f]/g," ").trim().slice(0,160);
      // The Whatsmeow contact cache contains group members and public
      // profiles. PushName and BusinessName do NOT imply a saved contact.
      // Require a locally saved FullName or FirstName to export this entry.
      const savedName=clean(entry.FullName||entry.FirstName);
      if(!savedName)continue;
      contacts.push({
        jid,
        imported_name:savedName,
        profile_name:clean(entry.PushName),
        saved_in_address_book:true,
      });
    }
    return {ok:true,contacts};
  }
  if (action === "contact_avatar") {
    const jid=String(chatJid||"");
    if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid))
      throw new Error("bad_request");
    const cacheKey=id+"|"+jid;
    const existing=avatarCache.get(cacheKey);
    if(existing) {
      const ttl=existing.base64?AVATAR_CACHE_FOUND_TTL_MS:AVATAR_CACHE_EMPTY_TTL_MS;
      if(Date.now()-existing.at < ttl) {
        // LRU: frequently viewed contacts remain cached without raising the limit.
        avatarCache.delete(cacheKey);
        avatarCache.set(cacheKey,existing);
        return {ok:true,avatar_base64:existing.base64||null,avatar_mime:existing.mime||null,
          avatar_cdn_url:!existing.base64?existing.fallbackUrl||null:null,
          avatar_status:existing.status||"no_public_photo"};
      }
      removeAvatarCacheEntry(cacheKey);
    }
    // Concurrent operators viewing the same contact share one provider request.
    const pending=avatarPending.get(cacheKey);
    if(pending)return await pending;
    const loadAvatar=(async()=>{
    // One request per contact. Missing/private photos are expected.
    // Avoid legacy GET fallback and full-size retry after a provider 500.
    let avatarResult=null;
    try {
      avatarResult=await wuzapi("/user/avatar",session.token,"POST",{
        Phone:jid,Preview:true,
      });
    }catch{/* Expected when a contact has no visible photo. */}
    // ProfilePictureInfo is nested in "data" on WuzAPI; some versions
    // serialize the URL field as Url/url rather than URL.
    const pictureUrl=value=>{
      const records=[value,value?.data,value?.Data];
      for(const item of records){
        if(!item || typeof item!=="object" || Array.isArray(item))continue;
        const url=item.URL||item.Url||item.url;
        if(typeof url==="string" && url.trim())return url.trim();
      }
      return "";
    };
    let addr=pictureUrl(avatarResult);
    let base64="",mime="",status="no_public_photo",fallbackUrl="";
    try {
      let source=new URL(addr);
      const trusted=url=>{
        const host=url.hostname;
        return url.protocol==="https:" && !url.username && !url.password &&
          !url.port && (host==="pps.whatsapp.net" || host.endsWith(".whatsapp.net") ||
            host==="fbcdn.net" || host.endsWith(".fbcdn.net"));
      };
      if(trusted(source))fallbackUrl=source.href;
      // Bound retries and validate each redirect against the same CDN allowlist.
      for(let redirects=0;redirects<5 && trusted(source);redirects++){
        const response=await fetch(source,{
          redirect:"manual",signal:AbortSignal.timeout(10000),
          headers:{Accept:"image/jpeg,image/png,image/webp"},
        });
        if([301,302,303,307,308].includes(response.status)){
          const location=response.headers.get("location");
          if(!location){status="cdn_redirect_missing";break;}
          const redirect=new URL(location,source);
          if(!trusted(redirect)){status="cdn_redirect_untrusted";fallbackUrl="";break;}
          source=redirect;
          fallbackUrl=redirect.href;
          continue;
        }
        if(!response.ok){status="cdn_http_"+response.status;break;}
        const declared=String(response.headers.get("content-type")||"").split(";")[0].toLowerCase();
        const len=Number(response.headers.get("content-length")||0);
        if(len && len>200000){await response.body?.cancel().catch(()=>{});break;}
        // Some CDNs omit Content-Length: enforce the 200 kB limit while
        // streaming, before a large body can occupy memory on the VPS.
        if(!response.body)break;
        const chunks=[];
        let received=0;
        for await (const chunk of response.body) {
          received+=chunk.length;
          if(received>200000)break;
          chunks.push(Buffer.from(chunk));
        }
        if(!received || received>200000)break;
        const bytes=Buffer.concat(chunks,received);
        const detected=bytes[0]===255 && bytes[1]===216?"image/jpeg":
          bytes[0]===137 && bytes[1]===80 && bytes[2]===78?"image/png":
          bytes.toString("ascii",0,4)==="RIFF" &&
          bytes.toString("ascii",8,12)==="WEBP"?"image/webp":"";
        if(!detected || (declared && declared!=="application/octet-stream" &&
          declared!==detected))break;
        mime=detected;base64=bytes.toString("base64");status="available";
        break;
      }
    }catch{/* Missing/private photos are expected and not an error. */}
    saveAvatarCacheEntry(cacheKey,{base64,mime,fallbackUrl,status,at:Date.now()});
    return {ok:true,avatar_base64:base64||null,avatar_mime:mime||null,
      avatar_cdn_url:!base64?fallbackUrl||null:null,avatar_status:status};
    })();
    avatarPending.set(cacheKey,loadAvatar);
    try {return await loadAvatar;}
    finally {
      if(avatarPending.get(cacheKey)===loadAvatar)avatarPending.delete(cacheKey);
    }
  }
  if (action === "number_check") {
    // Only the signed Union backend can check a direct recipient; no public enumeration.
    const input=String(bodyText||"").replace(/\D/g,"");
    if(!/^55[1-9][0-9][0-9]{8,9}$/.test(input)) throw new Error("bad_request");
    const national=input.slice(4);
    // Brazilian phone numbers can be represented with/without the ninth digit.
    const alt=national.length===9 && national[0]==="9"
      ? input.slice(0,4)+national.slice(1)
      : national.length===8 && /^[6-9]/.test(national) ? input.slice(0,4)+"9"+national : "";
    const candidates=[input,...(alt?[alt]:[])];
    // A DB connected flag is not enough: the actual Whatsmeow client must be logged in.
    const checkStatus=await wuzapi("/session/status",session.token);
    const online=safeData(checkStatus);
    if(!online.connected || !online.logged_in)
      throw new Error("wuzapi_check_session_offline");
    const sameBrazilianNumber=(left,right)=>{
      if(left===right)return true;
      if(!/^55[1-9][0-9][0-9]{8,9}$/.test(left) || !/^55[1-9][0-9][0-9]{8,9}$/.test(right))
        return false;
      if(left.slice(0,4)!==right.slice(0,4))return false;
      const l=left.slice(4),r=right.slice(4);
      return (l.length===9 && l.startsWith("9") && l.slice(1)===r) ||
        (r.length===9 && r.startsWith("9") && r.slice(1)===l);
    };
    // Verify both variants concurrently to keep the bridge under Supabase's
    // 14-second timeout, and use the actual JID returned by WhatsApp.
    // A positive alias is not proof that two distinct JIDs are the same person.
    const checks=await Promise.allSettled(candidates.map(async candidate=>{
      const response=await wuzapi("/user/check",session.token,"POST",{Phone:[candidate]});
      const users=response?.data?.Users ?? response?.data?.users;
      if(!Array.isArray(users) || !users.length)throw new Error("provider_check_unavailable");
      let answered=false;
      const matches=[];
      for(const row of users){
        if(!row || typeof row!=="object")continue;
        const query=String(row.Query ?? row.query ?? "").replace(/\D/g,"");
        const jid=String(row.JID ?? row.Jid ?? row.jid ?? "");
        const lookup=query || /^([0-9]+)@s\.whatsapp\.net$/.exec(jid)?.[1] || "";
        if(!sameBrazilianNumber(candidate,lookup) ||
          typeof (row.IsInWhatsapp ?? row.isInWhatsapp)!=="boolean")continue;
        answered=true;
        if((row.IsInWhatsapp ?? row.isInWhatsapp)!==true)continue;
        // Recent WhatsApp / Whatsmeow versions resolve registered phones to
        // an opaque LID (the same LID for both valid 9-digit variants).
        // LID is an account identity, NOT a phone number: never convert it
        // into a Brazilian PN or drop its @lid suffix.
        const pn=/^(55[1-9][0-9][0-9]{8,9})@s\.whatsapp\.net$/.exec(jid);
        const lid=/^[0-9]{5,20}@lid$/.test(jid);
        if(!lid && (!pn || !sameBrazilianNumber(candidate,pn[1])))
          throw new Error("provider_check_unavailable");
        matches.push({
          phone:pn ? pn[1] : candidate,
          jid,
          query:candidate,
          verified_name:String(row.VerifiedName ?? row.verifiedName ?? "").slice(0,120),
        });
      }
      if(!answered)throw new Error("provider_check_unavailable");
      return matches;
    }));
    const positives=checks.flatMap(result=>result.status==="fulfilled"?result.value:[]);
    if(positives.length){
      // If both queries resolve to one JID, the returned phone is canonical.
      // If they resolve to different JIDs, keep their identities separate:
      // prefer the exact number typed instead of silently merging contacts.
      const unique=[...new Map(positives.map(item=>[item.jid+"|"+item.query,item])).values()];
      return {
        ok:true,requested:input,matches:unique.slice(0,2),
        status:"verified",
        distinct_identities:new Set(positives.map(item=>item.jid)).size>1,
      };
    }
    // Never claim "not registered" when a provider query timed out or failed.
    const failure=checks.find(item=>item.status==="rejected");
    if(failure?.status==="rejected")throw failure.reason;
    return {ok:true,requested:input,matches:[],status:"not_registered",distinct_identities:false};
  }
  if (action === "contact_lookup") {
    const jid=String(chatJid||"");
    if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid)) throw new Error("bad_request");
    const now=Date.now();
    // Authorization/session readiness is checked above even for cache hits.
    // Scope pending and completed results to the exact tenant + session, so
    // a delayed response cannot overwrite a rotated token's directory.
    const cacheKey=createHash("sha256").update(JSON.stringify([org,id,session.token])).digest("hex");
    for(const [key,value] of contactsCache) {
      if(now-value.at>=CONTACTS_CACHE_TTL_MS)removeContactsCacheEntry(key);
    }
    const cached=contactsCache.get(cacheKey);
    let contacts;
    if(cached) {
      contactsCache.delete(cacheKey);
      contactsCache.set(cacheKey,cached);
      contacts=cached.contacts;
    }
    else {
      let pending=contactsPending.get(cacheKey);
      if(!pending) {
        pending=(async()=>{
          const reply=await wuzapi("/user/contacts",session.token);
          const directory=reply?.data && typeof reply.data==="object" && !Array.isArray(reply.data)
            ? reply.data : {};
          saveContactsCacheEntry(cacheKey,directory);
          return directory;
        })();
        contactsPending.set(cacheKey,pending);
      }
      try { contacts=await pending; }
      finally {
        if(contactsPending.get(cacheKey)===pending)contactsPending.delete(cacheKey);
      }
    }
    const entry=contacts[jid];
    if(!entry || entry.Found===false) return {ok:true,name:null,source:null};
    // An address-book name belongs to the exact recipient JID. WuzAPI
    // message PushName from outgoing events belongs to our account instead.
    // Cached fields are already normalized. Trimming a sliced name again
    // would drop a space at the 160-character boundary on cache hits.
    const nameField=field=>cached ? entry[field] : String(entry[field]||"").trim().slice(0,160);
    const full=nameField("FullName");
    const first=nameField("FirstName");
    const business=nameField("BusinessName");
    const push=nameField("PushName");
    // BusinessName is a public business profile, not proof of a phonebook
    // save. Only FullName / FirstName are authoritative saved names.
    const saved=full||first;
    const name=saved||push||business;
    return {ok:true,name:name||null,source:saved?"saved":"push"};
  }
  if (action === "send_media") {
    const jid=String(chatJid||"");
    const caption=typeof bodyText==="string" ? bodyText : "";
    const idText=String(clientMessageId||"");
    const kind=String(mediaType||"");
    const mime=String(mediaMime||"");
    const name=String(mediaName||"").replace(/[^\p{L}\p{N}._() -]/gu,"").slice(0,160);
    const limits={image:10*1048576,audio:16*1048576,video:25*1048576,file:25*1048576,sticker:1048576};
    const acceptable=kind==="sticker" ? mime==="image/webp" 
      : kind==="image" ? ["image/jpeg","image/png"].includes(mime)
      : kind==="audio" ? ["audio/ogg","audio/opus","audio/mp4","audio/mpeg","audio/webm"].includes(mime)
      : kind==="video" ? ["video/mp4","video/3gpp"].includes(mime)
      : kind==="file" ? ["application/pdf","text/plain","application/zip","application/octet-stream","audio/webm",
        "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime) : false;
    if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid) || !uuid(idText)
      || !acceptable || caption.length>4000 || !name) throw new Error("bad_request");
    let fileUrl;
    try { fileUrl=new URL(String(mediaUrl||"")); } catch { throw new Error("bad_request"); }
    if(fileUrl.protocol!=="https:" ||
      fileUrl.hostname!=="wmjmtcjpunmzvonlkjcu.supabase.co" ||
      !fileUrl.pathname.startsWith("/storage/v1/object/sign/union-whatsapp-media/") ||
      fileUrl.username || fileUrl.password) throw new Error("bad_request");
    const response=await fetch(fileUrl,{signal:AbortSignal.timeout(12000)});
    if(!response.ok) throw new Error("media_download_unavailable");
    const declared=Number(response.headers.get("content-length")||"0");
    if(declared>limits[kind]) throw new Error("media_too_large");
    const buffer=Buffer.from(await response.arrayBuffer());
    if(!buffer.length || buffer.length>limits[kind]) throw new Error("media_too_large");
    const audio=kind==="audio" ? await toPlayableAudio(buffer) : null;
    // Data URL, MIME metadata, and bytes must all be the SAME format.
    const outgoingMime=audio?"audio/mpeg":mime;
    const dataUrl="data:"+outgoingMime+";base64,"+(audio?.bytes||buffer).toString("base64");
    const fields={Phone:jid,Id:idText.replaceAll("-","").toUpperCase()};
    let resource,path;
    if(kind==="image"){path="/chat/send/image";resource={...fields,Image:dataUrl,Caption:caption};}
    else if(kind==="audio"){path="/chat/send/audio";resource={...fields,Audio:dataUrl,MimeType:"audio/mpeg",PTT:false,Seconds:audio.seconds};}
    else if(kind==="video"){path="/chat/send/video";resource={...fields,Video:dataUrl,Caption:caption};}
    else if(kind==="sticker"){if(caption.trim())throw new Error("sticker_caption_unsupported");path="/chat/send/sticker";resource={...fields,Sticker:dataUrl};}
    else {path="/chat/send/document";resource={...fields,Document:dataUrl,FileName:name,MimeType:mime,Caption:caption};}
    const result=await wuzapi(path,session.token,"POST",resource);
    const resultId=String(result?.data?.Id||result?.data?.id||"");
    if(!resultId || resultId.length>180) throw new Error("provider_confirmation_unknown");
    return {ok:true,provider_message_id:resultId};
  }
  if (action === "send_text") {
    // Only the authenticated Union Edge Function may reach this action.
    // The existing HMAC envelope binds the organization, channel, recipient,
    // full text and request ID. Never take a provider token from the request.
    const jid = String(chatJid || "");
    const body = typeof bodyText === "string" ? bodyText : "";
    const clientId = String(clientMessageId || "");
    if (!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid)
        || !body.trim() || body.length > 4000 || !uuid(clientId)) {
      throw new Error("bad_request");
    }
    // Native WhatsApp quote requires the provider stanza ID and the actual
    // sender JID. Only trusted HMAC-authenticated Edge calls reach this branch.
    const quoteRequested=replyToId!==undefined || replyParticipant!==undefined;
    if(quoteRequested && (
      typeof replyToId!=="string" || !/^[a-zA-Z0-9_-]{4,180}$/.test(replyToId) ||
      typeof replyParticipant!=="string" ||
      !/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(replyParticipant)
    )) throw new Error("bad_request");
    const sentId = clientId.replaceAll("-", "").toUpperCase();
    const response = await wuzapi("/chat/send/text", session.token, "POST", {
      Phone: jid, Body: body, Id: sentId,
      ...(quoteRequested ? {ContextInfo:{StanzaId:replyToId,Participant:replyParticipant}} : {}),
    });
    const confirmedId = String(response?.data?.Id || response?.data?.id || "").trim();
    if (!confirmedId || confirmedId.length > 180) throw new Error("provider_confirmation_unknown");
    return { ok: true, provider_message_id: confirmedId };
  }
  if (action === "webhook_setup") {
    // WuzAPI JSON callbacks may omit the user token altogether. Authenticate
    // with the provider's per-user HMAC signature instead (both JSON and form).
    // Derived from the already shared bridge secret; no extra secret in URLs,
    // Supabase DB, JavaScript bundle or WuzAPI response.
    const webhookKey = createHmac("sha256", secret)
      .update("union-whatsapp-webhook:v1:" + id).digest("hex");
    await wuzapi("/session/hmac/config", session.token, "POST", {
      hmac_key: webhookKey,
    });
    // Never reconnect/log out the paired device.
    const url = "https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/union-whatsapp-webhook"
      + "?channel=" + encodeURIComponent(id);
    await wuzapi("/webhook", session.token, "POST", {
      webhookurl: url, events: ["Message", "ReadReceipt", "Receipt"],
    });
    return { ok: true, auth_mode: "hmac-sha256",
      token_sha256: createHash("sha256").update(session.token).digest("hex") };
  }
  if (action === "connect") {
    await wuzapi("/session/connect", session.token, "POST", {
      Subscribe: ["Message", "ReadReceipt", "Receipt", "HistorySync"], Immediate: true,
    });
  }
  if (action === "disconnect") {
    // Unlike /session/logout, this preserves device credentials and allows
    // /session/connect to reuse the same WhatsApp account without scanning QR.
    // Do not clear message subscriptions or delete the private session token.
    await wuzapi("/session/disconnect", session.token, "POST");
    return { ok:true, connected:false, logged_in:false, session_preserved:true };
  }
  if (action === "logout") {
    await wuzapi("/session/logout", session.token, "POST");
    return { ok: true, connected: false, logged_in: false };
  }
  if (action === "qr") {
    const result = await wuzapi("/session/qr", session.token);
    const qr = String(result?.data?.QRCode || "");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr) || qr.length > 250_000) {
      throw new Error("qr_unavailable");
    }
    return { ok: true, qr };
  }
  const rawStatus = await wuzapi("/session/status", session.token);
  const status = safeData(rawStatus);
  let phone = null;
  if (status.logged_in) {
    // The live status JID is newer than /admin/users immediately after
    // QR pairing, especially in Whatsmeow versions that use LID mapping.
    phone = phoneFromJid(rawStatus?.data?.jid || rawStatus?.data?.Jid
      || rawStatus?.jid || rawStatus?.Jid);
    if (!phone) {
      try {
        const users = await wuzapi("/admin/users", adminToken);
        const rows = Array.isArray(users) ? users : (Array.isArray(users?.data) ? users.data : []);
        const own = rows.find(user => user?.name === "union_" + id.replaceAll("-", ""));
        phone = phoneFromJid(own?.jid || own?.Jid);
      } catch { /* Phone is optional; a valid login status remains authoritative. */ }
    }
  }
  return { ok: true, ...status, phone };
}

function verified(headers, raw) {
  const timestamp = headers["x-union-timestamp"];
  const nonce = headers["x-union-nonce"];
  const sig = headers["x-union-signature"];
  if (typeof timestamp !== "string" || typeof nonce !== "string" || typeof sig !== "string") return false;
  if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9-]{36}$/i.test(nonce) || !/^[a-f0-9]{64}$/i.test(sig)) return false;
  const now = Date.now();
  if (Math.abs(now - Number(timestamp)) > 60_000 || seenNonces.has(nonce)) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + nonce + "." + raw).digest();
  const received = Buffer.from(sig, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  seenNonces.set(nonce, now);
  for (const [id, time] of seenNonces) if (now - time > 70_000) seenNonces.delete(id);
  if (seenNonces.size > 15000) return false;
  return true;
}

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/channel-control") {
    reply(res, 404, { ok: false });
    return;
  }
  const chunks = [];
  let length = 0;
  try {
    for await (const chunk of req) {
      length += chunk.length;
      // JPEG photo may be up to 110 KB. All requests still require a valid HMAC.
      if (length > 165000) throw new Error("oversize");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!verified(req.headers, raw)) return reply(res, 401, { ok: false, code: "unauthorized" });
    const body = JSON.parse(raw);
    const result = await operate(body);
    reply(res, 200, result);
  } catch (error) {
    const code = error?.message;
    const status = code === "bad_request" ? 400 : code === "session_missing" ? 404 :
      ["qr_unavailable", "session_not_ready", "wuzapi_check_session_offline", "wuzapi_check_session_missing"].includes(code) ? 409 : 502;
    console.error("union-bridge:", status, code);
    const known=new Set(["audio_encoder_unavailable","audio_conversion_failed","audio_conversion_timeout","media_provider_missing_url","media_provider_auth_failed","media_provider_download_failed",
      "wuzapi_check_session_offline","wuzapi_check_session_missing",
      "wuzapi_check_auth_failed","wuzapi_check_endpoint_missing","wuzapi_check_lookup_failed",
      "wuzapi_check_socket_closed","wuzapi_check_timeout","wuzapi_check_unreachable",
      "wuzapi_check_internal_error","wuzapi_check_request_rejected",
      "provider_user_invalid","session_mismatch","provider_error"]);
    reply(res, status, {ok:false,code:known.has(code)?code:status===502?"provider_unavailable":code});
  }
}).listen(port, host, () => console.log(`Union WuzAPI bridge on ${host}:${port}`));
