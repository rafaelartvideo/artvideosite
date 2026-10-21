// Union World / WuzAPI control bridge.
// Run on the VPS behind HTTPS reverse proxy. Never publish WuzAPI 18080.
// Requires Node.js 20+, UNION_WUZAPI_BRIDGE_SECRET, WUZAPI_ADMIN_TOKEN.
// No Supabase secret key is required on the VPS.
import { createServer, request as httpRequest } from "node:http";
import { randomBytes, createHmac, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

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
const contactsCache = new Map();
const avatarCache = new Map();
const presenceSubscriptions = new Map();
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
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
  const response = await fetch(wuzapiBase + path, {
    method,
    headers: {
      ...(path.startsWith("/admin/") ? { Authorization: adminToken } : { Token: token }),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(path.startsWith("/chat/download") || path.startsWith("/chat/send/") ? 55000 : 9000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) throw new Error("provider_error");
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

async function operate({ action, connection_id: id, organization_id: org, chat_jid: chatJid, body_text: bodyText, client_message_id: clientMessageId, media_url: mediaUrl, media_name: mediaName, media_mime: mediaMime, media_type: mediaType, download_url: downloadUrl, media_key: mediaKey, file_sha256: fileSHA256, file_enc_sha256: fileEncSHA256, file_length: fileLength }) {
  if (!uuid(id) || !uuid(org)) throw new Error("bad_request");
  if (!["provision", "connect", "disconnect", "status", "qr", "logout", "webhook_setup", "send_text", "send_media", "download_media", "contact_lookup", "contact_avatar", "presence_subscribe", "contacts_export", "number_check"].includes(action)) throw new Error("bad_request");
  if (action === "provision") return provision(id, org);
  const session = await readSession(id, org);
  if (!session) throw new Error("session_missing");
  if (session.ready !== true) throw new Error("session_not_ready");
  if (action === "download_media") {
    const kind=String(mediaType||"");
    const mime=String(mediaMime||"");
    const allowed=["image","video","audio","file","sticker"].includes(kind);
    const size=Number(fileLength);
    if(!allowed || !Number.isInteger(size) || size<=0 || size>5242880 ||
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
      audio:"/chat/downloadaudio",file:"/chat/downloaddocument",sticker:"/chat/downloadimage"};
    const result=await wuzapi(endpoints[kind],session.token,"POST",{
      Url:source.href,MediaKey:mediaKey,Mimetype:mime,FileSHA256:fileSHA256,
      FileEncSHA256:String(fileEncSHA256||""),FileLength:size,
    });
    const raw=result?.data;
    const encoded=typeof raw==="string" ? raw
      : String(raw?.Base64 || raw?.base64 || raw?.Image || raw?.Audio ||
        raw?.Video || raw?.Document || raw?.Media || raw?.data || "");
    const base64=encoded.replace(/^data:[^,]*,/, "");
    if(!base64 || base64.length>7100000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
      throw new Error("media_download_unavailable");
    return {ok:true,base64};
  }
  if (action === "presence_subscribe") {
    const jid=String(chatJid||"");
    if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid)) throw new Error("bad_request");
    const key=id+"|"+jid;
    if(Date.now()-(presenceSubscriptions.get(key)||0)<300000) return {ok:true};
    await wuzapi("/user/presence/subscribe",session.token,"POST",{Phone:jid});
    presenceSubscriptions.set(key,Date.now());
    if(presenceSubscriptions.size>1000) presenceSubscriptions.delete(presenceSubscriptions.keys().next().value);
    return {ok:true};
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
    if(existing && Date.now()-existing.at < (existing.base64?600000:60000))
      return {ok:true,avatar_base64:existing.base64||null,avatar_mime:existing.mime||null,
        avatar_cdn_url:!existing.base64?existing.fallbackUrl||null:null,
        avatar_status:existing.status||"no_public_photo"};
    // WuzAPI expects a GET carrying JSON. Node's native fetch forbids a
    // GET body, so communicate with the trusted loopback provider directly.
    const payload=JSON.stringify({Phone:jid,Preview:true});
    // Newer WuzAPI builds implement this endpoint as POST; older builds
    // documented GET with a JSON body. Support both without exposing tokens.
    let avatarResult;
    try {
      avatarResult = await wuzapi("/user/avatar",session.token,"POST",{
        Phone:jid,Preview:true,
      });
    } catch {
      avatarResult = await new Promise(resolve=>{

      let settled=false;
      const done=value=>{if(!settled){settled=true;resolve(value);}};
      const req=httpRequest("http://127.0.0.1:18080/user/avatar",{
        method:"GET",
        headers:{Token:session.token,"Content-Type":"application/json",
          "Content-Length":Buffer.byteLength(payload)},
        timeout:8000,
      },res=>{
        const chunks=[];let size=0;
        res.on("data",chunk=>{
          size+=chunk.length;
          if(size>32768){req.destroy();done(null);return;}
          chunks.push(chunk);
        });
        res.on("end",()=>{
          if(res.statusCode!==200){done(null);return;}
          try{done(JSON.parse(Buffer.concat(chunks).toString("utf8")));}
          catch{done(null);}
        });
      });
      req.on("timeout",()=>{req.destroy();done(null);});
      req.on("error",()=>done(null));
      req.end(payload);
      });
    }
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
    // WhatsApp can have a full-size image but no preview thumbnail.
    if(!addr){
      try{
        addr=pictureUrl(await wuzapi("/user/avatar",session.token,"POST",{
          Phone:jid,Preview:false,
        }));
      }catch{/* No profile photo or privacy-restricted account. */}
    }
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
        if(len && len>200000)break;
        const bytes=Buffer.from(await response.arrayBuffer());
        if(!bytes.length || bytes.length>200000)break;
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
    avatarCache.set(cacheKey,{base64,mime,fallbackUrl,status,at:Date.now()});
    if(avatarCache.size>100) avatarCache.delete(avatarCache.keys().next().value);
    return {ok:true,avatar_base64:base64||null,avatar_mime:mime||null,
      avatar_cdn_url:!base64?fallbackUrl||null:null,avatar_status:status};
  }
  if (action === "number_check") {
    // Only the signed Union backend can check a direct recipient; no public enumeration.
    const input=String(bodyText||"").replace(/\D/g,"");
    if(!/^55[1-9][0-9][0-9]{8,9}$/.test(input)) throw new Error("bad_request");
    const national=input.slice(4);
    // Brazilian phone numbers can be represented with/without the ninth digit.
    const alt=national.length===9 && national[0]==="9"
      ? input.slice(0,4)+national.slice(1)
      : national.length===8 ? input.slice(0,4)+"9"+national : "";
    const candidates=[input,...(alt?[alt]:[])];
    const response=await wuzapi("/user/check",session.token,"POST",{Phone:candidates});
    const values=response?.data?.Users||response?.data?.users||[];
    if(!Array.isArray(values)) throw new Error("provider_check_unavailable");
    const verified=values.flatMap(row=>{
      const query=String(row?.Query||row?.query||"").replace(/\D/g,"");
      const jid=String(row?.JID||row?.Jid||row?.jid||"");
      const registered=row?.IsInWhatsapp===true || row?.isInWhatsapp===true;
      if(!registered || !candidates.includes(query) || !jid.startsWith(query+"@"))return [];
      return [{phone:query,verified_name:String(row?.VerifiedName||"").slice(0,120)}];
    });
    return {ok:true,requested:input,matches:verified.slice(0,2)};
  }
  if (action === "contact_lookup") {
    const jid=String(chatJid||"");
    if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid)) throw new Error("bad_request");
    const now=Date.now();
    const cached=contactsCache.get(id);
    let contacts;
    if(cached && now-cached.at<300000) contacts=cached.contacts;
    else {
      const reply=await wuzapi("/user/contacts",session.token);
      contacts=reply?.data && typeof reply.data==="object" && !Array.isArray(reply.data)
        ? reply.data : {};
      contactsCache.set(id,{contacts,at:now});
    }
    const entry=contacts[jid];
    if(!entry || entry.Found===false) return {ok:true,name:null,source:null};
    // An address-book name belongs to the exact recipient JID. WuzAPI
    // message PushName from outgoing events belongs to our account instead.
    const full=String(entry.FullName||"").trim().slice(0,160);
    const first=String(entry.FirstName||"").trim().slice(0,160);
    const business=String(entry.BusinessName||"").trim().slice(0,160);
    const push=String(entry.PushName||"").trim().slice(0,160);
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
      : kind==="audio" ? ["audio/ogg","audio/opus","audio/mp4","audio/mpeg"].includes(mime)
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
    const dataUrl="data:"+mime+";base64,"+buffer.toString("base64");
    const fields={Phone:jid,Id:idText.replaceAll("-","").toUpperCase()};
    let resource,path;
    if(kind==="image"){path="/chat/send/image";resource={...fields,Image:dataUrl,Caption:caption};}
    else if(kind==="audio"){path="/chat/send/audio";resource={...fields,Audio:dataUrl,MimeType:mime,PTT:mime==="audio/ogg" || mime==="audio/opus"};}
    else if(kind==="video"){path="/chat/send/video";resource={...fields,Video:dataUrl,Caption:caption};}
    else if(kind==="sticker"){if(caption.trim())throw new Error("sticker_caption_unsupported");path="/chat/send/sticker";resource={...fields,Sticker:dataUrl};}
    else {path="/chat/send/document";resource={...fields,Document:dataUrl,FileName:name,MimeType:mime};}
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
    const sentId = clientId.replaceAll("-", "").toUpperCase();
    const response = await wuzapi("/chat/send/text", session.token, "POST", {
      Phone: jid, Body: body, Id: sentId,
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
      webhookurl: url, events: ["Message", "ReadReceipt", "Presence"],
    });
    return { ok: true, auth_mode: "hmac-sha256",
      token_sha256: createHash("sha256").update(session.token).digest("hex") };
  }
  if (action === "connect") {
    await wuzapi("/session/connect", session.token, "POST", {
      Subscribe: ["Message", "ReadReceipt", "HistorySync"], Immediate: true,
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
      if (length > 10000) throw new Error("oversize");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!verified(req.headers, raw)) return reply(res, 401, { ok: false, code: "unauthorized" });
    const body = JSON.parse(raw);
    const result = await operate(body);
    reply(res, 200, result);
  } catch (error) {
    const code = error?.message;
    const status = code === "bad_request" ? 400 : code === "session_missing" ? 404 : ["qr_unavailable", "session_not_ready"].includes(code) ? 409 : 502;
    console.error("union-bridge:", status, code);
    reply(res, status, { ok: false, code: status === 502 ? "provider_unavailable" : code });
  }
}).listen(port, host, () => console.log(`Union WuzAPI bridge on ${host}:${port}`));
