import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Convites e OTP sao separados do WhatsApp Atendimentos; nunca retornar/logar codigos.
const baseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const bridgeUrl = Deno.env.get("UNION_WUZAPI_BRIDGE_URL") || "";
const bridgeSecret = Deno.env.get("UNION_WUZAPI_BRIDGE_SECRET") || "";
// Conta e cota da API CPF exclusivas do cadastro do site. Nao reutilizar APICPF_API_KEY do CRM.
const siteCpfApiKey = Deno.env.get("APICPF_SITE_API_KEY") || "";
const encoder = new TextEncoder();
const origins = new Set([
  "https://eletronicaartvideo.com.br",
  "https://www.eletronicaartvideo.com.br",
  "https://unionworld.com.br",
  "https://www.unionworld.com.br",
]);
const uuid = (x: unknown) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(x||""));
const cpfDigits = (x: unknown) => String(x||"").replace(/\D/g,"");
function validCpf(value:unknown) {
  const c=cpfDigits(value);
  if(!/^\d{11}$/.test(c)||/^(\d)\1{10}$/.test(c))return false;
  for(let i=9;i<11;i++){
    let sum=0;for(let j=0;j<i;j++)sum+=Number(c[j])*(i+1-j);
    if((sum*10)%11%10!==Number(c[i]))return false;
  }
  return true;
}
const bytesHex = (x: ArrayBuffer) => Array.from(new Uint8Array(x)).map(n=>n.toString(16).padStart(2,"0")).join("");
const sha256 = async (x: string) => bytesHex(await crypto.subtle.digest("SHA-256",encoder.encode(x)));
const hmac = async (x: string) => {
  const key=await crypto.subtle.importKey("raw",encoder.encode(bridgeSecret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return bytesHex(await crypto.subtle.sign("HMAC",key,encoder.encode("artvideo-customer-otp:v1:"+x)));
};
const safeEqual=(a:string,b:string)=>{
  if(a.length!==b.length)return false;
  let difference=0;
  for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
};
const randomString=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,"0")).join("");
const newCode=()=>{
  const random=new Uint32Array(1);
  crypto.getRandomValues(random);
  // Rejection sampling evita vies de modulo.
  const cutoff=Math.floor(4294967296/1_000_000)*1_000_000;
  while(random[0]>=cutoff)crypto.getRandomValues(random);
  return String(random[0]%1_000_000).padStart(6,"0");
};
const normalizePhone=(s:unknown)=>{
  let n=cpfDigits(s);
  if(!n.startsWith("55"))n="55"+n;
  return /^55[1-9][0-9][0-9]{8,9}$/.test(n)?n:"";
};
const maskedPhone=(phone:string)=>phone.length>=12 ? "("+phone.slice(2,4)+") *****-"+phone.slice(-4) : "WhatsApp cadastrado";
const fail=(error:string,status=400)=>({success:false,error,status});
function corsHeaders(req:Request) {
  const origin=req.headers.get("Origin")||"";
  return {
    "Access-Control-Allow-Origin":origins.has(origin)?origin:"https://eletronicaartvideo.com.br",
    "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Vary":"Origin","Cache-Control":"no-store",
  };
}
function response(req:Request,body:Record<string,unknown>,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(req),"Content-Type":"application/json; charset=utf-8"}});
}
const admin=createClient(baseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const scoped=(req:Request)=>createClient(baseUrl,anonKey,{global:{headers:{Authorization:req.headers.get("Authorization")||""}},auth:{persistSession:false,autoRefreshToken:false}});
async function organizationId(){
  const {data,error}=await admin.rpc("artvideo_organization_id");
  if(error||!data)throw Error("tenant_unavailable");
  return String(data);
}
async function staff(req:Request,org:string){
  const caller=scoped(req);
  const {data,error}=await caller.auth.getUser();
  if(error||!data.user)return null;
  const {data:membership,error:membershipError}=await admin.from("organization_members")
    .select("status").eq("organization_id",org).eq("user_id",data.user.id).eq("status","active").maybeSingle();
  if(membershipError||!membership)return null;
  const {data:rows,error:permissionError}=await caller.rpc("my_organization_permissions",{p_organization_id:org});
  if(permissionError)return null;
  const keys=new Set((Array.isArray(rows)?rows:[]).map((x:Record<string,unknown>)=>String(x.permission_key||"")));
  if(!keys.has("customers.edit"))return null;
  return data.user.id;
}
async function limit(purpose:string,identity:string,max=8,seconds=3600){
  const key=await hmac("limit:"+purpose+":"+identity);
  const {data,error}=await admin.rpc("artvideo_customer_access_rate_limit_v1",{
    p_key:key,p_limit:max,p_seconds:seconds,
  });
  if(error||data!==true)throw Error("limit_exceeded");
}

async function siteCpfEnforced() {
  const {data,error}=await admin.rpc("artvideo_site_cpf_enforcement_v1");
  if(error)throw Error("cpf_validation_unavailable");
  return data===true;
}
async function siteCpfTicketValid(ticket:unknown,cpf:string,name:string){
  if(!uuid(ticket)||!validCpf(cpf)||name.trim().split(/\s+/).length<2)return false;
  const {data,error}=await admin.rpc("artvideo_site_cpf_check_v1",{
    p_token:String(ticket),p_cpf:cpf,p_name:name,
  });
  if(error)throw Error("cpf_validation_unavailable");
  return data===true;
}
async function siteCpfTicketConsume(ticket:unknown,cpf:string,name:string,userId:string){
  if(!uuid(ticket))return false;
  const {data,error}=await admin.rpc("artvideo_site_cpf_consume_v1",{
    p_token:String(ticket),p_cpf:cpf,p_name:name,p_user_id:userId,
  });
  if(error)throw Error("cpf_validation_unavailable");
  return data===true;
}
async function verifySiteCpfWithProvider(cpf:string){
  if(!siteCpfApiKey)throw Error("cpf_validation_unavailable");
  // Limites da conta separada: teto abaixo de 6/min e 100/dia.
  // Cada chamada consome a cota somente depois de validar os campos localmente.
  await limit("site-cpf-per-cpf",cpf,5,86400);
  await limit("site-cpf-global-minute","site",5,60);
  await limit("site-cpf-global-day","site",90,86400);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),9000);
  try {
    const res=await fetch("https://apicpf.com/api/consulta?cpf="+encodeURIComponent(cpf),{
      method:"GET",headers:{"X-API-KEY":siteCpfApiKey,Accept:"application/json"},
      signal:controller.signal,
    });
    if(res.status===404)throw Error("cpf_not_found");
    if(res.status===429)throw Error("cpf_quota_exceeded");
    if(!res.ok)throw Error("cpf_validation_unavailable");
    const payload=await res.json().catch(()=>null) as {data?:{nome?:unknown}}|null;
    const name=typeof payload?.data?.nome==="string"?payload.data.nome.trim():"";
    if(!name)throw Error("cpf_validation_unavailable");
    return name;
  } catch(e) {
    if(e instanceof Error && ["cpf_not_found","cpf_quota_exceeded"].includes(e.message))throw e;
    throw Error("cpf_validation_unavailable");
  } finally {clearTimeout(timeout);}
}

