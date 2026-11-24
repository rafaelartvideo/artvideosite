import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { mergeFetchedHistoryPages,timestampMicros } from "./history-merge.mjs";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const packageKey=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{20}$/.test(v);
const phone=(v:unknown)=>typeof v==="string"&&/^[1-9][0-9]{9,14}$/.test(v);
const key=(legacy:string,modern:string)=>{
  const value=Deno.env.get(legacy);if(value)return value;
  try{const keys=JSON.parse(Deno.env.get(modern)||"{}");return String(keys.default||Object.values(keys)[0]||"")}catch{return ""}
};
async function bridge(input:Record<string,unknown>){
  const endpoint=new URL(Deno.env.get("UNION_HISTORY_GATEWAY_URL")||"");
  const secret=Deno.env.get("UNION_HISTORY_GATEWAY_SECRET")||"";
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||endpoint.pathname!=="/history-import"||secret.length<32)throw Error("Gateway indisponível.");
  const body=JSON.stringify(input),ts=String(Date.now()),nonce=crypto.randomUUID(),encoder=new TextEncoder();
  const hmac=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",hmac,encoder.encode(ts+"."+nonce+"."+body)))).map(v=>v.toString(16).padStart(2,"0")).join("");
  const response=await fetch(endpoint,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json","X-Union-Timestamp":ts,"X-Union-Nonce":nonce,"X-Union-Signature":sig},body,signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error("Gateway indisponível ou operação recusada.");
  const data=await response.json();
  if(data.success!==true)throw Error("Operação não confirmada.");
  return data.result;
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({success:false,error:"Método inválido."},405);
  const bearer=req.headers.get("Authorization")||"";
  if(!bearer.startsWith("Bearer "))return json({success:false,error:"Sessão necessária."},401);
  try{
    const raw=await req.text();
    if(raw.length>8192)return json({success:false,error:"Requisição inválida."},413);
    const b=JSON.parse(raw),org=b.organization_id;
    if(!uuid(org))return json({success:false,error:"Empresa inválida."},400);
    const url=Deno.env.get("SUPABASE_URL")||"";
    const scoped=createClient(url,key("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS"),{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,key("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:auth,error:authError}=await scoped.auth.getUser();
    if(authError||!auth.user)return json({success:false,error:"Sessão expirada."},401);
    // Historical reads use the exact live conversation RLS, NOT management permissions.
    // The request cannot select a contact, destination phone or archived package.
    if(b.action==="history_page"||b.action==="conversation_page"||b.action==="media_ticket"){
      const unified=b.action==="conversation_page",mediaTicket=b.action==="media_ticket";
      if(mediaTicket&&(typeof b.asset_id!=="string"||!/^[a-f0-9]{64}$/.test(b.asset_id)))return json({success:false,error:"Anexo inválido."},400);
      const kind=b.kind??"messages",limit=b.limit??60,before=b.before??null,protocolId=b.protocol_id??null,category=b.category??null;
      if(!uuid(b.conversation_id)||!uuid(b.channel_id)||!phone(b.account_phone)||!["messages","protocols","shared"].includes(kind)||(kind==="shared"&&!["media","documents","links"].includes(category))||!Number.isSafeInteger(limit)||limit<1||limit>100||(protocolId!==null&&!uuid(protocolId))||(kind!=="messages"&&protocolId!==null)||(before!==null&&(!uuid(before.id)||typeof before.sent_at!=="string"||before.sent_at.length>40||!Number.isFinite(Date.parse(before.sent_at)))))return json({success:false,error:"Página inválida."},400);
      if(before!==null){try{timestampMicros(before.sent_at)}catch{return json({success:false,error:"Cursor inválido."},400)}}
      // Contacts with no operational conversation are readable only by the
      // import managers. Never use this route to bypass an existing thread's RLS.
      if(b.contact_only===true){
        const {data:permissions,error:permissionError}=await scoped.rpc("my_organization_permissions",{p_organization_id:org});
        const has=(key:string)=>!permissionError&&Array.isArray(permissions)&&permissions.some((r:Record<string,unknown>)=>r.permission_key===key);
        if(!has("whatsapp.history_import.view")||!has("whatsapp.history_import.manage")||unified)return json({success:false,error:"Acesso restrito."},403);
        const {data:contact,error:contactError}=await admin.from("union_whatsapp_contacts").select("id,organization_id,channel_id,account_phone,chat_jid,contact_phone").eq("id",b.conversation_id).eq("organization_id",org).eq("channel_id",b.channel_id).eq("account_phone",b.account_phone).maybeSingle();
        if(contactError||!contact||!phone(contact.contact_phone)||contact.chat_jid!==contact.contact_phone+"@s.whatsapp.net")return json({success:false,error:"Contato indisponível."},404);
        const threadExists=async()=>{
          const {data,error}=await admin.from("union_whatsapp_conversations").select("id").eq("organization_id",org).eq("account_phone",contact.account_phone).or(`contact_phone.eq.${contact.contact_phone},chat_jid.eq.${contact.chat_jid}`).limit(1);
          if(error)throw Error("Identidade indisponível.");return Boolean(data?.length);
        };
        if(await threadExists())return json({success:false,error:"Consulte o histórico pela conversa."},403);
        const {data:matches,error:matchError}=await admin.from("union_whatsapp_contacts").select("id").eq("organization_id",org).eq("account_phone",contact.account_phone).eq("contact_phone",contact.contact_phone).limit(2);
        if(matchError||matches?.length!==1||matches[0].id!==contact.id)return json({success:false,error:"Identidade exige revisão."},409);
        const scope={organizationId:org,accountPhone:contact.account_phone,contactId:contact.id,contactPhone:contact.contact_phone,conversationId:contact.id};
        const result=mediaTicket?await bridge({action:"media_ticket",...scope,assetId:b.asset_id,download:b.download===true}):await bridge({action:"history_page",...scope,kind,category,protocolId,before,limit});
        if(await threadExists())return json({success:false,error:"Consulte o histórico pela conversa."},403);
        if(mediaTicket){
          if(typeof result?.token!=="string"||!/^[a-f0-9]{64}$/.test(result.token)||!Number.isFinite(Date.parse(result.expires_at)))throw Error("Anexo indisponível.");
          const mediaUrl=new URL(Deno.env.get("UNION_HISTORY_GATEWAY_URL")||"");
          mediaUrl.search="";mediaUrl.searchParams.set("media",result.token);
          return json({success:true,result:{url:mediaUrl.toString(),expires_at:result.expires_at}});
        }
        return json({success:true,result});
      }
      const {data:visibleThread,error:threadError}=await scoped.from("union_whatsapp_conversations")
        .select("id,organization_id,channel_id,account_phone,chat_jid,contact_phone")
        .eq("id",b.conversation_id).eq("organization_id",org)
        .eq("channel_id",b.channel_id).eq("account_phone",b.account_phone).maybeSingle();
      if(threadError||!visibleThread)return json({success:false,error:"Conversa indisponível."},403);
      const thread=visibleThread;
      const empty={items:[],hasMore:false,nextCursor:null};
      async function currentPage(){
        if(kind==="protocols"){
          let q=scoped.from("union_whatsapp_protocols").select("id,conversation_id,protocol_number,status,assigned_to,department_id,opened_at,assigned_at,closed_at,first_reply_at,message_count,opened_by,closed_by")
            .eq("organization_id",thread.organization_id).eq("channel_id",thread.channel_id).eq("account_phone",thread.account_phone).eq("conversation_id",thread.id);
          if(before)q=q.or(`opened_at.lt.${before.sent_at},and(opened_at.eq.${before.sent_at},id.lt.${before.id})`);
          const {data,error}=await q.order("opened_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1);
          if(error)throw Error("Atendimentos indisponíveis.");
          const rows=data||[];return {items:rows.slice(0,limit).map(r=>({...r,sent_at:r.opened_at})),hasMore:rows.length>limit};
        }
        let q=scoped.from("union_whatsapp_messages")
          .select("id,organization_id,conversation_id,protocol_id,provider_message_id,direction,message_type,body_text,sender_name,sent_at,delivery_status,media_path,media_name,media_mime,media_available,reply_to_provider_message_id,reply_to_text,reply_to_message_type,reply_to_direction")
          .eq("organization_id",thread.organization_id).eq("channel_id",thread.channel_id).eq("account_phone",thread.account_phone).eq("conversation_id",thread.id);
        if(protocolId)q=q.eq("protocol_id",protocolId);
        if(kind==="shared"){
          if(category==="media")q=q.in("message_type",["image","video","sticker","audio"]);
          else if(category==="documents")q=q.eq("message_type","file");
          else q=q.eq("message_type","text").or("body_text.ilike.%http%,body_text.ilike.%www.%");
        }
        if(before)q=q.or(`sent_at.lt.${before.sent_at},and(sent_at.eq.${before.sent_at},id.lt.${before.id})`);
        const {data,error}=await q.order("sent_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1);
        if(error)throw Error("Mensagens indisponíveis.");
        const rows=data||[];
        return {items:rows.slice(0,limit),hasMore:rows.length>limit};
      }
      async function finishPage(archive:typeof empty|{items:Record<string,unknown>[];hasMore:boolean;nextCursor:unknown}){
        if(!unified)return archive;
        const page=kind==="protocols"?{...archive,items:archive.items.map((r:Record<string,unknown>)=>({...r,sent_at:r.opened_at||"1970-01-01T00:00:00.000Z",read_only:true}))}:archive;
        return mergeFetchedHistoryPages(await currentPage(),page,before,limit);
      }
      // LIDs, groups, ambiguous or changed identities must not be guessed.
      if(!phone(thread.contact_phone)||thread.chat_jid!==thread.contact_phone+"@s.whatsapp.net")return mediaTicket?json({success:false,error:"Anexo indisponível."},404):json({success:true,result:await finishPage(empty)});
      // Contacts are private backend data. Only resolve AFTER scoped conversation authorization.
      const {data:matches,error:matchError}=await admin.from("union_whatsapp_contacts").select("id,channel_id,chat_jid,contact_phone")
        .eq("organization_id",thread.organization_id).eq("account_phone",thread.account_phone)
        .eq("contact_phone",thread.contact_phone).limit(2);
      if(matchError)throw Error("Identidade indisponível.");
      if(!matches||matches.length!==1||matches[0].chat_jid!==thread.chat_jid||matches[0].channel_id!==thread.channel_id)return mediaTicket?json({success:false,error:"Anexo indisponível."},404):json({success:true,result:await finishPage(empty)});
      const scope={organizationId:thread.organization_id,accountPhone:thread.account_phone,contactId:matches[0].id,contactPhone:thread.contact_phone,conversationId:thread.id};
      const result=mediaTicket?await bridge({action:"media_ticket",...scope,assetId:b.asset_id,download:b.download===true}):await bridge({action:"history_page",...scope,kind,category,protocolId,before,limit});
      const page=mediaTicket?null:await finishPage(result);
      // Recheck visibility at delivery time (the conversation may have been reassigned).
      const {data:stillVisible,error:visibilityError}=await scoped.from("union_whatsapp_conversations")
        .select("id").eq("id",thread.id).eq("organization_id",thread.organization_id)
        .eq("channel_id",thread.channel_id).eq("account_phone",thread.account_phone)
        .eq("chat_jid",thread.chat_jid).eq("contact_phone",thread.contact_phone).maybeSingle();
      if(visibilityError||!stillVisible)return json({success:false,error:"Conversa indisponível."},403);
      if(mediaTicket){
        if(typeof result?.token!=="string"||!/^[a-f0-9]{64}$/.test(result.token)||!Number.isFinite(Date.parse(result.expires_at)))throw Error("Anexo indisponível.");
        const mediaUrl=new URL(Deno.env.get("UNION_HISTORY_GATEWAY_URL")||"");
        mediaUrl.search="";mediaUrl.searchParams.set("media",result.token);
        return json({success:true,result:{url:mediaUrl.toString(),expires_at:result.expires_at}});
      }
      return json({success:true,result:page});
    }
    const {data:permissions,error:permissionError}=await scoped.rpc("my_organization_permissions",{p_organization_id:org});
    const has=(permission:string)=>!permissionError&&Array.isArray(permissions)&&permissions.some((r:Record<string,unknown>)=>r.permission_key===permission);
    const actor=auth.user.id;
    if(b.action==="grant"||b.action==="platform_companies"||b.action==="platform_list"){
      const {data:platform,error}=await admin.rpc("platform_operator_organization_id");
      if(error||platform!==org||!has("platform.management.manage"))return json({success:false,error:"Acesso reservado à administração Union."},403);
      if(b.action==="platform_companies"){
        const {data,error}=await admin.from("organizations").select("id,name").eq("status","active").neq("id",org).order("name").limit(200);
        if(error)throw Error("Empresas indisponíveis.");return json({success:true,result:data||[]});
      }
      if(!uuid(b.target_organization_id)||b.target_organization_id===org||(b.action==="grant"&&!packageKey(b.package_id)))return json({success:false,error:"Destino ou pacote inválido."},400);
      const {data:target,error:targetError}=await admin.from("organizations").select("id").eq("id",b.target_organization_id).eq("status","active").maybeSingle();
      if(targetError||!target)return json({success:false,error:"Empresa indisponível."},404);
      if(b.action==="platform_list")return json({success:true,result:await bridge({action:"list",organizationId:target.id})});
      return json({success:true,result:await bridge({action:"grant",organizationId:target.id,packageId:b.package_id,actor})});
    }
    const prefix="whatsapp.history_import.";
    if(!has(prefix+"view"))return json({success:false,error:"Sem permissão de visualizar importações."},403);
    if(b.action==="list"){
      const {data:channels,error}=await admin.from("whatsapp_channel_connections").select("id,display_name,phone,state").eq("organization_id",org).eq("provider","wuzapi").eq("state","connected").limit(100);
      if(error)throw Error("Canais indisponíveis.");
      return json({success:true,result:{...(await bridge({action:"list",organizationId:org})),accounts:(channels||[]).filter(r=>phone(r.phone))}});
    }
    if(b.action==="prepare"){
      if(!has(prefix+"start"))return json({success:false,error:"Sem permissão de iniciar importações."},403);
      if(!uuid(b.channel_id)||!packageKey(b.package_id))return json({success:false,error:"Selecione o pacote e a conta."},400);
      const {data:channel,error}=await admin.from("whatsapp_channel_connections").select("id,phone,state").eq("organization_id",org).eq("provider","wuzapi").eq("id",b.channel_id).eq("state","connected").maybeSingle();
      if(error||!channel||!phone(channel.phone))return json({success:false,error:"Conta de destino não confirmada."},409);
      return json({success:true,result:await bridge({action:"prepare",organizationId:org,packageId:b.package_id,accountPhone:channel.phone,actor})});
    }
    if(!uuid(b.id))return json({success:false,error:"Importação inválida."},400);
    if(b.action==="candidates"||b.action==="bind_contact"||b.action==="create_contact"){
      // Only authorized managers may see the reconciliation preview or approve a binding.
      if(!has(prefix+"manage"))return json({success:false,error:"Sem permissão de conciliar contatos."},403);
      const preview=await bridge({action:"candidates",id:b.id,organizationId:org});
      if(!phone(preview.account_phone)||!Array.isArray(preview.entries)||preview.entries.length>100)throw Error("Índice inválido.");
      const numbers=[...new Set(preview.entries.filter((e:Record<string,unknown>)=>e.state==="verified"&&phone(e.phone)).map((e:Record<string,unknown>)=>String(e.phone)))];
      const {data:matches,error:matchError}=numbers.length?await admin.from("union_whatsapp_contacts")
        .select("id,contact_phone,chat_jid,display_name")
        .eq("organization_id",org).eq("account_phone",preview.account_phone)
        .in("contact_phone",numbers).limit(1001):{data:[],error:null};
      if(matchError||!matches||matches.length>=1001)throw Error("Conciliação indisponível.");
      const candidates=preview.entries.map((e:Record<string,unknown>)=>{
        const found=matches.filter(m=>m.contact_phone===e.phone);
        // Exact phone JID only: aliases and ambiguous records require individual review.
        const match=found.length===1&&found[0].chat_jid===e.phone+"@s.whatsapp.net"?found[0]:null;
        return {contact_key:e.contact_key,phone:e.phone,historical_name:typeof e.historical_name==="string"?e.historical_name.slice(0,200):"",state:e.state==="review"?"review":e.contact_id?(match?.id===e.contact_id?"bound":"review"):e.state!=="verified"?"review":found.length===0?"missing":match?"candidate":"review",
          match:match?{id:match.id,display_name:match.display_name}:null};
      });
      if(b.action==="candidates")return json({success:true,result:{account_phone:preview.account_phone,entries:candidates}});
      if(b.action==="create_contact"){
        if(b.confirmed!==true||typeof b.contact_key!=="string"||!/^[a-f0-9]{32}$/.test(b.contact_key))return json({success:false,error:"Confirme a criação do contato."},400);
        const entry=candidates.find((e:Record<string,unknown>)=>e.contact_key===b.contact_key);
        if(!entry||entry.state!=="missing"||!phone(entry.phone))return json({success:false,error:"Contato exige revisão."},409);
        const {data:channels,error:channelError}=await admin.from("whatsapp_channel_connections").select("id")
          .eq("organization_id",org).eq("provider","wuzapi").eq("phone",preview.account_phone).eq("state","connected").limit(2);
        if(channelError||channels?.length!==1)return json({success:false,error:"Conta de destino não confirmada."},409);
        const jid=entry.phone+"@s.whatsapp.net";
        const {data:exact,error:exactError}=await admin.from("union_whatsapp_contacts").select("id").eq("organization_id",org).eq("account_phone",preview.account_phone).eq("chat_jid",jid).limit(1);
        const {data:aliases,error:aliasError}=await admin.from("union_whatsapp_verified_jid_aliases").select("phone_jid").eq("organization_id",org).eq("account_phone",preview.account_phone).eq("phone_jid",jid).limit(1);
        if(exactError||aliasError||exact?.length||aliases?.length)return json({success:false,error:"Identidade exige revisão."},409);
        // Only the address book is changed: no new operational thread, protocol,
        // unread counter, network verification or notification is generated.
        const name=String(entry.historical_name||entry.phone).trim().slice(0,160)||entry.phone;
        const {data:created,error:createdError}=await admin.from("union_whatsapp_contacts").insert({organization_id:org,channel_id:channels[0].id,account_phone:preview.account_phone,chat_jid:jid,contact_phone:entry.phone,display_name:name,wuzapi_verified_saved:false}).select("id").single();
        if(createdError||!created)return json({success:false,error:"Cadastro não confirmado; atualize as correspondências."},409);
        // If the second step fails, preserve the newly created contact and expose
        // it as a normal candidate on retry; never delete or overwrite it.
        return json({success:true,result:await bridge({action:"bind_contact",id:b.id,organizationId:org,actor,contactKey:b.contact_key,contactId:created.id,contactPhone:entry.phone,accountPhone:preview.account_phone})});
      }
      if(!uuid(b.contact_id)||typeof b.contact_key!=="string"||!(/^[a-f0-9]{32}$/).test(b.contact_key)||b.confirmed!==true)return json({success:false,error:"Confirme o vínculo individual."},400);
      const entry=candidates.find((e:Record<string,unknown>)=>e.contact_key===b.contact_key);
      if(!entry||!["candidate","bound"].includes(entry.state)||entry.match?.id!==b.contact_id)return json({success:false,error:"Identidade não confirmada ou alterada."},409);
      return json({success:true,result:await bridge({action:"bind_contact",id:b.id,organizationId:org,actor,contactKey:b.contact_key,contactId:b.contact_id,contactPhone:entry.phone,accountPhone:preview.account_phone})});
    }
    if(["status","events"].includes(b.action))return json({success:true,result:await bridge({action:b.action,id:b.id,organizationId:org})});
    if(b.action==="control"){
      const required=b.command==="start"?"start":b.command==="rollback"?"rollback":["pause","resume","cancel"].includes(b.command)?"manage":null;
      if(!required||!has(prefix+required))return json({success:false,error:"Operação não autorizada."},403);
      // Recheck that the original destination remains connected before starting or resuming.
      if(["start","resume"].includes(b.command)){
        const j=await bridge({action:"status",id:b.id,organizationId:org});
        const {data:channel,error}=await admin.from("whatsapp_channel_connections").select("id").eq("organization_id",org).eq("provider","wuzapi").eq("state","connected").eq("phone",j.account_phone).limit(1);
        if(error||!channel?.length)return json({success:false,error:"Reconecte o número original."},409);
      }
      return json({success:true,result:await bridge({action:"control",id:b.id,organizationId:org,command:b.command,actor})});
    }
    return json({success:false,error:"Operação inválida."},400);
  }catch{
    return json({success:false,error:"Serviço de importação indisponível. Nenhuma conclusão pode ser confirmada."},503);
  }
});
