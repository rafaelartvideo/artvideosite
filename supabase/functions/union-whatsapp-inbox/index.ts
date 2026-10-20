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
    action: "send_text",
    organization_id: channel.organization_id, connection_id: channel.id,
    chat_jid: chatJid, body_text: bodyText, client_message_id: clientId,
  });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    { name:"HMAC",hash:"SHA-256" },false,["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC", key,
    encoder.encode(timestamp + "." + nonce + "." + body)));
  const abort = new AbortController();
  const timer = setTimeout(()=>abort.abort(), 14000);
  try {
    const response = await fetch(url, {
      method:"POST",
      headers: { "Content-Type":"application/json", "X-Union-Timestamp":timestamp,
        "X-Union-Nonce":nonce, "X-Union-Signature":signature },
      body, signal:abort.signal,
    });
    const result = await response.json().catch(()=>({})) as Record<string, unknown>;
    if (!response.ok || result.ok !== true ||
        typeof result.provider_message_id !== "string" ||
        !result.provider_message_id || result.provider_message_id.length > 180) {
      throw Error("provider_unconfirmed");
    }
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
  if (!baseUrl || !publicKey || !privateKey || !bearer.startsWith("Bearer ")) {
    return json({success:false,error:"Sessão indisponível."},401);
  }

  try {
    const body=await request.json() as Record<string,unknown>;
    const org=String(body.organization_id || "");
    const conversationId=String(body.conversation_id || "");
    const action=String(body.action || "");
    if (!uuid(org) || !uuid(conversationId) ||
      !["assume","return_queue","finish","reopen","mark_read","send_text","members","transfer"].includes(action)) {
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
      (action==="send_text" && !canSend) ||
      (action==="assume" && !canSend && !canManage) ||
      (["return_queue","finish","reopen"].includes(action) && !canSend && !canManage)) {
      return json({success:false,error:"Você não possui permissão para esta ação."},403);
    }

    const {data:thread,error:threadError}=await admin.from("union_whatsapp_conversations")
      .select("id,organization_id,channel_id,chat_jid,status,assigned_to,last_message_at")
      .eq("id",conversationId).eq("organization_id",org).maybeSingle();
    if(threadError) throw threadError;
    if(!thread) return json({success:false,error:"Conversa não encontrada nesta empresa."},404);
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
    // From this point only send_text remains.
    if(thread.status !== "in_att" || (!owned && !canManage)) {
      return json({success:false,code:"not_assigned",error:"Assuma o atendimento antes de enviar mensagens."},409);
    }
    const text=typeof body.text === "string" ? body.text.trim() : "";
    const clientId=String(body.client_message_id || "");
    if(!uuid(clientId) || !text || text.length>4000 || !/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(thread.chat_jid)) {
      return json({success:false,error:"Mensagem inválida."},400);
    }
    const {data:channel,error:channelError}=await admin.from("whatsapp_channel_connections")
      .select("id,organization_id,state,webhook_ready").eq("id",thread.channel_id)
      .eq("organization_id",org).single();
    if(channelError || !channel || channel.state!=="connected" || !channel.webhook_ready) {
      return json({success:false,code:"channel_offline",error:"O canal precisa estar conectado e com recebimento ativo."},409);
    }
    const hash=await sha256(text);
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
    try {
      messageId=await signedBridge(channel,text,thread.chat_jid,clientId);
    } catch {
      await admin.from("union_whatsapp_send_attempts").update({
        status:"unknown",updated_at:new Date().toISOString(),
      }).eq("id",attempt.id);
      // A timeout can happen AFTER the provider dispatches. Never replay it.
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
        provider_message_id:messageId,direction:"outgoing",message_type:"text",
        body_text:text,sender_name:senderName,sent_at:now,
      },{onConflict:"channel_id,provider_message_id",ignoreDuplicates:true})
      .select("id").maybeSingle();
    if(insertError) throw insertError;
    // A fast provider webhook can insert the same message before this Edge
    // request finishes. Enrich it in place instead of creating another bubble.
    if(!message && senderName) {
      await admin.from("union_whatsapp_messages").update({sender_name:senderName})
        .eq("channel_id",thread.channel_id).eq("provider_message_id",messageId)
        .eq("organization_id",org).eq("direction","outgoing").is("sender_name",null);
    }
    if(!thread.last_message_at || new Date(now)>=new Date(thread.last_message_at)) {
      const {error:previewError}=await admin.from("union_whatsapp_conversations")
        .update({last_message:text,last_message_at:now,updated_at:now})
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
