import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (payload: unknown, status=200) => new Response(JSON.stringify(payload), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ""));
const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,"0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
const envKey = (oldName: string, modernName: string) => {
  const oldValue = Deno.env.get(oldName);
  if (oldValue) return oldValue;
  try {
    const data = JSON.parse(Deno.env.get(modernName) || "{}");
    return String(data.default || Object.values(data)[0] || "");
  } catch { return ""; }
};
async function signedBridge(
  channel: { id: string; organization_id: string }, bodyText: string, chatJid: string, clientId: string,
  media?: {url:string;mime:string;name:string;type:string},
  download?: {url:string;key:string;sha:string;encSha:string;length:number;mime:string;type:string},
  lookup = false,
) {
  const target = Deno.env.get("UNION_WUZAPI_BRIDGE_URL") || "";
  const secret = Deno.env.get("UNION_WUZAPI_BRIDGE_SECRET") || "";
  let url: URL;
  try { url = new URL(target); }
  catch { throw Error("bridge_not_configured"); }
  if (url.protocol !== "https:" || url.username || url.password || secret.length < 32) {
    throw Error("bridge_not_configured");
  }
  const body = JSON.stringify({
    action: lookup ? "contact_lookup" : download ? "download_media" : media ? "send_media" : "send_text",
    organization_id: channel.organization_id, connection_id: channel.id,
    chat_jid: chatJid, body_text: bodyText, client_message_id: clientId,
    ...(media ? {media_url:media.url,media_mime:media.mime,media_name:media.name,media_type:media.type} : {}),
    ...(download ? {download_url:download.url,media_key:download.key,
      file_sha256:download.sha,file_enc_sha256:download.encSha,
      file_length:download.length,media_mime:download.mime,media_type:download.type} : {}),
  });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    { name:"HMAC",hash:"SHA-256" },false,["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC", key,
    encoder.encode(timestamp + "." + nonce + "." + body)));
  const abort = new AbortController();
  const timer = setTimeout(()=>abort.abort(), download || media ? 65000 : 14000);
  try {
    const response = await fetch(url, {
      method:"POST",
      headers: { "Content-Type":"application/json", "X-Union-Timestamp":timestamp,
        "X-Union-Nonce":nonce, "X-Union-Signature":signature },
      body, signal:abort.signal,
    });
    const result = await response.json().catch(()=>({})) as Record<string, unknown>;
    if (!response.ok || result.ok !== true) throw Error("provider_unconfirmed");
    if (lookup) {
      const name=typeof result.name==="string" ? result.name.trim().slice(0,160) : "";
      const source=result.source==="saved" ? "saved" : "push";
      return source+":"+name;
    }
    if (download) {
      if(typeof result.base64 !== "string" ||
        result.base64.length > 7100000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.base64))
        throw Error("media_download_unavailable");
      return result.base64;
    }
    if (typeof result.provider_message_id !== "string" ||
      !result.provider_message_id || result.provider_message_id.length > 180)
      throw Error("provider_unconfirmed");
    return result.provider_message_id;
  } finally { clearTimeout(timer); }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null,{ status:204, headers:cors });
  if (request.method !== "POST") return json({success:false,error:"Método não permitido."},405);
  const baseUrl=Deno.env.get("SUPABASE_URL") || "";
  const publicKey=envKey("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
  const privateKey=envKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
  const bearer=request.headers.get("Authorization") || "";
  if(Number(request.headers.get("content-length")||"0")>8*1024*1024)
    return json({success:false,error:"Arquivo maior que o limite permitido."},413);
  if (!baseUrl || !publicKey || !privateKey || !bearer.startsWith("Bearer ")) {
    return json({success:false,error:"Sessão indisponível."},401);
  }

  try {
    const body=await request.json() as Record<string,unknown>;
    const org=String(body.organization_id || "");
    const conversationId=String(body.conversation_id || "");
    const action=String(body.action || "");
    if (!uuid(org) || (!["start","channel_status"].includes(action) && !uuid(conversationId)) ||
      !["assume","return_queue","finish","reopen","mark_read","send_text","send_media","media_view","members","transfer","start","channel_status","prepare_media","resolve_contact"].includes(action)) {
      return json({success:false,error:"Operação inválida."},400);
    }
    const scoped=createClient(baseUrl,publicKey,{
      global:{headers:{Authorization:bearer}},
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const admin=createClient(baseUrl,privateKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await scoped.auth.getUser();
    if (userError || !userData.user) return json({success:false,error:"Sessão expirada."},401);
    const actorId=userData.user.id;
    const {data:permissionRows,error:permissionError}=await scoped.rpc("my_organization_permissions",{
      p_organization_id:org,
    });
    if(permissionError) return json({success:false,error:"Acesso negado."},403);
    const permissions=new Set((Array.isArray(permissionRows)?permissionRows:[])
      .map((row:Record<string,unknown>)=>String(row.permission_key || "")));
    const canRead=permissions.has("whatsapp.inbox.view");
    const canSend=permissions.has("whatsapp.inbox.send");
    const canManage=permissions.has("whatsapp.inbox.manage");
    if (!canRead || (["members","transfer"].includes(action) && !canManage) ||
      (["send_text","send_media","start","prepare_media"].includes(action) && !canSend) ||
      (action==="assume" && !canSend && !canManage) ||
      (["return_queue","finish","reopen"].includes(action) && !canSend && !canManage)) {
      return json({success:false,error:"Você não possui permissão para esta ação."},403);
    }

    if(action==="channel_status") {
      const {data:channel,error}=await admin.from("whatsapp_channel_connections")
        .select("id,state,webhook_ready").eq("organization_id",org)
        .eq("provider","wuzapi").maybeSingle();
      if(error) throw error;
      return json({success:true,channel_connected:Boolean(channel &&
        channel.state==="connected" && channel.webhook_ready)});
    }
    if(action==="start") {
      const inputDigits=String(body.phone||"").replace(/\D/g,"");
      const national=inputDigits.startsWith("55") && inputDigits.length>11
        ? inputDigits.slice(2) : inputDigits;
      if(!/^[1-9][0-9][0-9]{8,9}$/.test(national))
        return json({success:false,error:"Informe um telefone brasileiro com DDD válido."},400);
      // The Union inbox is Brazilian: normalize country code exactly once.
      const phone="55"+national;
      const customerName=String(body.contact_name||"").trim().slice(0,120);
      const {data:channel,error:channelError}=await admin.from("whatsapp_channel_connections")
        .select("id,state,webhook_ready").eq("organization_id",org)
        .eq("provider","wuzapi").maybeSingle();
      if(channelError || !channel || channel.state!=="connected" || !channel.webhook_ready)
        return json({success:false,error:"Conecte o canal WhatsApp antes de iniciar uma conversa."},409);
      const jid=phone+"@s.whatsapp.net";
      const {data:created,error:createError}=await admin.from("union_whatsapp_conversations")
        .upsert({organization_id:org,channel_id:channel.id,chat_jid:jid,
          contact_name:customerName||phone,contact_phone:phone,
          status:"in_att",assigned_to:actorId,
        },{onConflict:"channel_id,chat_jid",ignoreDuplicates:true})
        .select("id").maybeSingle();
      if(createError) throw createError;
      if(created) return json({success:true,conversation_id:created.id});
      const {data:existing,error:existingError}=await admin.from("union_whatsapp_conversations")
        .select("id,status,assigned_to").eq("organization_id",org)
        .eq("channel_id",channel.id).eq("chat_jid",jid).single();
      if(existingError) throw existingError;
      if(existing.status==="in_att" && existing.assigned_to===actorId)
        return json({success:true,conversation_id:existing.id,already_open:true});
      if(existing.status==="in_att" && existing.assigned_to!==actorId)
        return json({success:false,error:"Este cliente já está em atendimento com outro funcionário."},409);
      if(existing.status==="finished" && !canManage)
        return json({success:false,error:"Somente um gestor pode reabrir esta conversa."},403);
      const {data:claimed,error:claimError}=await admin.from("union_whatsapp_conversations")
        .update({status:"in_att",assigned_to:actorId,updated_at:new Date().toISOString()})
        .eq("organization_id",org).eq("id",existing.id)
        .eq("status",existing.status).is("assigned_to",null)
        .select("id").maybeSingle();
      if(claimError) throw claimError;
      if(!claimed) return json({success:false,error:"A conversa foi assumida por outro funcionário."},409);
      return json({success:true,conversation_id:claimed.id});
    }
    const {data:thread,error:threadError}=await admin.from("union_whatsapp_conversations")
      .select("id,organization_id,channel_id,chat_jid,status,assigned_to,last_message_at")
      .eq("id",conversationId).eq("organization_id",org).maybeSingle();
    if(threadError) throw threadError;
    if(!thread) return json({success:false,error:"Conversa não encontrada nesta empresa."},404);
    if(action==="resolve_contact") {
      if(!(canManage || thread.assigned_to===actorId ||
        (thread.status==="waiting" && !thread.assigned_to)))
        return json({success:false,error:"Conversa não disponível para consulta."},403);
      try {
        const value=await signedBridge(
          {id:thread.channel_id,organization_id:org},"",thread.chat_jid,crypto.randomUUID(),
          undefined,undefined,true
        );
        const separator=value.indexOf(":");
        const source=separator>=0?value.slice(0,separator):"";
        const candidate=separator>=0?value.slice(separator+1).trim():"";
        const {data:existing}=await admin.from("union_whatsapp_conversations")
          .select("contact_name,contact_phone").eq("id",thread.id).eq("organization_id",org).maybeSingle();
        const current=String(existing?.contact_name||"").trim();
        const placeholder=!current || current==="Contato WhatsApp" ||
          (existing?.contact_phone && current===existing.contact_phone);
        // Phone owner-saved address-book names win over WuzAPI outgoing
        // PushName. Public PushName only fills placeholder names.
        if(candidate && candidate!==current && (source==="saved" || placeholder)) {
          const {error:writeError}=await admin.from("union_whatsapp_conversations")
            .update({contact_name:candidate,updated_at:new Date().toISOString()})
            .eq("id",thread.id).eq("organization_id",org);
          if(writeError) throw writeError;
          return json({success:true,contact_name:candidate});
        }
        return json({success:true,contact_name:current});
      } catch {
        return json({success:true});
      }
    }
    if(action==="media_view") {
      const messageId=String(body.message_id||"");
      if(!uuid(messageId)) return json({success:false,error:"Arquivo não encontrado."},404);
      if(!(canManage || thread.assigned_to===actorId ||
          (thread.status==="waiting" && !thread.assigned_to))) {
        return json({success:false,error:"Sem acesso ao arquivo deste atendimento."},403);
      }
      const {data:mediaMessage,error:mediaError}=await admin.from("union_whatsapp_messages")
        .select("media_path,media_name,media_mime,media_available")
        .eq("id",messageId).eq("organization_id",org).eq("conversation_id",thread.id).maybeSingle();
      if(mediaError) throw mediaError;
      if(!mediaMessage) return json({success:false,error:"Mensagem não encontrada."},404);
      let mediaPath=mediaMessage.media_path as string|null;
      if(!mediaPath && mediaMessage.media_available) {
        const {data:ref,error:refError}=await admin.from("union_whatsapp_inbound_media_refs")
          .select("file_url,media_key,file_sha256,file_enc_sha256,file_length,mime_type,media_type,file_name")
          .eq("message_id",messageId).eq("organization_id",org).eq("channel_id",thread.channel_id).maybeSingle();
        if(refError) throw refError;
        if(!ref) return json({success:false,error:"Arquivo não está mais disponível no WhatsApp."},404);
        let base64:string;
        try {
          base64=await signedBridge({id:thread.channel_id,organization_id:org},"",
            thread.chat_jid,crypto.randomUUID(),undefined,{
              url:ref.file_url,key:ref.media_key,sha:ref.file_sha256,
              encSha:ref.file_enc_sha256||"",length:Number(ref.file_length),
              mime:ref.mime_type,type:ref.media_type,
            });
        } catch {
          return json({success:false,code:"media_unavailable",error:"Não foi possível recuperar esta mídia pelo WhatsApp. Tente novamente mais tarde."},502);
        }
        const decoded=atob(base64);
        if(!decoded.length || decoded.length>5242880)
          return json({success:false,error:"A mídia ultrapassa o limite de 5 MB."},413);
        const bytes=new Uint8Array(decoded.length);
        for(let i=0;i<decoded.length;i++) bytes[i]=decoded.charCodeAt(i);
        const ext=ref.media_type==="image" ? (ref.mime_type==="image/png"?"png":"jpg") :
          ref.media_type==="video"?"mp4":ref.media_type==="audio"?"ogg":
          (String(ref.file_name||"").split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"").slice(0,10)||"bin";
        mediaPath=org+"/"+thread.channel_id+"/"+thread.id+"/"+messageId+"."+ext;
        const {error:uploadError}=await admin.storage.from("union-whatsapp-media")
          .upload(mediaPath,bytes,{contentType:ref.mime_type,upsert:false});
        if(uploadError && !String(uploadError.message||"").includes("already exists")) throw uploadError;
        const {error:saveError}=await admin.from("union_whatsapp_messages")
          .update({media_path:mediaPath,media_name:ref.file_name,media_mime:ref.mime_type})
          .eq("id",messageId).eq("organization_id",org).eq("conversation_id",thread.id);
        if(saveError) throw saveError;
      }
      if(!mediaPath) return json({success:false,error:"Mídia não disponível para download."},404);
      if(!mediaPath.startsWith(org+"/"+thread.channel_id+"/"+thread.id+"/")) {
        return json({success:false,error:"Arquivo inválido."},403);
      }
      const {data:link,error:linkError}=await admin.storage.from("union-whatsapp-media")
        .createSignedUrl(mediaPath,120);
      if(linkError || !link?.signedUrl) throw linkError||Error("signed_url_unavailable");
      return json({success:true,url:link.signedUrl,filename:mediaMessage.media_name,mime:mediaMessage.media_mime});
    }
    if(action==="members" || action==="transfer") {
      // Same-company, active operators only. Never trust a client-provided
      // destination name, role or organization.
      const {data:members,error:membersError}=await admin.from("organization_members")
        .select("user_id,role_id,is_owner")
        .eq("organization_id",org).eq("status","active").limit(500);
      if(membersError) throw membersError;
      const roleIds=[...new Set((members||[]).map(m=>m.role_id).filter(Boolean))];
      const {data:sendPermission,error:permissionLookupError}=await admin.from("permissions")
        .select("id").eq("key","whatsapp.inbox.send").maybeSingle();
      if(permissionLookupError || !sendPermission) return json({success:false,error:"Permissão de operadores não configurada."},503);
      const {data:grants,error:grantsError}=roleIds.length
        ? await admin.from("role_permissions").select("role_id").in("role_id",roleIds)
          .eq("permission_id",sendPermission.id)
        : {data:[],error:null};
      if(grantsError) throw grantsError;
      const eligibleRoles=new Set((grants||[]).map(r=>r.role_id));
      const eligible=(members||[]).filter(m=>m.is_owner || eligibleRoles.has(m.role_id));
      if(action==="members") {
        const ids=eligible.map(m=>m.user_id);
        const {data:profiles,error:profilesError}=ids.length
          ? await admin.from("profiles").select("id,full_name,is_active").in("id",ids)
          : {data:[],error:null};
        if(profilesError) throw profilesError;
        const people=(profiles||[]).filter(p=>p.is_active!==false)
          .map(p=>({id:p.id,name:p.full_name || "Funcionário"}))
          .sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
        return json({success:true,members:people});
      }
      const targetId=String(body.target_user_id || "");
      if(!uuid(targetId) || !eligible.some(m=>m.user_id===targetId)) {
        return json({success:false,error:"Atendente de destino inválido ou sem permissão."},403);
      }
      const {data:targetProfile}=await admin.from("profiles").select("is_active")
        .eq("id",targetId).maybeSingle();
      if(!targetProfile || targetProfile.is_active===false) {
        return json({success:false,error:"Atendente indisponível."},409);
      }
      if(thread.status!=="in_att" || !thread.assigned_to) {
        return json({success:false,error:"Assuma a conversa antes de encaminhar."},409);
      }
      const {data:routed,error:routingError}=await admin.from("union_whatsapp_conversations")
        .update({assigned_to:targetId,updated_at:new Date().toISOString()})
        .eq("organization_id",org).eq("id",thread.id)
        .eq("status","in_att").eq("assigned_to",thread.assigned_to)
        .select("id").maybeSingle();
      if(routingError) throw routingError;
      if(!routed) return json({success:false,error:"Atendimento alterado por outro funcionário. Atualize."},409);
      return json({success:true});
    }
    const owned=thread.assigned_to === actorId;
    const assignedToOther=Boolean(thread.assigned_to && !owned);
    if(action==="assume") {
      if(thread.status !== "waiting" || assignedToOther) {
        return json({success:false,code:"not_available",error:"Essa conversa já foi assumida ou não está na fila."},409);
      }
      const {data:updated,error}=await admin.from("union_whatsapp_conversations")
        .update({status:"in_att",assigned_to:actorId,updated_at:new Date().toISOString()})
        .eq("id",thread.id).eq("organization_id",org).eq("status","waiting")
        .is("assigned_to",null).select("id").maybeSingle();
      if(error) throw error;
      if(!updated) return json({success:false,code:"already_claimed",error:"Outro atendente assumiu essa conversa."},409);
      return json({success:true});
    }
    if(action==="mark_read") {
      if(!owned && !canManage) return json({success:false,error:"Conversa não atribuída a você."},403);
      const {error}=await admin.from("union_whatsapp_conversations")
        .update({unread_count:0}).eq("id",thread.id).eq("organization_id",org);
      if(error) throw error;
      return json({success:true});
    }
    if(action==="return_queue" || action==="finish" || action==="reopen") {
      if(!owned && !canManage) return json({success:false,error:"Conversa não atribuída a você."},403);
      const required=action==="reopen"?"finished":"in_att";
      if(thread.status !== required) return json({success:false,code:"invalid_state",error:"A situação da conversa mudou. Atualize a lista."},409);
      const patch:Record<string,unknown>=
        action==="finish" ? {status:"finished",unread_count:0,assigned_to:null} :
        {status:"waiting",assigned_to:null};
      patch.updated_at=new Date().toISOString();
      const {data:updated,error}=await admin.from("union_whatsapp_conversations")
        .update(patch).eq("id",thread.id).eq("organization_id",org)
        .eq("status",required).select("id").maybeSingle();
      if(error) throw error;
      if(!updated) return json({success:false,error:"Situação alterada por outro atendente."},409);
      return json({success:true});
    }
    // From here only text or private attachment sending remains.
    if(thread.status !== "in_att" || (!owned && !canManage)) {
      return json({success:false,code:"not_assigned",error:"Assuma o atendimento antes de enviar mensagens."},409);
    }
    if(action==="prepare_media") {
      const id=String(body.client_message_id||"");
      const kind=String(body.media_type||"");
      const mime=String(body.media_mime||"");
      const name=String(body.media_name||"").replace(/[^\\p{L}\\p{N}._() -]/gu,"").slice(0,160);
      const fileSize=Number(body.media_size);
      const caps:Record<string,number>={image:10*1048576,audio:16*1048576,video:25*1048576,file:25*1048576};
      const accepted=kind==="image" ? ["image/jpeg","image/png"].includes(mime)
        :kind==="audio" ? ["audio/ogg","audio/opus"].includes(mime)
        :kind==="video" ? ["video/mp4","video/3gpp"].includes(mime)
        :kind==="file" ? ["application/pdf","text/plain","application/zip","application/octet-stream",
            "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime)
        :false;
      if(!uuid(id) || !accepted || !name || !Number.isSafeInteger(fileSize) ||
        fileSize<1 || fileSize>caps[kind]) return json({success:false,
        error:"Formato ou tamanho do arquivo não permitido para este canal."},413);
      const ext=kind==="image"?(mime==="image/png"?"png":"jpg"):
        kind==="audio"?"ogg":kind==="video"?"mp4":
        (name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"").slice(0,10).toLowerCase()||"bin";
      const path=org+"/"+thread.channel_id+"/"+thread.id+"/"+id+"."+ext;
      const {data:upload,error:uploadError}=await admin.storage.from("union-whatsapp-media")
        .createSignedUploadUrl(path,{upsert:false});
      if(uploadError || !upload?.token) throw uploadError||Error("upload_url_unavailable");
      return json({success:true,upload_path:path,upload_token:upload.token});
    }
    const text=typeof body.text === "string" ? body.text.trim() : "";
    const clientId=String(body.client_message_id || "");
    const isMedia=action==="send_media";
    const kind=String(body.media_type||"");
    const mime=String(body.media_mime||"");
    const name=String(body.media_name||"").replace(/[^\p{L}\p{N}._() -]/gu,"").slice(0,160);
    const limits:Record<string,number>={image:10*1048576,audio:16*1048576,video:25*1048576,file:25*1048576};
    const mimeAllowed=isMedia && (
      kind==="image" ? ["image/jpeg","image/png"].includes(mime)
      : kind==="audio" ? ["audio/ogg","audio/opus"].includes(mime)
      : kind==="video" ? ["video/mp4","video/3gpp"].includes(mime)
      : kind==="file" ? ["application/pdf","text/plain","application/zip","application/octet-stream",
          "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime) : false
    );
    const fileSize=Number(body.media_size);
    const mediaPath=isMedia ? String(body.media_path||"") : "";
    const ext=isMedia ? kind==="image"?(mime==="image/png"?"png":"jpg"):
      kind==="video"?"mp4":kind==="audio"?"ogg":
      (name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"").slice(0,10).toLowerCase()||"bin" : "";
    const expectedMediaPath=isMedia ? org+"/"+thread.channel_id+"/"+thread.id+"/"+clientId+"."+ext : "";
    if(!uuid(clientId) || text.length>4000 || (!isMedia && !text) ||
      (isMedia && (!mimeAllowed || !name || mediaPath!==expectedMediaPath ||
        !Number.isSafeInteger(fileSize) || fileSize<1 || fileSize>limits[kind])) ||
      !/^[0-9]{5,20}@(s\\.whatsapp\\.net|lid)$/.test(thread.chat_jid))
      return json({success:false,error:"Mensagem ou anexo inválido."},400);
    if(isMedia) {
      // Never trust the client path alone. Read the private object's metadata
      // using service role, validate that a completed upload really exists.
      const parts=mediaPath.split("/");
      const file=parts.pop()||"";
      const dir=parts.join("/");
      const {data:objects,error:listError}=await admin.storage.from("union-whatsapp-media")
        .list(dir,{search:file,limit:10});
      if(listError) throw listError;
      const stored=(objects||[]).find(item=>item.name===file);
      const storedSize=Number(stored?.metadata?.size||0);
      if(!stored || storedSize!==fileSize ||
        storedSize>limits[kind]) return json({success:false,
          error:"O arquivo ainda não foi enviado ou seu tamanho não confere."},409);
    }
    const {data:channel,error:channelError}=await admin.from("whatsapp_channel_connections")
      .select("id,organization_id,state,webhook_ready").eq("id",thread.channel_id)
      .eq("organization_id",org).single();
    if(channelError || !channel || channel.state!=="connected" || !channel.webhook_ready) {
      return json({success:false,code:"channel_offline",error:"O canal precisa estar conectado e com recebimento ativo."},409);
    }
    const hash=isMedia ? await sha256(text+":"+mediaPath+":"+fileSize+":"+mime) : await sha256(text);
    const {data:attempt,error:attemptError}=await admin.from("union_whatsapp_send_attempts")
      .upsert({
        organization_id:org,channel_id:thread.channel_id,conversation_id:thread.id,
        client_message_id:clientId,user_id:actorId,body_sha256:hash,status:"sending",
      },{onConflict:"organization_id,client_message_id",ignoreDuplicates:true})
      .select("id").maybeSingle();
    if(attemptError) throw attemptError;
    if(!attempt) {
      const {data:previous,error}=await admin.from("union_whatsapp_send_attempts")
        .select("conversation_id,user_id,body_sha256,status,provider_message_id")
        .eq("organization_id",org).eq("client_message_id",clientId).single();
      if(error || !previous || previous.conversation_id!==thread.id ||
        previous.user_id!==actorId || previous.body_sha256!==hash) {
        return json({success:false,error:"Identificador de envio já utilizado."},409);
      }
      if(previous.status==="sent") return json({success:true,already_sent:true});
      return json({success:false,code:"pending_confirmation",
        error:"Esse envio já foi solicitado e ainda não está confirmado. Não envie novamente sem verificar no WhatsApp."},409);
    }

    let messageId="";
    let signedMedia:{url:string;mime:string;name:string;type:string}|undefined;
    if(isMedia && mediaPath) {
      const {data:shortLink,error:shortError}=await admin.storage.from("union-whatsapp-media")
        .createSignedUrl(mediaPath,180);
      if(shortError || !shortLink?.signedUrl) throw shortError||Error("signed_media_unavailable");
      signedMedia={url:shortLink.signedUrl,mime,name,type:kind};
    }
    try {
      messageId=await signedBridge(channel,text,thread.chat_jid,clientId,signedMedia);
    } catch {
      await admin.from("union_whatsapp_send_attempts").update({
        status:"unknown",updated_at:new Date().toISOString(),
      }).eq("id",attempt.id);
      return json({success:false,code:"delivery_unknown",
        error:"Não foi possível confirmar o envio. Verifique o WhatsApp antes de tentar novamente."},502);
    }
    const now=new Date().toISOString();
    // Use the organization's verified profile name for the same styling as SAC.
    const {data:profile}=await admin.from("profiles").select("full_name")
      .eq("id",actorId).maybeSingle();
    const firstName=String(profile?.full_name || "").trim().split(/\\s+/)[0] || "";
    const senderName=firstName ? firstName[0].toLocaleUpperCase("pt-BR") + firstName.slice(1) : null;
    const {data:message,error:insertError}=await admin.from("union_whatsapp_messages")
      .upsert({
        organization_id:org,channel_id:thread.channel_id,conversation_id:thread.id,
        provider_message_id:messageId,direction:"outgoing",message_type:isMedia?kind:"text",
        body_text:text,sender_name:senderName,sent_at:now,delivery_status:"sent",
        media_path:isMedia?mediaPath:null,media_name:isMedia?name:null,media_mime:isMedia?mime:null,
      },{onConflict:"channel_id,provider_message_id",ignoreDuplicates:true})
      .select("id").maybeSingle();
    if(insertError) throw insertError;
    // A fast provider webhook can insert the same message before this Edge
    // request finishes. Enrich it in place instead of creating another bubble.
    if(!message && (senderName || mediaPath)) {
      // WuzAPI can echo the outgoing event before this signed send request
      // returns. It has the same provider ID; enrich the existing row instead
      // of showing two separate bubbles or dropping the private attachment.
      const patch:Record<string,unknown>={};
      if(senderName) patch.sender_name=senderName;
      if(mediaPath) {
        patch.media_path=mediaPath;
        patch.media_name=name;
        patch.media_mime=mime;
        patch.message_type=kind;
        patch.delivery_status="sent";
      }
      if(Object.keys(patch).length)
        await admin.from("union_whatsapp_messages").update(patch)
          .eq("channel_id",thread.channel_id).eq("provider_message_id",messageId)
          .eq("organization_id",org).eq("direction","outgoing");
    }
    if(!thread.last_message_at || new Date(now)>=new Date(thread.last_message_at)) {
      const {error:previewError}=await admin.from("union_whatsapp_conversations")
        .update({last_message:isMedia ? (text || ({image:"Imagem",audio:"Áudio",video:"Vídeo",file:"Documento"}[kind]||"Anexo")) : text,last_message_at:now,updated_at:now})
        .eq("id",thread.id).eq("organization_id",org);
      if(previewError) throw previewError;
    }
    const {error:completeError}=await admin.from("union_whatsapp_send_attempts")
      .update({status:"sent",provider_message_id:messageId,updated_at:now})
      .eq("id",attempt.id);
    if(completeError) throw completeError;
    return json({success:true,message_id:message?.id || null,provider_confirmed:true});
  } catch(error) {
    console.error("union-whatsapp-inbox:",(error as Error)?.name || "unknown");
    return json({success:false,code:"operation_failed",
      error:"Não foi possível concluir a operação. Verifique a situação antes de repetir."},500);
  }
});
