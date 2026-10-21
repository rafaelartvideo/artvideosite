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
  avatar = false,
  presence = false,
  exportContacts = false,
  numberCheck = false,
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
    action: numberCheck ? "number_check" : exportContacts ? "contacts_export" : presence ? "presence_subscribe" : avatar ? "contact_avatar" : lookup ? "contact_lookup" : download ? "download_media" : media ? "send_media" : "send_text",
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
  const timer = setTimeout(()=>abort.abort(), download || media ? 65000 : avatar ? 25000 : 14000);
  try {
    const response = await fetch(url, {
      method:"POST",
      headers: { "Content-Type":"application/json", "X-Union-Timestamp":timestamp,
        "X-Union-Nonce":nonce, "X-Union-Signature":signature },
      body, signal:abort.signal,
    });
    const result = await response.json().catch(()=>({})) as Record<string, unknown>;
    if (!response.ok || result.ok !== true) throw Error("provider_unconfirmed");
    if (numberCheck) {
      if(!Array.isArray(result.matches)) throw Error("number_check_invalid");
      return JSON.stringify({requested:result.requested,matches:result.matches});
    }
    if (presence) return "";
    if(exportContacts) {
      if(!Array.isArray(result.contacts)) throw Error("contacts_export_invalid");
      return JSON.stringify(result.contacts.slice(0,2000));
    }
    if (avatar) {
      const base64=typeof result.avatar_base64==="string" ? result.avatar_base64 : "";
      const mime=typeof result.avatar_mime==="string" ? result.avatar_mime : "";
      if(["image/jpeg","image/png","image/webp"].includes(mime) &&
        base64 && base64.length<=270000 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64))
        return "data:"+mime+";base64,"+base64;
      // If the VPS cannot retrieve a valid photo from the CDN, let the
      // authenticated browser render the ephemeral WhatsApp CDN image URL.
      // Revalidate the origin here: never pass arbitrary provider URLs on.
      const remote=typeof result.avatar_cdn_url==="string" ? result.avatar_cdn_url : "";
      try {
        const url=new URL(remote);
        const hostname=url.hostname;
        if(url.protocol==="https:" && !url.username && !url.password && !url.port &&
          (hostname==="pps.whatsapp.net" || hostname.endsWith(".whatsapp.net") ||
           hostname==="fbcdn.net" || hostname.endsWith(".fbcdn.net")))
          return url.href;
      }catch{/* No safe external image URL available. */}
      return "";
    }
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
    if (!uuid(org) || (!["start","check_number","channel_status","departments_list","department_save","department_members","department_set_member","operator_list","operator_set","queue_default","contacts_list","contacts_import","contacts_import_device","contacts_import_batch","contacts_apply_names","contacts_save","contacts_avatar"].includes(action) && !uuid(conversationId)) ||
      !["assume","return_queue","finish","reopen","mark_read","send_text","send_media","media_view","members","transfer","start","check_number","channel_status","prepare_media","resolve_contact","contact_avatar","customer_match","departments_list","department_save","department_members","department_set_member","transfer_department","handoff_history","order_options","order_link","presence_subscribe","operator_list","operator_set","queue_default","contacts_list","contacts_import","contacts_import_device","contacts_import_batch","contacts_apply_names","contacts_save","contacts_avatar"].includes(action)) {
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
    // O perfil é atribuído individualmente ao atendimento, não herdado do cargo do CRM.
    // A permissão de visualização do módulo continua obrigatória.
    const {data:myBinding,error:myBindingError}=await admin.from("union_whatsapp_operator_bindings")
      .select("staff_role,is_active").eq("organization_id",org).eq("user_id",actorId).maybeSingle();
    if(myBindingError)throw myBindingError;
    const staffRole = myBinding?.is_active === true ? myBinding.staff_role : null;
    const canRead=permissions.has("whatsapp.inbox.view") && Boolean(staffRole);
    const canSend=canRead && permissions.has("whatsapp.inbox.send") && (staffRole==="operator" || staffRole==="both");
    const canManage=canRead && (staffRole==="manager" || staffRole==="both");
    if (!canRead ||
      (["contacts_import","contacts_import_device","contacts_import_batch","contacts_apply_names","order_link","department_save","department_members","department_set_member","handoff_history","operator_list","operator_set","queue_default"].includes(action) && !canManage) ||
      (["send_text","send_media","start","check_number","prepare_media","assume"].includes(action) && !canSend) ||
      (["contacts_save","members","transfer","transfer_department","return_queue","finish","reopen"].includes(action) && !canSend && !canManage)) {
      return json({success:false,error:"Seu perfil no atendimento não autoriza esta ação."},403);
    }

    // Validate before writing contacts or conversations; no phantom chats for invalid numbers.
    const verifyWhatsAppNumber=async (rawPhone:string) => {
      const digits=rawPhone.replace(/\D/g,"");
      const national=digits.startsWith("55")&&digits.length>11?digits.slice(2):digits;
      if(!/^[1-9][0-9][0-9]{8,9}$/.test(national))
        return {error:"Informe um telefone brasileiro com DDD válido.",status:400};
      const {data:channel,error:channelError}=await admin.from("whatsapp_channel_connections")
        .select("id,organization_id,phone").eq("organization_id",org).eq("provider","wuzapi")
        .eq("state","connected").eq("webhook_ready",true).maybeSingle();
      if(channelError)throw channelError;
      if(!channel || !/^[0-9]{10,15}$/.test(String(channel.phone||"")))
        return {error:"Conecte um número WhatsApp antes de verificar contatos.",status:409};
      try{
        const reply=JSON.parse(await signedBridge({id:channel.id,organization_id:org},
          "55"+national,"",crypto.randomUUID(),undefined,undefined,
          false,false,false,false,true));
        const requested="55"+national;
        const available=(Array.isArray(reply.matches)?reply.matches:[]).filter(
          (r:Record<string,unknown>) => /^[0-9]{12,13}$/.test(String(r.phone||""))
        ) as Array<{phone:string;verified_name?:string}>;
        // Prefer the number typed when both representations are registered.
        const matched=available.find(r=>r.phone===requested)||available[0];
        if(!matched)return {error:"Este número não foi encontrado no WhatsApp. Confira o DDD e o telefone.",status:422};
        return {channel,phone:matched.phone,alternatives:available,
          adjusted:matched.phone!==requested,verified_name:matched.verified_name||""};
      }catch{
        return {error:"Não foi possível confirmar este número no WhatsApp. Nenhuma conversa foi criada.",status:503};
      }
    };
    if(action==="check_number"){
      const verified=await verifyWhatsAppNumber(String(body.phone||""));
      if("error" in verified)return json({success:false,error:verified.error},verified.status);
      return json({success:true,phone:verified.phone,adjusted:verified.adjusted,
        alternatives:verified.alternatives,verified_name:verified.verified_name});
    }

    if(action==="operator_list" || action==="operator_set"){
      const {data:staff,error:staffError}=await admin.from("organization_members")
        .select("user_id,role_id,is_owner").eq("organization_id",org).eq("status","active").limit(500);
      if(staffError)throw staffError;
      const userIds=(staff||[]).map(m=>m.user_id);
      const roleIds=[...new Set((staff||[]).map(m=>m.role_id).filter(Boolean))];
      const {data:perm,error:permError}=await admin.from("permissions")
        .select("id,key").in("key",["whatsapp.inbox.view","whatsapp.inbox.send"]);
      if(permError || !perm || perm.length!==2) return json({success:false,error:"Permissões de atendimento não configuradas."},503);
      const viewId=perm.find(p=>p.key==="whatsapp.inbox.view")?.id;
      const sendId=perm.find(p=>p.key==="whatsapp.inbox.send")?.id;
      const {data:grants,error:grantsError}=roleIds.length
        ? await admin.from("role_permissions").select("role_id,permission_id")
            .in("permission_id",[viewId,sendId]).in("role_id",roleIds)
        : {data:[],error:null};
      if(grantsError)throw grantsError;
      const viewRoles=new Set((grants||[]).filter(g=>g.permission_id===viewId).map(g=>g.role_id));
      const sendRoles=new Set((grants||[]).filter(g=>g.permission_id===sendId).map(g=>g.role_id));
      const {data:profiles,error:profileError}=userIds.length
        ? await admin.from("profiles").select("id,full_name,username,is_active").in("id",userIds)
        : {data:[],error:null};
      if(profileError)throw profileError;
      const profileMap=new Map((profiles||[]).map(p=>[p.id,p]));
      const {data:bindings,error:bindingsError}=await admin.from("union_whatsapp_operator_bindings")
        .select("user_id,is_active,staff_role").eq("organization_id",org);
      if(bindingsError)throw bindingsError;
      const bindingMap=new Map((bindings||[]).map(b=>[b.user_id,b]));
      if(action==="operator_set"){
        const targetId=String(body.target_user_id||"");
        const staffMember=(staff||[]).find(m=>m.user_id===targetId);
        if(!uuid(targetId)||!staffMember||!profileMap.get(targetId)?.is_active)
          return json({success:false,error:"Funcionário inativo ou fora desta empresa."},403);
        const enabled=body.enabled===true;
        const nextRole=String(body.staff_role||bindingMap.get(targetId)?.staff_role||"operator");
        if(!["manager","operator","both"].includes(nextRole))
          return json({success:false,error:"Selecione Gestor, Operador ou Gestor + Operador."},400);
        if(enabled && !staffMember.is_owner && !viewRoles.has(staffMember.role_id))
          return json({success:false,error:"Conceda a permissão de visualizar o módulo de atendimentos à função deste funcionário."},409);
        if(enabled && (nextRole==="operator" || nextRole==="both") &&
          !staffMember.is_owner && !sendRoles.has(staffMember.role_id))
          return json({success:false,error:"Conceda a permissão de envio WhatsApp à função deste funcionário para atuar como operador."},409);

        const current=bindingMap.get(targetId);
        if(current?.is_active && (current.staff_role==="operator"||current.staff_role==="both") &&
          (!enabled || nextRole==="manager")){
          const {count,error:activeError}=await admin.from("union_whatsapp_conversations")
            .select("id",{count:"exact",head:true})
            .eq("organization_id",org).eq("assigned_to",targetId).eq("status","in_att");
          if(activeError)throw activeError;
          if((count||0)>0) return json({success:false,error:
            "Este operador possui atendimentos em andamento. Encaminhe ou devolva as conversas antes de remover o perfil de Operador."},409);
        }
        if(current?.is_active && ["manager","both"].includes(current.staff_role) &&
          (!enabled || nextRole==="operator")){
          const remaining=(bindings||[]).filter(b=>b.is_active && b.user_id!==targetId &&
            (b.staff_role==="manager"||b.staff_role==="both") &&
            (staff||[]).some(m=>m.user_id===b.user_id && profileMap.get(m.user_id)?.is_active));
          if(!remaining.length)return json({success:false,error:
            "É necessário manter ao menos um gestor ativo no atendimento. Defina outro gestor antes de retirar este perfil."},409);
        }
        const {error:saveError}=await admin.from("union_whatsapp_operator_bindings")
          .upsert({organization_id:org,user_id:targetId,is_active:enabled,staff_role:nextRole,updated_at:new Date().toISOString()},
            {onConflict:"organization_id,user_id"});
        if(saveError)throw saveError;
        bindingMap.set(targetId,{user_id:targetId,is_active:enabled,staff_role:nextRole});
      }
      const operators=(staff||[]).filter(m=>profileMap.get(m.user_id)?.is_active)
        .map(m=>({id:m.user_id,name:profileMap.get(m.user_id)?.full_name||
            profileMap.get(m.user_id)?.username||"Funcionário",
          eligible:Boolean(m.is_owner||viewRoles.has(m.role_id)),
          can_attend:Boolean(m.is_owner||sendRoles.has(m.role_id)),
          is_active:bindingMap.get(m.user_id)?.is_active===true,
          staff_role:bindingMap.get(m.user_id)?.staff_role||"operator",
          is_manager:Boolean(bindingMap.get(m.user_id)?.is_active &&
            ["manager","both"].includes(bindingMap.get(m.user_id)?.staff_role))}))
        .sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
      return json({success:true,operators});
    }

    if(action==="queue_default"){
      const queueId=String(body.department_id||"");
      if(queueId && !uuid(queueId)) return json({success:false,error:"Fila inválida."},400);
      if(queueId){
        const {data:target,error:targetError}=await admin.from("union_whatsapp_departments")
          .select("id").eq("organization_id",org).eq("id",queueId).eq("is_active",true).maybeSingle();
        if(targetError)throw targetError;
        if(!target) return json({success:false,error:"Selecione uma fila ativa."},409);
      }
      const {error:clearError}=await admin.from("union_whatsapp_departments")
        .update({is_default:false,updated_at:new Date().toISOString()})
        .eq("organization_id",org).eq("is_default",true);
      if(clearError)throw clearError;
      if(queueId){
        const {error:setError}=await admin.from("union_whatsapp_departments")
          .update({is_default:true,updated_at:new Date().toISOString()})
          .eq("organization_id",org).eq("id",queueId);
        if(setError)throw setError;
      }
      return json({success:true});
    }


    if(action==="departments_list" || action==="department_save" ||
      action==="department_members" || action==="department_set_member") {
      if(action==="department_save") {
        const departmentId=String(body.department_id||"");
        const name=String(body.name||"").trim().replace(/\s+/g," ").slice(0,80);
        if((departmentId && !uuid(departmentId)) || name.length<2)
          return json({success:false,error:"Informe um nome de departamento válido."},400);
        if(departmentId) {
          const {data:updated,error}=await admin.from("union_whatsapp_departments")
            .update({name,is_active:body.is_active!==false,
               ...(body.is_active===false?{is_default:false}:{}),
               updated_at:new Date().toISOString()})
            .eq("organization_id",org).eq("id",departmentId).select("id").maybeSingle();
          if(error) throw error;
          if(!updated)return json({success:false,error:"Departamento não encontrado."},404);
        } else {
          const {error}=await admin.from("union_whatsapp_departments")
            .insert({organization_id:org,name,is_active:true});
          if(error)throw error;
        }
      }
      if(action==="department_members" || action==="department_set_member") {
        const departmentId=String(body.department_id||"");
        if(!uuid(departmentId))return json({success:false,error:"Departamento inválido."},400);
        const {data:dept,error:deptError}=await admin.from("union_whatsapp_departments")
          .select("id").eq("organization_id",org).eq("id",departmentId).maybeSingle();
        if(deptError)throw deptError;
        if(!dept)return json({success:false,error:"Departamento não encontrado."},404);
        if(action==="department_set_member"){
          const target=String(body.target_user_id||"");
          if(!uuid(target))return json({success:false,error:"Funcionário inválido."},400);
          const {data:member,error:memberError}=await admin.from("organization_members")
            .select("user_id").eq("organization_id",org).eq("user_id",target)
            .eq("status","active").maybeSingle();
          if(memberError)throw memberError;
          if(!member)return json({success:false,error:"Funcionário não pertence à empresa."},403);
          if(body.enabled===true){
            const {data:binding,error:bindingError}=await admin.from("union_whatsapp_operator_bindings")
              .select("is_active,staff_role").eq("organization_id",org).eq("user_id",target).maybeSingle();
            if(bindingError)throw bindingError;
            if(!binding?.is_active || !["operator","both"].includes(binding.staff_role)) return json({success:false,error:"O funcionário precisa ter o perfil de Operador para participar da fila."},409);
            const {error}=await admin.from("union_whatsapp_department_members")
              .upsert({department_id:departmentId,organization_id:org,user_id:target},
                {onConflict:"department_id,user_id",ignoreDuplicates:true});
            if(error)throw error;
          }else{
            const {error}=await admin.from("union_whatsapp_department_members")
              .delete().eq("organization_id",org).eq("department_id",departmentId)
              .eq("user_id",target);
            if(error)throw error;
          }
        }
        const {data:members,error}=await admin.from("union_whatsapp_department_members")
          .select("user_id").eq("organization_id",org).eq("department_id",departmentId);
        if(error)throw error;
        return json({success:true,member_ids:(members||[]).map(m=>m.user_id)});
      }
      const {data:departments,error}=await admin.from("union_whatsapp_departments")
        .select("id,name,is_active,is_default").eq("organization_id",org).order("name").limit(100);
      if(error)throw error;
      return json({success:true,departments:departments||[]});
    }
    if(["contacts_list","contacts_import","contacts_import_device","contacts_import_batch","contacts_apply_names","contacts_save","contacts_avatar"].includes(action)) {
      const {data:channel,error:channelError}=await admin.from("whatsapp_channel_connections")
        .select("id,state,webhook_ready,phone").eq("organization_id",org).eq("provider","wuzapi").eq("state","connected").maybeSingle();
      if(channelError)throw channelError;
      if(!channel)return json({success:false,error:"Configure um canal WhatsApp primeiro."},409);
      if(channel.state!=="connected" || !channel.webhook_ready ||
        !/^[0-9]{10,15}$/.test(String(channel.phone||""))){
        // A disconnected account must not load even the saved-contact list.
        if(action==="contacts_list")return json({success:true,contacts:[],total:0});
        return json({success:false,error:"Conecte o número de WhatsApp antes de consultar ou importar contatos."},409);
      }
      // Reject stale batches from an earlier number, even if the same technical
      // channel identifier is reused after reconnection.
      if(["contacts_import_device","contacts_import_batch","contacts_apply_names"].includes(action) &&
        typeof body.account_phone==="string" && body.account_phone!==channel.phone)
        return json({success:false,error:"O número conectado mudou. Selecione novamente o arquivo para iniciar na conta correta."},409);
      // Importers update only their own name source; never erase a manually
      // saved name or another import source on an UPSERT conflict.
      const mergeContactRows=async(rows:Array<{
        chat_jid:string;contact_phone?:string|null;display_name?:string|null;
        device_name?:string|null;imported_name?:string|null;profile_name?:string|null;
        wuzapi_verified_saved?:boolean;
      }>)=>{
        for(let offset=0;offset<rows.length;offset+=100){
          const batch=rows.slice(offset,offset+100);
          const {data:old,error:oldError}=await admin.from("union_whatsapp_contacts")
            .select("chat_jid,contact_phone,display_name,device_name,imported_name,profile_name,wuzapi_verified_saved")
            .eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
            .in("chat_jid",batch.map(row=>row.chat_jid));
          if(oldError)throw oldError;
          const byJid=new Map((old||[]).map(row=>[row.chat_jid,row]));
          const updates=batch.map(row=>{
            const previous=byJid.get(row.chat_jid);
            return {
              organization_id:org,channel_id:channel.id,account_phone:channel.phone,chat_jid:row.chat_jid,
              contact_phone:row.contact_phone??previous?.contact_phone??null,
              display_name:row.display_name??previous?.display_name??null,
              device_name:row.device_name??previous?.device_name??null,
              imported_name:row.imported_name??previous?.imported_name??null,
              profile_name:row.profile_name??previous?.profile_name??null,
              wuzapi_verified_saved:row.wuzapi_verified_saved===true ||
                previous?.wuzapi_verified_saved===true,
              updated_at:new Date().toISOString(),
            };
          });
          const {error:saveError}=await admin.from("union_whatsapp_contacts")
            .upsert(updates,{onConflict:"channel_id,account_phone,chat_jid"});
          if(saveError)throw saveError;
        }
      };
      if(action==="contacts_avatar") {
        const jid=String(body.chat_jid||"");
        if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid))
          return json({success:false,error:"Contato inválido."},400);
        const {data:known,error:knownError}=await admin.from("union_whatsapp_contacts")
          .select("id").eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
          .eq("chat_jid",jid).maybeSingle();
        if(knownError)throw knownError;
        if(!known){
          // Editing an existing conversation also needs its avatar, even if
          // the participant was never saved in the contact directory.
          const {data:thread,error:threadError}=await admin
            .from("union_whatsapp_conversations").select("id")
            .eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
            .eq("chat_jid",jid).maybeSingle();
          if(threadError)throw threadError;
          if(!thread)return json({success:false,error:"Contato não encontrado neste canal."},404);
        }
        try{
          const photo=await signedBridge({id:channel.id,organization_id:org},
            "",jid,crypto.randomUUID(),undefined,undefined,false,true);
          return json({success:true,avatar_url:photo||null});
        }catch{return json({success:true,avatar_url:null});}
      }
      if(action==="contacts_list") {
        // Contacts is a saved directory, NOT every person encountered in
        // conversations, group members, or the WhatsApp profile cache.
        const page=Math.min(40,Math.max(0,Number(body.page)||0));
        const search=String(body.search||"").trim().replace(/[^\p{L}\p{N} +().-]/gu,"").slice(0,60);
        let q=admin.from("union_whatsapp_contacts")
          .select("id,chat_jid,contact_phone,display_name,device_name,imported_name,profile_name,updated_at",{count:"exact"})
          .eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
          .or("display_name.not.is.null,device_name.not.is.null,wuzapi_verified_saved.eq.true");
        if(search){
          const term=search.replace(/[%,]/g,"");
          q=q.or("display_name.ilike.%"+term+"%,device_name.ilike.%"+term+
            "%,imported_name.ilike.%"+term+"%,profile_name.ilike.%"+term+
            "%,contact_phone.ilike.%"+term+"%");
        }
        const {data,error,count}=await q.order("updated_at",{ascending:false})
          .range(page*100,page*100+99);
        if(error)throw error;
        return json({success:true,contacts:data||[],total:count||0});
      }
      if(action==="contacts_save") {
        const raw=String(body.chat_jid||"");
        const inputPhone=String(body.phone||"").replace(/\D/g,"");
        const normalized=inputPhone.startsWith("55")&&inputPhone.length>11
          ? inputPhone.slice(2):inputPhone;
        const jid=raw || (/^[1-9][0-9][0-9]{8,9}$/.test(normalized)
          ? "55"+normalized+"@s.whatsapp.net" : "");
        if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid))
          return json({success:false,error:"Informe um telefone com DDD válido."},400);
        if(raw){
          const {data:known,error:knownError}=await admin.from("union_whatsapp_contacts")
            .select("id").eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
            .eq("chat_jid",jid).maybeSingle();
          if(knownError)throw knownError;
          const {data:convo,error:convError}=await admin.from("union_whatsapp_conversations")
            .select("id").eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
            .eq("chat_jid",jid).maybeSingle();
          if(convError)throw convError;
          if(!known && !convo)return json({success:false,error:"Contato não encontrado neste canal."},404);
        }
        const displayName=String(body.display_name||"").trim().replace(/\s+/g," ").slice(0,160);
        if(displayName.length<2)return json({success:false,error:"Informe o nome que deseja salvar para o contato."},400);
        const submitted=String(body.phone||"").replace(/\D/g,"");
        const requested=jid.endsWith("@s.whatsapp.net")?jid.split("@")[0]:null;
        let newJid=jid;
        if(submitted && submitted!==requested){
          const verified=await verifyWhatsAppNumber(submitted);
          if("error" in verified)return json({success:false,error:verified.error},verified.status);
          newJid=verified.phone+"@s.whatsapp.net";
        } else if(!raw){
          const verified=await verifyWhatsAppNumber(jid.split("@")[0]);
          if("error" in verified)return json({success:false,error:verified.error},verified.status);
          newJid=verified.phone+"@s.whatsapp.net";
        }
        const number=newJid.endsWith("@s.whatsapp.net")?newJid.split("@")[0]:null;
        await mergeContactRows([{chat_jid:newJid,contact_phone:number,display_name:displayName}]);
        if(newJid!==jid){
          // Keep historic messages unchanged: only move the saved contact.
          const {error:removeError}=await admin.from("union_whatsapp_contacts").delete()
            .eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
            .eq("chat_jid",jid);
          if(removeError)throw removeError;
        }
        const {data:saved,error:saveError}=await admin.from("union_whatsapp_contacts")
          .select("id,chat_jid,contact_phone,display_name")
          .eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
          .eq("chat_jid",newJid).single();
        if(saveError)throw saveError;
        const {error:renameError}=await admin.from("union_whatsapp_conversations")
          .update({contact_name:displayName,updated_at:new Date().toISOString()})
          .eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone).eq("chat_jid",newJid);
        if(renameError)throw renameError;
        return json({success:true,contact:saved,number_adjusted:newJid!==jid});
      }
      if(action==="contacts_apply_names"){
        const {error:applyError}=await admin.rpc("union_whatsapp_apply_contact_names",{
          p_organization:org,p_channel:channel.id,
        });
        if(applyError)throw applyError;
        return json({success:true});
      }
      if(action==="contacts_import_device" || action==="contacts_import_batch") {
        const provided=body.contacts;
        const maxBatch=action==="contacts_import_batch"?250:100;
        if(!Array.isArray(provided) || !provided.length || provided.length>maxBatch)
          return json({success:false,error:"Envie de 1 a "+maxBatch+" contatos por vez."},400);
        const normalized=new Map<string,{organization_id:string;channel_id:string;account_phone:string;chat_jid:string;contact_phone:string;device_name:string;updated_at:string}>();
        for(const item of provided) {
          const row=item&&typeof item==="object"?item as Record<string,unknown>:{};
          const digits=String(row.phone||"").replace(/\D/g,"");
          const national=digits.startsWith("55")&&digits.length>11?digits.slice(2):digits;
          const deviceName=String(row.name||"").trim().replace(/\s+/g," ").slice(0,160);
          if(!/^[1-9][0-9][0-9]{8,9}$/.test(national) ||
            deviceName.length<2)continue;
          const phone="55"+national,jid=phone+"@s.whatsapp.net";
          normalized.set(jid,{organization_id:org,channel_id:channel.id,account_phone:channel.phone,
            chat_jid:jid,contact_phone:phone,device_name:deviceName,
            updated_at:new Date().toISOString()});
        }
        if(!normalized.size)return json({success:false,error:"Nenhum telefone brasileiro válido encontrado no arquivo."},400);
        if(action==="contacts_import_batch"){
          if(body.account_phone!==channel.phone)
            return json({success:false,error:"A planilha pertence a outra conexão do WhatsApp."},409);
          // One atomic PostgreSQL upsert per batch, instead of multiple
          // read-merge-write requests. SQL updates only device_name/phone,
          // preserving manual overrides even if edited concurrently.
          const {data:processed,error:batchError}=await admin.rpc(
            "union_whatsapp_import_contacts_batch",{
              p_organization:org,p_channel:channel.id,
              p_contacts:[...normalized.values()].map(row=>({
                name:row.device_name,phone:row.contact_phone,account_phone:channel.phone,
              })),
            });
          if(batchError)throw batchError;
          if(Number(processed)!==normalized.size)
            return json({success:false,error:"O lote não foi confirmado integralmente."},502);
          return json({success:true,imported:normalized.size});
        }
        await mergeContactRows([...normalized.values()]);
        // VCF maintains its existing behavior; bulk Excel/CSV syncs names
        // only on completion or pause/cancellation.
        if(action==="contacts_import_device"){
          const {error:applyError}=await admin.rpc("union_whatsapp_apply_contact_names",{
            p_organization:org,p_channel:channel.id,
          });
          if(applyError)throw applyError;
        }
        return json({success:true,imported:normalized.size});
      }
      if(channel.state!=="connected")
        return json({success:false,error:"Conecte o canal para importar a agenda."},409);
      let exported:unknown;
      try{
        const result=await signedBridge({id:channel.id,organization_id:org},"","",crypto.randomUUID(),
          undefined,undefined,false,false,false,true);
        exported=JSON.parse(result);
      }catch{return json({success:false,error:"Não foi possível ler a agenda do WhatsApp. Confira se a ponte da VPS está atualizada."},502);}
      if(!Array.isArray(exported))return json({success:false,error:"Formato de contatos não reconhecido."},502);
      // Reject old bridge versions rather than import public names as saved.
      // The bridge must only mark FullName/FirstName contacts as verified.
      if(exported.some(item=>!item || typeof item!=="object" ||
        (item as Record<string,unknown>).saved_in_address_book!==true))
        return json({success:false,error:"Atualize a ponte WuzAPI da VPS antes de importar contatos. A versão anterior inclui pessoas de grupos."},409);
      const mapped=exported.slice(0,2000).flatMap(item=>{
        const row=item&&typeof item==="object"?item as Record<string,unknown>:{};
        const jid=String(row.jid||"");
        if(!/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(jid))return [];
        const safe=(value:unknown)=>String(value||"").trim().slice(0,160);
        // Public PushName and the business profile never count as saved.
        if(!safe(row.imported_name))return [];
        return [{
          organization_id:org,channel_id:channel.id,account_phone:channel.phone,chat_jid:jid,
          contact_phone:jid.endsWith("@s.whatsapp.net")?jid.split("@")[0]:null,
          imported_name:safe(row.imported_name)||null,
          profile_name:safe(row.profile_name)||null,
          wuzapi_verified_saved:true,
          updated_at:new Date().toISOString(),
        }];
      });
      const unique=[...new Map(mapped.map(row=>[row.chat_jid,row])).values()];
      await mergeContactRows(unique);
      // Saved names always have higher priority. An imported address-book
      // name is used only for conversations without a manually-saved name.
      const {error:syncError}=await admin.rpc("union_whatsapp_apply_contact_names",{
        p_organization:org,p_channel:channel.id,
      });
      if(syncError)throw syncError;
      return json({success:true,imported:unique.length,truncated:exported.length>=2000});
    }
    if(action==="channel_status") {
      const {data:channel,error}=await admin.from("whatsapp_channel_connections")
        .select("id,state,webhook_ready,phone") .eq("organization_id",org)
        .eq("provider","wuzapi").eq("state","connected").maybeSingle();
      if(error) throw error;
      const ready=Boolean(channel && channel.state==="connected" &&
        channel.webhook_ready && /^[0-9]{10,15}$/.test(String(channel.phone||"")));
      return json({success:true,channel_connected:ready,staff_role:staffRole,
        channel_id:ready?channel?.id:null,channel_phone:ready?channel?.phone:null});
    }
    if(action==="start") {
      const inputDigits=String(body.phone||"").replace(/\D/g,"");
      const national=inputDigits.startsWith("55") && inputDigits.length>11
        ? inputDigits.slice(2) : inputDigits;
      if(!/^[1-9][0-9][0-9]{8,9}$/.test(national))
        return json({success:false,error:"Informe um telefone brasileiro com DDD válido."},400);
      // Resolve the actual WhatsApp identity first (including optional ninth digit).
      // Never create a conversation when the provider rejects or cannot verify.
      const verified=await verifyWhatsAppNumber("55"+national);
      if("error" in verified)return json({success:false,error:verified.error},verified.status);
      const phone=verified.phone!;
      const customerName=String(body.contact_name||"").trim().slice(0,120);
      const {data:channel,error:channelError}=await admin.from("whatsapp_channel_connections")
        .select("id,state,webhook_ready,phone").eq("organization_id",org)
        .eq("provider","wuzapi").eq("state","connected").maybeSingle();
      if(channelError || !channel || channel.state!=="connected" || !channel.webhook_ready || !/^[0-9]{10,15}$/.test(channel.phone||""))
        return json({success:false,error:"Conecte o canal WhatsApp antes de iniciar uma conversa."},409);
      const jid=phone+"@s.whatsapp.net";
      const {data:knownContact,error:knownError}=await admin.from("union_whatsapp_contacts")
        .select("display_name,device_name,imported_name,profile_name,wuzapi_verified_saved")
        .eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone)
        .eq("chat_jid",jid).maybeSingle();
      if(knownError)throw knownError;
      const preferredName=customerName || knownContact?.display_name ||
        knownContact?.device_name ||
        (knownContact?.wuzapi_verified_saved ? knownContact.imported_name : null) ||
        knownContact?.profile_name || phone;
      const persistManualName=async()=>{
        if(!customerName)return;
        const {error:contactError}=await admin.from("union_whatsapp_contacts").upsert({
          organization_id:org,channel_id:channel.id,account_phone:channel.phone,chat_jid:jid,
          contact_phone:phone,display_name:customerName,
          device_name:knownContact?.device_name??null,
          imported_name:knownContact?.imported_name??null,
          profile_name:knownContact?.profile_name??null,
          wuzapi_verified_saved:knownContact?.wuzapi_verified_saved===true,
          updated_at:new Date().toISOString(),
        },{onConflict:"channel_id,account_phone,chat_jid"});
        if(contactError)throw contactError;
        const {error:renameError}=await admin.from("union_whatsapp_conversations")
          .update({contact_name:customerName})
          .eq("organization_id",org).eq("channel_id",channel.id).eq("account_phone",channel.phone).eq("chat_jid",jid);
        if(renameError)throw renameError;
      };
      const {data:phoneMatches,error:matchError}=await admin.from("union_whatsapp_conversations")
        .select("id,status,assigned_to,chat_jid").eq("organization_id",org)
        .eq("channel_id",channel.id).eq("account_phone",channel.phone)
        .eq("contact_phone",phone).order("last_message_at",{ascending:false}).limit(5);
      if(matchError)throw matchError;
      const previouslyKnown=phoneMatches?.[0];
      const {data:created,error:createError}=previouslyKnown ? {data:null,error:null} :
        await admin.from("union_whatsapp_conversations")
        .upsert({organization_id:org,channel_id:channel.id,account_phone:channel.phone,chat_jid:jid,
          contact_name:preferredName,contact_phone:phone,
          status:"in_att",assigned_to:actorId,
        },{onConflict:"channel_id,account_phone,chat_jid",ignoreDuplicates:true})
        .select("id").maybeSingle();
      if(createError) throw createError;
      if(created) {
        await persistManualName();
        await admin.from("union_whatsapp_handoffs").insert({
          organization_id:org,conversation_id:created.id,actor_id:actorId,action:"start"
        });
        return json({success:true,conversation_id:created.id});
      }
      const readExisting=previouslyKnown ? {data:previouslyKnown,error:null} :
        await admin.from("union_whatsapp_conversations")
        .select("id,status,assigned_to").eq("organization_id",org)
        .eq("channel_id",channel.id).eq("account_phone",channel.phone).eq("chat_jid",jid).single();
      const {data:existing,error:existingError}=readExisting;
      if(existingError || !existing) throw existingError || Error("conversation_not_found");
      if(existing.status==="in_att" && existing.assigned_to===actorId) {
        await persistManualName();
        return json({success:true,conversation_id:existing.id,already_open:true});
      }
      if(existing.status==="in_att" && existing.assigned_to!==actorId)
        return json({success:false,error:"Este cliente já está em atendimento com outro funcionário."},409);
      // Starting a conversation with an existing closed number resumes
      // the same conversation and preserves its history. This is an
      // authorized send action; it must not leave the status finished.
      const {data:claimed,error:claimError}=await admin.from("union_whatsapp_conversations")
        .update({status:"in_att",assigned_to:actorId,updated_at:new Date().toISOString()})
        .eq("organization_id",org).eq("id",existing.id)
        .eq("status",existing.status).is("assigned_to",null)
        .select("id").maybeSingle();
      if(claimError) throw claimError;
      if(!claimed) return json({success:false,error:"A conversa foi assumida por outro funcionário."},409);
      await persistManualName();
      await admin.from("union_whatsapp_handoffs").insert({
        organization_id:org,conversation_id:claimed.id,actor_id:actorId,action:"start"
      });
      return json({success:true,conversation_id:claimed.id});
    }
    const {data:thread,error:threadError}=await admin.from("union_whatsapp_conversations")
      .select("id,organization_id,channel_id,account_phone,chat_jid,contact_phone,status,assigned_to,department_id,service_order_id,last_message_at")
      .eq("id",conversationId).eq("organization_id",org).maybeSingle();
    if(threadError) throw threadError;
    if(!thread) return json({success:false,error:"Conversa não encontrada nesta empresa."},404);
    // Do not read or operate on conversations of disconnected/retired channels.
    const {data:activeChannel,error:activeChannelError}=await admin
      .from("whatsapp_channel_connections")
      .select("id,state,webhook_ready,phone")
      .eq("id",thread.channel_id).eq("organization_id",org)
      .eq("provider","wuzapi").eq("state","connected").maybeSingle();
    if(activeChannelError)throw activeChannelError;
    if(!activeChannel || activeChannel.state!=="connected" ||
      !activeChannel.webhook_ready ||
      !/^[0-9]{10,15}$/.test(String(activeChannel.phone||"")) ||
      thread.account_phone!==activeChannel.phone)
      return json({success:false,error:"Este canal WhatsApp não está conectado."},409);
    if(!canManage){
      const assigned=thread.assigned_to===actorId;
      let inQueue=false;
      if(thread.status==="waiting" && !thread.assigned_to){
        if(!thread.department_id) inQueue=true;
        else{
          const {data:membership,error:membershipError}=await admin.from("union_whatsapp_department_members")
            .select("user_id").eq("organization_id",org)
            .eq("department_id",thread.department_id).eq("user_id",actorId).maybeSingle();
          if(membershipError)throw membershipError;
          inQueue=Boolean(membership);
        }
      }
      if(!assigned && !inQueue) return json({success:false,error:"Atendimento pertencente a outra fila ou outro operador."},403);
    }
    if(action==="handoff_history") {
      const {data:history,error}=await admin.from("union_whatsapp_handoffs")
        .select("id,action,actor_id,to_user_id,to_department_id,created_at")
        .eq("organization_id",org).eq("conversation_id",thread.id)
        .order("created_at",{ascending:false}).limit(50);
      if(error)throw error;
      return json({success:true,history:history||[]});
    }
    if(action==="transfer_department") {
      const targetId=String(body.department_id||"");
      if(!uuid(targetId))return json({success:false,error:"Selecione um departamento."},400);
      if(thread.status!=="in_att" || !thread.assigned_to)
        return json({success:false,error:"Assuma o atendimento antes de encaminhar."},409);
      const {data:dept,error:deptError}=await admin.from("union_whatsapp_departments")
        .select("id").eq("organization_id",org).eq("id",targetId)
        .eq("is_active",true).maybeSingle();
      if(deptError)throw deptError;
      if(!dept)return json({success:false,error:"Departamento não está ativo."},409);
      const {data:updated,error:changeError}=await admin.from("union_whatsapp_conversations")
        .update({status:"waiting",assigned_to:null,department_id:targetId,
          updated_at:new Date().toISOString()})
        .eq("id",thread.id).eq("organization_id",org).eq("status","in_att")
        .eq("assigned_to",thread.assigned_to).select("id").maybeSingle();
      if(changeError)throw changeError;
      if(!updated)return json({success:false,error:"Atendimento alterado. Atualize a conversa."},409);
      await admin.from("union_whatsapp_handoffs").insert({
        organization_id:org,conversation_id:thread.id,actor_id:actorId,
        action:"transfer_department",to_department_id:targetId
      });
      return json({success:true});
    }
    if(action==="order_options" || action==="order_link") {
      if(!permissions.has("orders.details.view"))
        return json({success:false,error:"Sem permissão para visualizar ordens de serviço."},403);
      if(!(canManage || thread.assigned_to===actorId ||
        (thread.status==="waiting" && !thread.assigned_to)))
        return json({success:false,error:"Conversa não atribuída a você."},403);
      const phone=String(thread.contact_phone||"").replace(/\D/g,"");
      if(!/^[0-9]{10,15}$/.test(phone))
        return json({success:false,error:"Este contato não possui telefone verificado para vincular OS."},409);
      const {data:matches,error:matchError}=await admin.rpc("union_whatsapp_find_customer_by_phone",{
        p_organization:org,p_phone:phone,
      });
      if(matchError)throw matchError;
      if(!Array.isArray(matches) || matches.length!==1)
        return json({success:false,error:"Não existe um cliente único correspondente a este telefone."},409);
      const customerId=matches[0].customer_id;
      if(action==="order_options") {
        const {data:orders,error:orderError}=await admin.from("service_orders")
          .select("id,os_number,created_at").eq("organization_id",org)
          .eq("customer_id",customerId).order("created_at",{ascending:false}).limit(50);
        if(orderError)throw orderError;
        return json({success:true,orders:orders||[],service_order_id:thread.service_order_id});
      }
      const target=String(body.service_order_id||"");
      if(target && !uuid(target))return json({success:false,error:"Ordem de serviço inválida."},400);
      if(target){
        const {data:order,error:orderError}=await admin.from("service_orders")
          .select("id").eq("id",target).eq("organization_id",org)
          .eq("customer_id",customerId).maybeSingle();
        if(orderError)throw orderError;
        if(!order)return json({success:false,error:"Esta OS não pertence ao cliente verificado."},403);
      }
      const {error:saveError}=await admin.from("union_whatsapp_conversations")
        .update({service_order_id:target||null,updated_at:new Date().toISOString()})
        .eq("id",thread.id).eq("organization_id",org);
      if(saveError)throw saveError;
      return json({success:true,service_order_id:target||null});
    }
    if(action==="presence_subscribe") {
      if(!(canManage || thread.assigned_to===actorId ||
        (thread.status==="waiting" && !thread.assigned_to)))
        return json({success:false,error:"Conversa não disponível."},403);
      try{
        await signedBridge({id:thread.channel_id,organization_id:org},"",thread.chat_jid,
          crypto.randomUUID(),undefined,undefined,false,false,true);
        return json({success:true});
      }catch{return json({success:true});}
    }
    if(action==="customer_match") {
      if(!permissions.has("customers.view")) return json({success:false,error:"Sem permissão para visualizar clientes."},403);
      if(!(canManage || thread.assigned_to===actorId ||
          (thread.status==="waiting" && !thread.assigned_to))) {
        return json({success:false,error:"Conversa não disponível para consulta."},403);
      }
      // A LID is not a phone number. Never guess a customer from it.
      const phone=String(thread.contact_phone||"").replace(/\D/g,"");
      if(!/^[0-9]{10,15}$/.test(phone)) return json({success:true,customer:null});
      const {data:matches,error:matchError}=await admin.rpc("union_whatsapp_find_customer_by_phone",{
        p_organization:org,p_phone:phone,
      });
      if(matchError) throw matchError;
      if(!Array.isArray(matches) || matches.length!==1) {
        return json({success:true,customer:null,ambiguous:Array.isArray(matches)&&matches.length>1});
      }
      return json({success:true,customer:{id:matches[0].customer_id,name:matches[0].customer_name}});
    }
    if(action==="contact_avatar") {
      // At this point the caller passed the company, operator binding and
      // whatsapp.inbox.view checks, and the conversation belongs to the org.
      // A finished or returned thread must not lose its profile photo.
      try {
        const avatar=await signedBridge(
          {id:thread.channel_id,organization_id:org},"",thread.chat_jid,crypto.randomUUID(),
          undefined,undefined,false,true
        );
        return json({success:true,avatar_url:avatar||null});
      } catch {return json({success:true,avatar_url:null});}
    }
    if(action==="resolve_contact") {
      const {data:known,error:knownError}=await admin.from("union_whatsapp_contacts")
        .select("display_name,device_name,imported_name,profile_name,wuzapi_verified_saved")
        .eq("organization_id",org).eq("channel_id",thread.channel_id)
        .eq("chat_jid",thread.chat_jid).maybeSingle();
      if(knownError)throw knownError;
      const authoritative=String(known?.display_name||known?.device_name||
        (known?.wuzapi_verified_saved?known.imported_name:null)||"").trim();
      const {data:existing,error:existingError}=await admin.from("union_whatsapp_conversations")
        .select("contact_name,contact_phone").eq("id",thread.id)
        .eq("organization_id",org).maybeSingle();
      if(existingError)throw existingError;
      const current=String(existing?.contact_name||"").trim();
      const placeholder=!current || current==="Contato WhatsApp" ||
        (existing?.contact_phone && current===existing.contact_phone) ||
        (known?.profile_name && current===known.profile_name);
      if(authoritative){
        if(current!==authoritative && (known?.display_name || placeholder)){
          const {error:writeError}=await admin.from("union_whatsapp_conversations")
            .update({contact_name:authoritative})
            .eq("id",thread.id).eq("organization_id",org);
          if(writeError)throw writeError;
        }
        return json({success:true,contact_name:known?.display_name||(!placeholder?current:authoritative)});
      }
      if(!placeholder)return json({success:true,contact_name:current});
      try{
        const value=await signedBridge(
          {id:thread.channel_id,organization_id:org},"",thread.chat_jid,crypto.randomUUID(),
          undefined,undefined,true
        );
        const cut=value.indexOf(":");
        const candidate=cut>=0?value.slice(cut+1).trim():"";
        if(candidate && candidate!==current){
          const {error}=await admin.from("union_whatsapp_conversations")
            .update({contact_name:candidate}).eq("id",thread.id).eq("organization_id",org);
          if(error)throw error;
          return json({success:true,contact_name:candidate});
        }
      }catch{/* Directory unavailability cannot block the inbox. */}
      return json({success:true,contact_name:current});
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
      const {data:activeBindings,error:activeBindingsError}=await admin.from("union_whatsapp_operator_bindings")
        .select("user_id,staff_role").eq("organization_id",org).eq("is_active",true)
        .in("staff_role",["operator","both"]);
      if(activeBindingsError)throw activeBindingsError;
      const activeOperators=new Set((activeBindings||[]).map(b=>b.user_id));
      const eligible=(members||[]).filter(m=>
        (m.is_owner || eligibleRoles.has(m.role_id)) && activeOperators.has(m.user_id));
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
      await admin.from("union_whatsapp_handoffs").insert({
        organization_id:org,conversation_id:thread.id,actor_id:actorId,
        action:"transfer_operator",to_user_id:targetId,
      });
      return json({success:true});
    }
    // Department routing limits who may assume a queue; company managers
    // retain access to all departments.
    if(action==="assume" && thread.department_id && !canManage) {
      const {data:belongs,error:membershipError}=await admin.from("union_whatsapp_department_members")
        .select("user_id").eq("organization_id",org)
        .eq("department_id",thread.department_id).eq("user_id",actorId).maybeSingle();
      if(membershipError)throw membershipError;
      if(!belongs)return json({success:false,error:"Você não pertence ao departamento deste atendimento."},403);
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
      await admin.from("union_whatsapp_handoffs").insert({
        organization_id:org,conversation_id:thread.id,actor_id:actorId,action:"assume",
      });
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
      await admin.from("union_whatsapp_handoffs").insert({
        organization_id:org,conversation_id:thread.id,actor_id:actorId,action,
      });
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
        :kind==="audio" ? ["audio/ogg","audio/opus","audio/mp4","audio/mpeg"].includes(mime)
        :kind==="video" ? ["video/mp4","video/3gpp"].includes(mime)
        :kind==="file" ? ["application/pdf","text/plain","application/zip","application/octet-stream","audio/webm",
            "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime)
        :false;
      if(!uuid(id) || !accepted || !name || !Number.isSafeInteger(fileSize) ||
        fileSize<1 || fileSize>caps[kind]) return json({success:false,
        error:"Formato ou tamanho do arquivo não permitido para este canal."},413);
      const ext=kind==="image"?(mime==="image/png"?"png":"jpg"):
        kind==="audio"?(mime==="audio/mp4"?"m4a":mime==="audio/mpeg"?"mp3":"ogg"):kind==="video"?"mp4":
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
      : kind==="audio" ? ["audio/ogg","audio/opus","audio/mp4","audio/mpeg"].includes(mime)
      : kind==="video" ? ["video/mp4","video/3gpp"].includes(mime)
      : kind==="file" ? ["application/pdf","text/plain","application/zip","application/octet-stream","audio/webm",
          "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime) : false
    );
    const fileSize=Number(body.media_size);
    const mediaPath=isMedia ? String(body.media_path||"") : "";
    const ext=isMedia ? kind==="image"?(mime==="image/png"?"png":"jpg"):
      kind==="video"?"mp4":kind==="audio"?(mime==="audio/mp4"?"m4a":mime==="audio/mpeg"?"mp3":"ogg"):
      (name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"").slice(0,10).toLowerCase()||"bin" : "";
    const expectedMediaPath=isMedia ? org+"/"+thread.channel_id+"/"+thread.id+"/"+clientId+"."+ext : "";
    if(!uuid(clientId) || text.length>4000 || (!isMedia && !text) ||
      (isMedia && (!mimeAllowed || !name || mediaPath!==expectedMediaPath ||
        !Number.isSafeInteger(fileSize) || fileSize<1 || fileSize>limits[kind])) ||
      !/^[0-9]{5,20}@(s\.whatsapp\.net|lid)$/.test(thread.chat_jid))
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
        organization_id:org,channel_id:thread.channel_id,account_phone:thread.account_phone,conversation_id:thread.id,
        provider_message_id:messageId,direction:"outgoing",message_type:isMedia?kind:"text",
        body_text:text,sender_name:senderName,sent_at:now,delivery_status:"sent",
        media_path:isMedia?mediaPath:null,media_name:isMedia?name:null,media_mime:isMedia?mime:null,
      },{onConflict:"channel_id,account_phone,provider_message_id",ignoreDuplicates:true})
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
          .eq("channel_id",thread.channel_id).eq("account_phone",thread.account_phone).eq("provider_message_id",messageId)
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