async function bridge(channel:{id:string;organization_id:string},action:"number_check"|"send_text",phone:string,jid="",message=""){
  const url=new URL(bridgeUrl);
  if(url.protocol!=="https:"||url.username||url.password||bridgeSecret.length<32)throw Error("bridge_unavailable");
  const payload=JSON.stringify({
    action,connection_id:channel.id,organization_id:channel.organization_id,
    chat_jid:jid,body_text:action==="number_check"?phone:message,
    client_message_id:crypto.randomUUID(),
  });
  const timestamp=String(Date.now()),nonce=crypto.randomUUID();
  const key=await crypto.subtle.importKey("raw",encoder.encode(bridgeSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=bytesHex(await crypto.subtle.sign("HMAC",key,encoder.encode(timestamp+"."+nonce+"."+payload)));
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),14000);
  try {
    const res=await fetch(url,{method:"POST",headers:{
      "Content-Type":"application/json","X-Union-Timestamp":timestamp,
      "X-Union-Nonce":nonce,"X-Union-Signature":signature,
    },body:payload,signal:controller.signal});
    const data=await res.json().catch(()=>({})) as Record<string,unknown>;
    if(!res.ok||data.ok!==true)throw Error("bridge_failed");
    return data;
  } finally {clearTimeout(timeout);}
}
async function activeChannel(org:string){
  const {data,error}=await admin.from("whatsapp_channel_connections")
    .select("id,organization_id,phone").eq("organization_id",org)
    .eq("provider","wuzapi").eq("state","connected").eq("webhook_ready",true).limit(2);
  if(error||!data?.length||data.length!==1)throw Error("channel_unavailable");
  return data[0];
}
async function verifiedJid(channel:{id:string;organization_id:string},phone:string){
  const data=await bridge(channel,"number_check",phone);
  if(data.status!=="verified"||!Array.isArray(data.matches))throw Error("number_unavailable");
  const entries=data.matches.filter((entry:unknown)=>{
    if(!entry||typeof entry!=="object")return false;
    const e=entry as Record<string,unknown>;
    return typeof e.phone==="string"&&/^55[1-9][0-9][0-9]{8,9}$/.test(e.phone)
      &&typeof e.jid==="string"&&/^(?:[0-9]{5,20}@lid|55[1-9][0-9][0-9]{8,9}@s\.whatsapp\.net)$/.test(e.jid);
  }) as Array<{phone:string;jid:string;query?:string}>;
  const exact=entries.find(e=>e.query===phone);
  const match=data.distinct_identities===true?exact:(exact||entries[0]);
  if(!match)throw Error("number_unavailable");
  return match.jid;
}
async function sendOtp(channel:{id:string;organization_id:string},jid:string,code:string){
  // Bloco monoespaçado do WhatsApp: permite selecionar/copiar só os 6 dígitos.
  // Não criar um link com o OTP na URL, pois isso exporia o código ao navegador.
  const message="*Artvideo · Código de segurança*\n\n```"+code+"```\n\nVálido por 30 minutos. Não compartilhe este código.";
  const sent=await bridge(channel,"send_text","",jid,message);
  if(typeof sent.provider_message_id!=="string"||!sent.provider_message_id)throw Error("send_unconfirmed");
}
async function createChallenge(org:string,purpose:"activation"|"login"|"registration"|"profile",phone:string,jid:string,inviteId:string|null,accountUserId:string|null){
  const id=crypto.randomUUID(),code=newCode();
  const {error}=await admin.from("artvideo_customer_access_challenges").insert({
    id,organization_id:org,purpose,phone_e164:phone,chat_jid:jid,
    invite_id:inviteId,account_user_id:accountUserId,
    code_digest:await hmac(id+":"+code),
  });
  if(error)throw Error("challenge_create");
  try{
    await sendOtp({id:(await activeChannel(org)).id,organization_id:org},jid,code);
  }catch{
    await admin.from("artvideo_customer_access_challenges").update({status:"locked"}).eq("id",id);
    throw Error("send_failed");
  }
  return id;
}
async function findInvite(org:string,token:string){
  if(!/^[a-f0-9]{64}$/i.test(token))return null;
  const digest=await sha256(token.toLowerCase());
  const {data}=await admin.from("artvideo_customer_access_invites")
    .select("*").eq("organization_id",org).eq("token_digest",digest)
    .eq("status","pending").gt("expires_at",new Date().toISOString()).maybeSingle();
  return data||null;
}
async function linkedAccount(org:string,cpf:string){
  if(!/^\d{11}$/.test(cpf))return null;
  const {data,error}=await admin.from("artvideo_customer_accounts")
    .select("user_id,organization_id,entity_id,cpf,phone,whatsapp_verified_number,whatsapp_verified_at,crm_access_activated_at")
    .eq("organization_id",org).eq("cpf",cpf).limit(3);
  if(error||data?.length!==1)return null;
  const a=data[0];
  if(!a.whatsapp_verified_at||!a.whatsapp_verified_number)return null;
  // Code-based sign-in follows the verified number on the site account.
  // The CRM may hold an older number; history permissions are checked by SQL.
  if(normalizePhone(a.phone)!==a.whatsapp_verified_number)return null;
  return a;
}
// CPF + senha deve funcionar para TODAS as contas do site, inclusive as criadas por e-mail.
// O requisito de WhatsApp validado é exclusivo do método de código de segurança.
async function passwordAccount(org:string,cpf:string){
  if(!/^\d{11}$/.test(cpf))return null;
  const {data,error}=await admin.from("artvideo_customer_accounts")
    .select("user_id").eq("organization_id",org).eq("cpf",cpf).limit(2);
  if(error||data?.length!==1)return null;
  return data[0];
}
async function sessionFor(userId:string){
  const {data:user,error:userError}=await admin.auth.admin.getUserById(userId);
  if(userError||!user.user?.email)throw Error("account_unavailable");
  const {data,error}=await admin.auth.admin.generateLink({type:"magiclink",email:user.user.email});
  if(error||!data.properties?.hashed_token)throw Error("session_unavailable");
  return {token_hash:data.properties.hashed_token,type:"magiclink"};
}


