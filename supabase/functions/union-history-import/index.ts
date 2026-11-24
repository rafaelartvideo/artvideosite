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
    if(b.action==="history_page"||b.action==="conversation_page"){
      const unified=b.action==="conversation_page";
      const kind=b.kind??"messages",limit=b.limit??60,before=b.before??null,protocolId=b.protocol_id??null;
      if(!uuid(b.conversation_id)||!uuid(b.channel_id)||!phone(b.account_phone)||!["messages","protocols"].includes(kind)||(unified&&kind!=="messages")||!Number.isSafeInteger(limit)||limit<1||limit>100||(protocolId!==null&&!uuid(protocolId))||(kind==="protocols"&&protocolId!==null)||(before!==null&&(!uuid(before.id)||typeof before.sent_at!=="string"||before.sent_at.length>40||!Number.isFinite(Date.parse(before.sent_at)))))return json({success:false,error:"Página inválida."},400);
      if(before!==null){try{timestampMicros(before.sent_at)}catch{return json({success:false,error:"Cursor inválido."},400)}}
      const {data:thread,error:threadError}=await scoped.from("union_whatsapp_conversations")
        .select("id,organization_id,channel_id,account_phone,chat_jid,contact_phone")
        .eq("id",b.conversation_id).eq("organization_id",org)
        .eq("channel_id",b.channel_id).eq("account_phone",b.account_phone).maybeSingle();
      if(threadError||!thread)return json({success:false,error:"Conversa indisponível."},403);
      const empty={items:[],hasMore:false,nextCursor:null};
      async function currentPage(){
        let q=scoped.from("union_whatsapp_messages")
          .select("id,organization_id,conversation_id,protocol_id,provider_message_id,direction,message_type,body_text,sender_name,sent_at,delivery_status,media_path,media_name,media_mime,media_available,reply_to_provider_message_id,reply_to_text,reply_to_message_type,reply_to_direction")
          .eq("organization_id",thread.organization_id).eq("channel_id",thread.channel_id).eq("account_phone",thread.account_phone).eq("conversation_id",thread.id);
        if(protocolId)q=q.eq("protocol_id",protocolId);
        if(before)q=q.or(`sent_at.lt.${before.sent_at},and(sent_at.eq.${before.sent_at},id.lt.${before.id})`);
        const {data,error}=await q.order("sent_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1);
        if(error)throw Error("Mensagens indisponíveis.");
        const rows=data||[];
        return {items:rows.slice(0,limit),hasMore:rows.length>limit};
      }
      async function finishPage(archive:typeof empty|{items:Record<string,unknown>[];hasMore:boolean;nextCursor:unknown}){
        if(!unified)return archive;
        return mergeFetchedHistoryPages(await currentPage(),archive,before,limit);
      }
      // LIDs, groups, ambiguous or changed identities must not be guessed.
      if(!phone(thread.contact_phone)||thread.chat_jid!==thread.contact_phone+"@s.whatsapp.net")return json({success:true,result:await finishPage(empty)});
      // Contacts are private backend data. Only resolve AFTER scoped conversation authorization.
      const {data:matches,error:matchError}=await admin.from("union_whatsapp_contacts").select("id,channel_id,chat_jid,contact_phone")
        .eq("organization_id",thread.organization_id).eq("account_phone",thread.account_phone)
        .eq("contact_phone",thread.contact_phone).limit(2);
      if(matchError)throw Error("Identidade indisponível.");
      if(!matches||matches.length!==1||matches[0].chat_jid!==thread.chat_jid||matches[0].channel_id!==thread.channel_id)return json({success:true,result:await finishPage(empty)});
      const result=await bridge({action:"history_page",organizationId:thread.organization_id,accountPhone:thread.account_phone,contactId:matches[0].id,contactPhone:thread.contact_phone,conversationId:thread.id,kind,protocolId,before,limit});
      const page=await finishPage(result);
      // Recheck visibility at delivery time (the conversation may have been reassigned).
      const {data:stillVisible,error:visibilityError}=await scoped.from("union_whatsapp_conversations")
        .select("id").eq("id",thread.id).eq("organization_id",thread.organization_id)
        .eq("channel_id",thread.channel_id).eq("account_phone",thread.account_phone)
        .eq("chat_jid",thread.chat_jid).eq("contact_phone",thread.contact_phone).maybeSingle();
      if(visibilityError||!stillVisible)return json({success:false,error:"Conversa indisponível."},403);
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
    if(b.action==="candidates"||b.action==="bind_contact"){
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