async function portalAssetContext(request:Request,orderId:string){
  const authClient=scoped(request);
  const {data:user,error}=await authClient.auth.getUser();
  if(error||!user.user)throw Error("not_authenticated");
  const {data:details,error:detailError}=await authClient.rpc("artvideo_customer_order_details_v1",{p_order_id:orderId});
  if(detailError||!details?.order?.id)throw Error("not_authorized");
  return details;
}
function decodeBase64(value:string){
  const binary=atob(value);
  return Uint8Array.from(binary,character=>character.charCodeAt(0));
}
async function decryptSignatureToken(secret:string,ciphertext:string,iv:string){
  const hash=await crypto.subtle.digest("SHA-256",encoder.encode(secret));
  const key=await crypto.subtle.importKey("raw",hash,{name:"AES-GCM"},false,["decrypt"]);
  const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:decodeBase64(iv)},
    key,decodeBase64(ciphertext));
  return new TextDecoder().decode(data);
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=="POST")return response(request,fail("Método não permitido.",405),405);
  const origin=request.headers.get("Origin");
  if(origin&&!origins.has(origin))return response(request,fail("Origem não permitida.",403),403);
  if(Number(request.headers.get("content-length")||0)>12000)return response(request,fail("Requisição muito grande.",413),413);
  if(!baseUrl||!serviceKey||!anonKey||!bridgeSecret||!bridgeUrl)return response(request,fail("Serviço de acesso indisponível.",503),503);
  try {
    const body=await request.json() as Record<string,unknown>;
    const action=String(body.action||"");
    const org=await organizationId();
    if(action==="staff_invite"||action==="staff_status"||action==="staff_revoke"){
      const actor=await staff(request,org);
      if(!actor)return response(request,fail("Sem permissão para administrar convites.",403),403);
      const customerId=String(body.customer_id||"");
      if(!uuid(customerId))return response(request,fail("Cliente inválido."),400);
      const {data:customer}=await admin.from("customers").select("id,organization_id,full_name,document,whatsapp,customer_type")
        .eq("id",customerId).eq("organization_id",org).maybeSingle();
      if(!customer)return response(request,fail("Cliente não encontrado.",404),404);
      if(action==="staff_status"){
        // Diagnostico para o funcionario autorizado, sem expor CPF/WhatsApp completo.
        let blocker: {code:string;message:string}|null=null;
        const number=normalizePhone(customer.whatsapp);
        const cpf=cpfDigits(customer.document);
        if(customer.customer_type&&customer.customer_type!=="PF"){
          blocker={code:"customer_type",message:"O acesso por convite está disponível apenas para pessoa física."};
        }else if(cpf.length!==11){
          blocker={code:"missing_cpf",message:"Cadastre um CPF válido para liberar o convite."};
        }else if(!number){
          blocker={code:"missing_whatsapp",message:"Cadastre um WhatsApp válido para liberar o convite."};
        }else{
          const {data:entity,error:entityError}=await admin.from("entities").select("is_active")
            .eq("id",customerId).eq("organization_id",org).maybeSingle();
          if(entityError)throw Error("customer_entity_lookup");
          if(!entity?.is_active){
            blocker={code:"customer_link",message:"O cadastro do cliente está sem vínculo interno ativo. Regularize o cadastro no CRM antes de convidar."};
          }else{
            const {data:shared,error:sharedError}=await admin.rpc("artvideo_customer_has_shared_whatsapp_v1",{
              p_organization_id:org,p_customer_id:customerId,p_phone:number,
            });
            if(sharedError)throw Error("shared_number_lookup");
            if(shared===true){
              blocker={code:"shared_whatsapp",message:"Este número WhatsApp está em mais de um cadastro de cliente. Regularize os números ou confirme um contato exclusivo antes de enviar o convite."};
            }
          }
        }
        const {data:invitations}=await admin.from("artvideo_customer_access_invites")
          .select("id,status,created_at,expires_at,activated_at").eq("organization_id",org)
          .eq("customer_id",customerId).order("created_at",{ascending:false}).limit(1);
        const {data:accounts}=await admin.from("artvideo_customer_accounts")
          .select("whatsapp_verified_at,crm_access_activated_at,whatsapp_verified_number")
          .eq("organization_id",org).eq("entity_id",customerId).limit(1);
        return response(request,{success:true,blocker,invitation:invitations?.[0]||null,
          account:accounts?.[0]?{active:!!accounts[0].crm_access_activated_at,
            whatsapp_verified_at:accounts[0].whatsapp_verified_at,phone_mask:maskedPhone(accounts[0].whatsapp_verified_number||"")}:null});
      }
      if(action==="staff_revoke"){
        await admin.from("artvideo_customer_access_invites").update({status:"revoked",revoked_at:new Date().toISOString()})
          .eq("organization_id",org).eq("customer_id",customerId).eq("status","pending");
        const {error}=await admin.from("artvideo_customer_accounts")
          .update({crm_access_activated_at:null,whatsapp_verified_at:null,whatsapp_verified_number:null,entity_id:null,link_status:"pending_review"})
          .eq("organization_id",org).eq("entity_id",customerId);
        if(error)throw Error("revoke_failed");
        return response(request,{success:true});
      }
      if(customer.customer_type&&customer.customer_type!=="PF")return response(request,fail("Ativação disponível para pessoa física.",400),400);
      const {data:customerEntity}=await admin.from("entities").select("id,is_active")
        .eq("id",customerId).eq("organization_id",org).maybeSingle();
      if(!customerEntity?.is_active)return response(request,fail("Regularize o vínculo do cadastro antes de enviar o convite.",409),409);

      if(cpfDigits(customer.document).length!==11||!customer.whatsapp)
        return response(request,fail("Cadastre CPF e WhatsApp antes do convite.",400),400);
      if(body.identity_confirmed!==true)return response(request,fail("Confirme a identidade do cliente antes de enviar o convite.",400),400);
      const phone=normalizePhone(customer.whatsapp);
      if(!phone)return response(request,fail("WhatsApp do cadastro inválido.",400),400);
      const {data:shared,error:sharedError}=await admin.rpc("artvideo_customer_has_shared_whatsapp_v1",{
        p_organization_id:org,p_customer_id:customerId,p_phone:phone,
      });
      if(sharedError)throw Error("shared_number_lookup");
      if(shared)return response(request,fail("Este WhatsApp está associado a mais de um cliente. Confirme e regularize os cadastros antes de ativar o acesso.",409),409);
      await limit("invite:"+customerId,actor,10,86400);
      const channel=await activeChannel(org),jid=await verifiedJid(channel,phone);
      const token=randomString(),url="https://eletronicaartvideo.com.br/minha-conta/ativar?convite="+token;
      await admin.from("artvideo_customer_access_invites").update({status:"revoked",revoked_at:new Date().toISOString()})
        .eq("organization_id",org).eq("customer_id",customerId).eq("status","pending");
      const {error}=await admin.from("artvideo_customer_access_invites").insert({
        organization_id:org,customer_id:customerId,created_by:actor,
        phone_e164:phone,token_digest:await sha256(token),expires_at:new Date(Date.now()+86400000).toISOString(),
      });
      if(error)throw Error("invite_failed");
      try{
        await bridge(channel,"send_text","",jid,
          "Ola! A Artvideo convidou voce a ativar sua conta e acompanhar seus servicos: "+url+
          "\nEste convite expira em 24 horas. Se voce nao solicitou, ignore.");
      }catch{
        await admin.from("artvideo_customer_access_invites").update({status:"revoked",revoked_at:new Date().toISOString()})
          .eq("token_digest",await sha256(token));
        throw Error("send_failed");
      }
      return response(request,{success:true,link:url,expires_in_minutes:1440,phone_mask:maskedPhone(phone)});
    }
    if(action==="inspect_invite"){
      const invitation=await findInvite(org,String(body.token||""));
      if(!invitation)return response(request,fail("Convite inválido ou expirado.",404),404);
      return response(request,{success:true,phone_mask:maskedPhone(invitation.phone_e164)});
    }
    if(action==="activation_send"){
      const invite=await findInvite(org,String(body.token||""));
      if(!invite)return response(request,fail("Convite inválido ou expirado.",404),404);
      await limit("otp-send:"+invite.phone_e164,invite.id,8,3600);
      const channel=await activeChannel(org);
      const jid=await verifiedJid(channel,invite.phone_e164);
      const id=await createChallenge(org,"activation",invite.phone_e164,jid,invite.id,null);
      return response(request,{success:true,challenge_id:id,expires_in_seconds:1800,resend_in_seconds:60});
    }
    if(action==="password_reset_email"){
      const cpf=cpfDigits(body.cpf);
      if(cpf.length!==11)return response(request,fail("Informe um CPF válido.",400),400);
      await limit("password-reset-email",cpf,5,3600);
      const account=await passwordAccount(org,cpf);
      if(account){
        const {data:user}=await admin.auth.admin.getUserById(account.user_id);
        if(user?.user?.email){
          // Nunca informar se o CPF/e-mail existe. A senha será alterada somente
          // por meio de link de recuperação validado pelo próprio Supabase Auth.
          await admin.auth.resetPasswordForEmail(user.user.email,{
            redirectTo:"https://eletronicaartvideo.com.br/minha-conta?recovery=1",
          });
        }
      }
      return response(request,{success:true});
    }

    if(action==="registration_identity"){
      const cpf=cpfDigits(body.cpf),name=String(body.name||"").trim().replace(/\s+/g," ");
      const enforced=await siteCpfEnforced();
      if(!enforced)return response(request,{success:true,required:false});
      if(!validCpf(cpf)||name.length<5||name.length>120||name.split(" ").length<2)
        return response(request,fail("Informe um CPF válido e o nome completo.",400),400);
      const providerName=await verifySiteCpfWithProvider(cpf);
      const {data,error}=await admin.rpc("artvideo_site_cpf_issue_v1",{
        p_cpf:cpf,p_name:name,p_provider_name:providerName,
      });
      if(error)throw Error("cpf_validation_unavailable");
      if(data?.verified!==true||!uuid(data?.ticket))
        return response(request,fail("O nome completo informado não corresponde ao CPF consultado. Confira os dados.",422),422);
      // Nao devolver o nome obtido do provedor nem registrar CPF ou resposta em logs.
      return response(request,{success:true,required:true,ticket:data.ticket});
    }
    if(action==="registration_send"){
      const phone=normalizePhone(body.phone);
      if(!phone)return response(request,fail("Informe um WhatsApp com DDD válido.",400),400);
      if(await siteCpfEnforced()){
        const cpf=cpfDigits(body.cpf),name=String(body.name||"").trim();
        if(!await siteCpfTicketValid(body.site_cpf_ticket,cpf,name))
          return response(request,fail("Valide o nome completo e o CPF antes de prosseguir.",422),422);
      }
      await limit("registration-send",phone,5,3600);
      const channel=await activeChannel(org);
      const jid=await verifiedJid(channel,phone);
      const id=await createChallenge(org,"registration",phone,jid,null,null);
      return response(request,{success:true,challenge_id:id,expires_in_seconds:1800,resend_in_seconds:60});
    }
    if(action==="profile_send"){
      const {data:viewer,error:authError}=await scoped(request).auth.getUser();
      if(authError||!viewer.user)return response(request,fail("Entre na sua conta.",401),401);
      const {data:account,error:accountError}=await admin.from("artvideo_customer_accounts")
        .select("phone,whatsapp_verified_at,whatsapp_verified_number")
        .eq("organization_id",org).eq("user_id",viewer.user.id).maybeSingle();
      if(accountError||!account)return response(request,fail("Conta de cliente indisponível.",404),404);
      const phone=normalizePhone(account.phone);
      if(!phone)return response(request,fail("Atualize seu WhatsApp antes de verificar.",400),400);
      if(account.whatsapp_verified_at&&account.whatsapp_verified_number===phone)
        return response(request,{success:true,already_verified:true});
      await limit("profile-send",viewer.user.id,5,3600);
      const channel=await activeChannel(org),jid=await verifiedJid(channel,phone);
      const id=await createChallenge(org,"profile",phone,jid,null,viewer.user.id);
      return response(request,{success:true,challenge_id:id,expires_in_seconds:1800,resend_in_seconds:60});
    }
    if(action==="profile_verify"){
      const {data:viewer,error:authError}=await scoped(request).auth.getUser();
      if(authError||!viewer.user)return response(request,fail("Entre na sua conta.",401),401);
      const challengeId=String(body.challenge_id||""),code=String(body.code||"");
      if(!uuid(challengeId)||!/^[0-9]{6}$/.test(code))
        return response(request,fail("Código inválido.",400),400);
      await limit("profile-verify",viewer.user.id,12,3600);
      const {data:c}=await admin.from("artvideo_customer_access_challenges").select("*")
        .eq("id",challengeId).eq("organization_id",org).eq("purpose","profile")
        .eq("account_user_id",viewer.user.id).eq("status","pending")
        .gt("expires_at",new Date().toISOString()).maybeSingle();
      if(!c||c.attempts>=5)return response(request,fail("Código expirado ou bloqueado.",410),410);
      const {data:account}=await admin.from("artvideo_customer_accounts").select("phone")
        .eq("organization_id",org).eq("user_id",viewer.user.id).maybeSingle();
      if(!account||normalizePhone(account.phone)!==c.phone_e164)
        return response(request,fail("Número alterado. Solicite um novo código.",409),409);
      if(!safeEqual(c.code_digest,await hmac(c.id+":"+code))){
        await admin.from("artvideo_customer_access_challenges").update({
          attempts:c.attempts+1,status:c.attempts>=4?"locked":"pending",
        }).eq("id",c.id).eq("status","pending").eq("attempts",c.attempts);
        return response(request,fail("Código incorreto.",401),401);
      }
      const {data:consumed}=await admin.from("artvideo_customer_access_challenges")
        .update({status:"consumed",consumed_at:new Date().toISOString()})
        .eq("id",c.id).eq("status","pending").eq("code_digest",c.code_digest)
        .select("id").maybeSingle();
      if(!consumed)return response(request,fail("Código já utilizado.",410),410);
      const {data:saved,error:saveError}=await admin.from("artvideo_customer_accounts")
        .update({whatsapp_verified_at:new Date().toISOString(),whatsapp_verified_number:c.phone_e164})
        .eq("organization_id",org).eq("user_id",viewer.user.id).eq("phone",account.phone)
        .select("user_id").maybeSingle();
      if(saveError||!saved)return response(request,fail("Não foi possível confirmar o WhatsApp.",409),409);
      return response(request,{success:true,verified:true});
    }
    if(action==="login_send"){
      const cpf=cpfDigits(body.cpf);
      if(cpf.length!==11)return response(request,fail("Informe um CPF válido.",400),400);
      await limit("login-send",cpf,8,3600);
      const account=await linkedAccount(org,cpf);
      if(!account)return response(request,{success:true,challenge_id:crypto.randomUUID(),expires_in_seconds:1800,resend_in_seconds:60});
      const channel=await activeChannel(org),jid=await verifiedJid(channel,account.whatsapp_verified_number);
      const id=await createChallenge(org,"login",account.whatsapp_verified_number,jid,null,account.user_id);
      return response(request,{success:true,challenge_id:id,expires_in_seconds:1800,resend_in_seconds:60});
    }
    if(action==="registration_verify"){
      const challengeId=String(body.challenge_id||""),code=String(body.code||"");
      const cpf=cpfDigits(body.cpf),name=String(body.name||"").trim().replace(/\s+/g," ");
      const phone=normalizePhone(body.phone),password=String(body.password||"");
      if(!uuid(challengeId)||!/^\d{6}$/.test(code)||!validCpf(cpf)||
         name.length<3||name.length>120||password.length<8||password.length>128||!phone)
        return response(request,fail("Confira os dados obrigatórios.",400),400);
      await limit("registration-verify",challengeId,12,3600);
      const {data:c}=await admin.from("artvideo_customer_access_challenges").select("*")
        .eq("id",challengeId).eq("organization_id",org).eq("purpose","registration")
        .eq("status","pending").gt("expires_at",new Date().toISOString()).maybeSingle();
      if(!c||c.attempts>=5||c.phone_e164!==phone)return response(request,fail("Código expirado ou inválido.",410),410);
      if(!safeEqual(c.code_digest,await hmac(c.id+":"+code))){
        await admin.from("artvideo_customer_access_challenges").update({
          attempts:c.attempts+1,status:c.attempts>=4?"locked":"pending",
        }).eq("id",c.id).eq("status","pending").eq("attempts",c.attempts);
        return response(request,fail("Código incorreto.",401),401);
      }
      const cpfRequired=await siteCpfEnforced();
      if(cpfRequired&&!await siteCpfTicketValid(body.site_cpf_ticket,cpf,name))
        return response(request,fail("A validação de CPF expirou. Volte e confira os dados.",422),422);
      const {data:prior,error:lookupError}=await admin.from("artvideo_customer_accounts")
        .select("user_id").eq("organization_id",org).eq("cpf",cpf).limit(1);
      if(lookupError)throw Error("account_lookup_failed");
      if(prior?.length)return response(request,fail("CPF já cadastrado. Entre na conta ou recupere sua senha.",409),409);
      const {data:consumed}=await admin.from("artvideo_customer_access_challenges")
        .update({status:"consumed",consumed_at:new Date().toISOString()})
        .eq("id",c.id).eq("status","pending").eq("code_digest",c.code_digest)
        .select("id").maybeSingle();
      if(!consumed)return response(request,fail("Código já utilizado.",410),410);
      // Credencial técnica interna, como nos convites. O cliente acessa pelo CPF.
      const internalId=crypto.randomUUID();
      const {data:user,error:createError}=await admin.auth.admin.createUser({
        email:"cliente-"+internalId+"@auth.unionworld.app",password,email_confirm:true,
        user_metadata:{registration_origin:"artvideo_customer",full_name:name,phone:phone.slice(2),cpf},
      });
      if(createError||!user.user)throw Error("account_create");
      const userId=user.user.id, now=new Date().toISOString();
      const {error:saveError}=await admin.from("artvideo_customer_accounts").upsert({
        user_id:userId,organization_id:org,cpf,full_name:name,phone,
        link_status:"needs_cpf",whatsapp_verified_at:now,whatsapp_verified_number:phone,
      },{onConflict:"user_id"});
      if(saveError){
        await admin.auth.admin.deleteUser(userId);
        throw Error("account_create");
      }
      if(cpfRequired&&!await siteCpfTicketConsume(body.site_cpf_ticket,cpf,name,userId)){
        await admin.from("artvideo_customer_accounts").delete().eq("user_id",userId).eq("organization_id",org);
        await admin.auth.admin.deleteUser(userId);
        throw Error("cpf_ticket_invalid");
      }
      const session=await sessionFor(userId);
      return response(request,{success:true,...session});
    }
    if(action==="resend"){
      const challengeId=String(body.challenge_id||"");
      if(!uuid(challengeId))return response(request,fail("Solicite um novo código.",404),404);
      const {data:c}=await admin.from("artvideo_customer_access_challenges").select("*").eq("id",challengeId)
        .eq("organization_id",org).eq("status","pending").gt("expires_at",new Date().toISOString()).maybeSingle();
      if(!c)return response(request,fail("Código expirado. Solicite outro.",410),410);
      if(Date.parse(c.next_send_at)>Date.now())return response(request,fail("Aguarde 60 segundos entre envios.",429),429);
      if(c.resend_count>=5)return response(request,fail("Limite de reenvios atingido.",429),429);
      if(c.purpose==="profile"){
        const {data:viewer,error:authError}=await scoped(request).auth.getUser();
        if(authError||viewer.user?.id!==c.account_user_id)
          return response(request,fail("Entre na conta vinculada ao código.",403),403);
      }
      if(c.purpose==="activation"){
        const {data:inv}=await admin.from("artvideo_customer_access_invites").select("status,expires_at")
          .eq("id",c.invite_id).eq("organization_id",org).maybeSingle();
        if(inv?.status!=="pending"||Date.parse(inv.expires_at)<Date.now())return response(request,fail("Convite expirado.",410),410);
      }
      await limit("otp-resend",c.phone_e164,8,3600);
      const code=newCode(),now=new Date().toISOString();
      const {data:updated,error}=await admin.from("artvideo_customer_access_challenges")
        .update({code_digest:await hmac(c.id+":"+code),
          expires_at:new Date(Date.now()+1800000).toISOString(),
          next_send_at:new Date(Date.now()+60000).toISOString(),
          attempts:0,resend_count:c.resend_count+1})
        .eq("id",c.id).eq("status","pending").lt("next_send_at",now)
        .eq("resend_count",c.resend_count).select("id").maybeSingle();
      if(error||!updated)return response(request,fail("Aguarde para reenviar.",429),429);
      const channel=await activeChannel(org);
      try{await sendOtp(channel,c.chat_jid,code);}catch{await admin.from("artvideo_customer_access_challenges").update({status:"locked"}).eq("id",c.id);throw Error("send_failed");}
      return response(request,{success:true,expires_in_seconds:1800,resend_in_seconds:60});
    }
    if(action==="verify"){
      const challengeId=String(body.challenge_id||"");
      const code=String(body.code||"");
      if(!uuid(challengeId)||!/^\d{6}$/.test(code))return response(request,fail("Código inválido.",400),400);
      await limit("otp-verify",challengeId,12,3600);
      const {data:c}=await admin.from("artvideo_customer_access_challenges").select("*")
        .eq("id",challengeId).eq("organization_id",org).eq("status","pending")
        .gt("expires_at",new Date().toISOString()).maybeSingle();
      if(!c||c.attempts>=5)return response(request,fail("Código expirado ou bloqueado.",410),410);
      if(!safeEqual(c.code_digest,await hmac(c.id+":"+code))){
        await admin.from("artvideo_customer_access_challenges").update({
          attempts:c.attempts+1,status:c.attempts>=4?"locked":"pending",
        }).eq("id",c.id).eq("status","pending").eq("attempts",c.attempts);
        return response(request,fail("Código incorreto.",401),401);
      }
      let invite:null|Record<string,unknown>=null;
      if(c.purpose==="activation"){
        const {data:valid}=await admin.from("artvideo_customer_access_invites").select("*")
          .eq("id",c.invite_id).eq("organization_id",org).eq("status","pending")
          .gt("expires_at",new Date().toISOString()).maybeSingle();
        if(!valid||valid.phone_e164!==c.phone_e164)return response(request,fail("Convite expirado.",410),410);
        invite=valid;
      }
      // CPF/nome do cadastro publico nao comprovam posse da conta antiga.
      // Se um terceiro tiver registrado o CPF da vitima, a OTP sozinha nao
      // pode liberar os dados do CRM para a senha que o terceiro conhece.
      if(c.purpose==="activation" && invite){
        const {data:identity}=await admin.from("customers").select("document")
          .eq("id",invite.customer_id).eq("organization_id",org).maybeSingle();
        const cpfFromCrm=cpfDigits(identity?.document);
        if(cpfFromCrm.length!==11)throw Error("cpf_invalid");
        const {data:existingAccounts}=await admin.from("artvideo_customer_accounts")
          .select("user_id,whatsapp_verified_at,whatsapp_verified_number,entity_id")
          .eq("organization_id",org).or("cpf.eq."+cpfFromCrm+",entity_id.eq."+invite.customer_id).limit(3);
        if((existingAccounts||[]).length>1)throw Error("account_ambiguous");
        const prior=existingAccounts?.[0];
        if(prior && (!prior.whatsapp_verified_at || prior.whatsapp_verified_number!==c.phone_e164)){
          const {data:viewer}=await scoped(request).auth.getUser();
          if(viewer.user?.id!==prior.user_id){
            return response(request,fail("Já existe uma conta para este CPF. Entre nela com e-mail e senha e abra este convite novamente.",403),403);
          }
        }
      }
      const {data:consumed}=await admin.from("artvideo_customer_access_challenges")
        .update({status:"consumed",consumed_at:new Date().toISOString()})
        .eq("id",c.id).eq("status","pending").eq("code_digest",c.code_digest)
        .select("id").maybeSingle();
      if(!consumed)return response(request,fail("Código já utilizado.",410),410);
      if(c.purpose==="login"){
        const {data:account}=await admin.from("artvideo_customer_accounts")
          .select("user_id,entity_id,whatsapp_verified_at,whatsapp_verified_number")
          .eq("user_id",c.account_user_id).eq("organization_id",org).maybeSingle();
        if(!account?.whatsapp_verified_at||account.whatsapp_verified_number!==c.phone_e164)
          return response(request,fail("Acesso indisponível.",403),403);
        const {data:current}=await admin.from("artvideo_customer_accounts")
          .select("phone").eq("organization_id",org).eq("user_id",c.account_user_id).maybeSingle();
        if(normalizePhone(current?.phone)!==c.phone_e164)
          return response(request,fail("Atualize a verificação do WhatsApp na sua conta.",403),403);
        const session=await sessionFor(c.account_user_id);
        return response(request,{success:true,...session,needs_password:false});
      }
      const customerId=String(invite?.customer_id||"");
      const {data:customer}=await admin.from("customers").select("id,document,full_name,whatsapp")
        .eq("organization_id",org).eq("id",customerId).maybeSingle();
      if(!customer||normalizePhone(customer.whatsapp)!==c.phone_e164)throw Error("customer_changed");
      const cpf=cpfDigits(customer.document);
      if(!/^\d{11}$/.test(cpf))throw Error("cpf_invalid");
      const {data:byEntity}=await admin.from("artvideo_customer_accounts").select("user_id,entity_id")
        .eq("organization_id",org).eq("entity_id",customerId).limit(2);
      const {data:byCpf}=await admin.from("artvideo_customer_accounts")
        .select("user_id,entity_id").eq("organization_id",org).eq("cpf",cpf).limit(3);
      if((byEntity||[]).length>1||(byCpf||[]).length>1 || (byEntity?.[0]&&byCpf?.[0]&&byEntity[0].user_id!==byCpf[0].user_id))throw Error("account_ambiguous");
      const existing=byEntity?.[0]||byCpf?.[0]||null;
      if(existing?.entity_id&&existing.entity_id!==customerId)throw Error("account_ambiguous");
      let userId=existing?.user_id||"",created=false;
      if(userId){
        const {data:profile}=await admin.from("profiles").select("id").eq("id",userId).maybeSingle();
        const {data:members}=await admin.from("organization_members").select("id").eq("user_id",userId).limit(1);
        if(profile||members?.length)throw Error("account_conflict");
      }else{
        const externalId=crypto.randomUUID();
        const {data:user,error}=await admin.auth.admin.createUser({
          email:"cliente-"+externalId+"@auth.unionworld.app",
          password:randomString(),email_confirm:true,
          user_metadata:{registration_origin:"artvideo_customer",full_name:customer.full_name},
        });
        if(error||!user.user)throw Error("account_create");
        userId=user.user.id;
        created=true;
      }
      const update={
        organization_id:org,entity_id:customerId,cpf,
        full_name:customer.full_name,phone:c.phone_e164,
        link_status:"approved",review_entity_id:null,review_reason:null,
        whatsapp_verified_at:new Date().toISOString(),
        whatsapp_verified_number:c.phone_e164,
        crm_access_activated_at:new Date().toISOString(),
      };
      const saved=existing
        ? await admin.from("artvideo_customer_accounts").update(update).eq("user_id",userId).eq("organization_id",org)
        : await admin.from("artvideo_customer_accounts").insert({user_id:userId,...update});
      if(saved.error){
        if(created)await admin.auth.admin.deleteUser(userId);
        throw Error("account_link_failed");
      }
      await admin.from("artvideo_customer_access_invites")
        .update({status:"activated",activated_by:userId,activated_at:new Date().toISOString()})
        .eq("id",invite?.id).eq("status","pending");
      // Copia o endereco principal do CRM apenas se a conta ainda nao tem enderecos.
      // Nunca substitui enderecos que o cliente ja personalizou na loja.
      const {data:existingAddresses}=await admin.from("artvideo_customer_addresses")
        .select("id").eq("user_id",userId).eq("organization_id",org).limit(1);
      if(!existingAddresses?.length){
        const {data:crmAddress}=await admin.from("customer_addresses")
          .select("zip_code,street,number,complement,neighborhood,city,state")
          .eq("customer_id",customerId).eq("organization_id",org)
          .order("is_default",{ascending:false}).limit(1);
        const a=crmAddress?.[0];
        const zip=cpfDigits(a?.zip_code);
        if(a&&zip.length===8&&a.street&&a.number&&a.neighborhood&&a.city&&/^[A-Za-z]{2}$/.test(String(a.state||""))){
          await admin.from("artvideo_customer_addresses").insert({
            organization_id:org,user_id:userId,label:"Principal",
            postal_code:zip,street:a.street,number:a.number,complement:a.complement||null,
            district:a.neighborhood,city:a.city,state:String(a.state).toUpperCase(),is_default:true,
          });
        }
      }
      const {data:customerAddress}=await admin.from("customer_addresses")
        .select("street,number,neighborhood,city,state,zip_code,complement")
        .eq("customer_id",customerId).eq("organization_id",org)
        .order("is_default",{ascending:false}).limit(1);
      const session=await sessionFor(userId);
      return response(request,{success:true,...session,needs_password:created,
        profile:created?{full_name:customer.full_name,cpf,phone:maskedPhone(c.phone_e164),address:customerAddress?.[0]||null}:null});
    }
    if(action==="login_password"){
      const cpf=cpfDigits(body.cpf),password=String(body.password||"");
      if(cpf.length!==11||!password||password.length>256)return response(request,fail("Credenciais inválidas.",401),401);
      await limit("password-login",cpf,12,3600);
      const account=await passwordAccount(org,cpf);
      if(!account)return response(request,fail("Credenciais inválidas.",401),401);
      const {data:user}=await admin.auth.admin.getUserById(account.user_id);
      if(!user?.user?.email)return response(request,fail("Credenciais inválidas.",401),401);
      const client=createClient(baseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data,error}=await client.auth.signInWithPassword({email:user.user.email,password});
      if(error||!data.session)return response(request,fail("Credenciais inválidas.",401),401);
      return response(request,{success:true,access_token:data.session.access_token,refresh_token:data.session.refresh_token});
    }
    if(action==="customer_order_media"){
      const orderId=String(body.order_id||""),mediaId=String(body.media_id||"");
      if(!uuid(orderId)||!uuid(mediaId))return response(request,fail("Arquivo inválido.",400),400);
      const details=await portalAssetContext(request,orderId);
      if(!(Array.isArray(details.photos)?details.photos:[]).some((x:{id:string})=>x.id===mediaId))
        return response(request,fail("Imagem indisponível.",403),403);
      const {data:media,error:lookupError}=await admin.from("media")
        .select("bucket_id,storage_path,mime_type,file_name").eq("id",mediaId).eq("organization_id",org).maybeSingle();
      if(lookupError||!media?.storage_path||media.bucket_id!=="service-images"||!media.mime_type?.startsWith("image/"))
        return response(request,fail("Imagem indisponível.",404),404);
      const imageName=String(media.file_name||"foto-equipamento.jpg").replace(/[\\/\r\n]/g,"_").slice(0,120);
      const imageOptions=body.download===true?{download:imageName}:undefined;
      const {data:url,error:urlError}=await admin.storage.from(media.bucket_id).createSignedUrl(media.storage_path,120,imageOptions);
      if(urlError||!url?.signedUrl)return response(request,fail("Imagem indisponível.",404),404);
      return response(request,{success:true,url:url.signedUrl,expires_in_seconds:120});
    }
    if(action==="customer_invoice_file"){
      const orderId=String(body.order_id||"");
      const attachmentId=String(body.attachment_id||"");
      if(!uuid(orderId)||!uuid(attachmentId))
        return response(request,fail("Nota fiscal inválida.",400),400);
      // Valida login, CPF, WhatsApp verificado, organização e propriedade da OS na RPC.
      const details=await portalAssetContext(request,orderId);
      if(!Array.isArray(details.documents)||!details.documents.some(
        (doc:{id:string;type:string})=>doc.id===attachmentId&&doc.type==="invoice"))
        return response(request,fail("Nota fiscal indisponível.",403),403);
      // Nunca confiar em caminhos, tipos de documentos ou storage buckets enviados pelo cliente.
      const {data:link,error:linkError}=await admin.from("service_order_situation_media")
        .select("media_id,attachment_type_id")
        .eq("id",attachmentId).eq("service_order_id",orderId)
        .eq("organization_id",org).maybeSingle();
      if(linkError||!link?.media_id||!link.attachment_type_id)
        return response(request,fail("Nota fiscal não encontrada.",404),404);
      const {data:classification,error:classificationError}=await admin.from("attachment_types")
        .select("name").eq("id",link.attachment_type_id)
        .eq("organization_id",org).maybeSingle();
      if(classificationError||String(classification?.name||"").trim().toLocaleLowerCase("pt-BR")!=="nota fiscal")
        return response(request,fail("Nota fiscal indisponível.",403),403);
      const {data:file,error:fileError}=await admin.from("media")
        .select("bucket_id,storage_path,file_name,mime_type")
        .eq("id",link.media_id).eq("organization_id",org).maybeSingle();
      if(fileError||!file?.storage_path||file.bucket_id!=="service-images"||
        !(file.mime_type==="application/pdf"||String(file.mime_type||"").startsWith("image/")))
        return response(request,fail("Arquivo da nota fiscal indisponível.",404),404);
      const name=String(file.file_name||"nota-fiscal").replace(/[\\/\r\n]/g,"_").slice(0,120);
      const options=body.download===true?{download:name}:undefined;
      const {data:url,error:urlError}=await admin.storage.from(file.bucket_id)
        .createSignedUrl(file.storage_path,120,options);
      if(urlError||!url?.signedUrl)return response(request,fail("Nota fiscal indisponível.",404),404);
      return response(request,{success:true,url:url.signedUrl,expires_in_seconds:120});
    }
    if(action==="customer_signature_link"){
      const requestId=String(body.signature_id||"");
      if(!uuid(requestId))return response(request,fail("Assinatura inválida.",400),400);
      const {data:user,error:authError}=await scoped(request).auth.getUser();
      if(authError||!user.user)return response(request,fail("Entre na sua conta.",401),401);
      const {data:list,error:listError}=await scoped(request).rpc("artvideo_customer_signatures_v1");
      if(listError||!Array.isArray(list)||!list.some((x:{id:string})=>x.id===requestId))
        return response(request,fail("Assinatura indisponível.",403),403);
      const {data:item}=await admin.from("document_signature_requests")
        .select("id,status,expires_at,signed_at,cancelled_at,token_ciphertext,token_iv,require_external_signature")
        .eq("organization_id",org).eq("id",requestId).maybeSingle();
      if(!item||item.signed_at||item.cancelled_at||!item.require_external_signature)
        return response(request,fail("Assinatura não está pendente.",409),409);
      if(new Date(item.expires_at).getTime()<=Date.now())
        return response(request,fail("O prazo deste convite terminou. Solicite um novo convite à Artvideo.",410),410);
      const secret=Deno.env.get("SIGNATURE_TOKEN_KEY")||"";
      if(secret.length<16)return response(request,fail("Assinatura temporariamente indisponível.",503),503);
      const token=await decryptSignatureToken(secret,item.token_ciphertext,item.token_iv);
      return response(request,{success:true,url:"https://eletronicaartvideo.com.br/assinatura/"+encodeURIComponent(token)});
    }
    if(action==="signed_document"){
      const {data:user,error}=await scoped(request).auth.getUser();
      if(error||!user.user)return response(request,fail("Entre na sua conta.",401),401);
      const documentId=String(body.document_id||"");
      if(!uuid(documentId))return response(request,fail("Documento inválido."),400);
      const {data:document}=await admin.from("document_signature_requests")
        .select("id,service_order_id,final_pdf_storage_path,signed_at,cancelled_at,require_external_signature")
        .eq("id",documentId).eq("organization_id",org).maybeSingle();
      if(!document?.signed_at||!document.final_pdf_storage_path||document.cancelled_at||!document.require_external_signature)
        return response(request,fail("Documento não disponível.",404),404);
      // A RPC de detalhes já valida CPF/identidade, vínculo verificado com o
      // cliente da OS e empresa. NÃO exigir artvideo_customer_accounts.entity_id:
      // contas verificadas por CPF podem não ter essa referência preenchida.
      const details=await portalAssetContext(request,document.service_order_id);
      if(!Array.isArray(details.documents) || !details.documents.some(
        (entry:{id:string;type:string})=>entry.id===documentId&&entry.type==="signature"))
        return response(request,fail("Documento não disponível.",403),403);
      const path=String(document.final_pdf_storage_path).replace(/^signed-documents\//,"");
      const downloadName="documento-assinado-"+String(details.order.os_number||"OS").replace(/[^a-z0-9_-]/gi,"_").slice(0,40)+".pdf";
      const options=body.download===true?{download:downloadName}:undefined;
      const {data:sign,error:signError}=await admin.storage.from("signed-documents").createSignedUrl(path,120,options);
      if(signError||!sign?.signedUrl)return response(request,fail("Documento indisponível no armazenamento.",404),404);
      return response(request,{success:true,url:sign.signedUrl,expires_in_seconds:120});
    }
    return response(request,fail("Operação inválida.",400),400);
  }catch(e){
    const reason= e instanceof Error?e.message:"unknown";
    if(reason==="limit_exceeded")return response(request,fail("Limite de consultas ou tentativas atingido. Tente novamente mais tarde.",429),429);
    if(reason==="cpf_not_found")return response(request,fail("CPF não encontrado na base de consulta.",422),422);
    if(reason==="cpf_quota_exceeded")return response(request,fail("Limite de consultas de CPF atingido. Tente novamente mais tarde.",429),429);
    if(reason==="cpf_validation_unavailable")return response(request,fail("A validação de CPF está temporariamente indisponível. Tente novamente mais tarde.",503),503);
    if(reason==="cpf_ticket_invalid")return response(request,fail("A validação de CPF expirou. Repita o cadastro.",422),422);
    if(["channel_unavailable","bridge_failed","bridge_unavailable","send_failed","send_unconfirmed","number_unavailable"].includes(reason))
      return response(request,fail("Não foi possível enviar pelo WhatsApp. Tente novamente.",503),503);
    console.error("artvideo-customer-access",/^[a-z_]{3,50}$/.test(reason)?reason:"failed");
    return response(request,fail("Não foi possível concluir a solicitação.",500),500);
  }
});
