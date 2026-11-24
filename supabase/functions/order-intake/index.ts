import { createClient } from "npm:@supabase/supabase-js@2.112.3";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const clean=(v:unknown,max=160)=>typeof v==="string"?v.trim().slice(0,max):"";
const digits=(v:unknown)=>clean(v).replace(/\D/g,"");
const hash=async(token:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,"0")).join("");
// Derive a recoverable, unguessable bearer token without storing its plaintext.
async function recoverableToken(org:string,id:string){
  const secret=Deno.env.get("ORDER_INTAKE_TOKEN_SECRET")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("union-order-intake-link-v1:"+org+":"+id));
  return Array.from(new Uint8Array(signed),b=>b.toString(16).padStart(2,"0")).join("");
}
const ddCodes=new Set("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "));
const validPhone=(v:string)=>ddCodes.has(v.slice(0,2))&& !/^(\d)\1+$/.test(v) && /^(?:\d{2}[2-5]\d{7}|\d{2}9\d{8})$/.test(v);
const phoneOf=(v:unknown)=>{const p=digits(v);return /^[1-9]\d{9,10}$/.test(p)?"55"+p:p;};
function validCpf(c:string){if(!/^\d{11}$/.test(c)||/^(\d)\1{10}$/.test(c))return false;return [9,10].every(n=>{let sum=0;for(let i=0;i<n;i++)sum+=Number(c[i])*(n+1-i);return (sum*10%11)%10===Number(c[n]);});}
function validCnpj(c:string){if(!/^\d{14}$/.test(c)||/^(\d)\1{13}$/.test(c))return false;return [12,13].every(n=>{let s=0,w=2;for(let i=n-1;i>=0;i--){s+=Number(c[i])*w;w=w===9?2:w+1;}return (s%11<2?0:11-s%11)===Number(c[n]);});}
function check(r:any){if(r.error)throw new Error("Não foi possível concluir a operação.");return r.data;}
class InputError extends Error{}
class IdentityError extends Error{constructor(message:string,public status:number){super(message);}}
/** Use the existing Artvideo site validator, including its HMAC cache and quota.
 * Never return the provider's name or use Artvideo credentials for other tenants. */
async function artvideoIdentityRequired(admin:any,org:string){
  const artvideo=check(await admin.rpc("artvideo_organization_id"));
  if(String(artvideo)!==org)return false;
  return check(await admin.rpc("artvideo_site_cpf_enforcement_v1"))===true;
}
async function validateArtvideoIdentity(url:string,key:string,cpf:string,name:string){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url+"/functions/v1/artvideo-customer-access",{
      method:"POST",headers:{"Content-Type":"application/json",apikey:key,Authorization:"Bearer "+key},
      body:JSON.stringify({action:"registration_identity",cpf,name}),signal:controller.signal,
    });
    const data=await response.json().catch(()=>null);
    if(response.ok&&data?.success===true&&data.required===true&&uuid(data.ticket))return data.ticket as string;
    if(response.status===422||response.status===400)throw new IdentityError("O nome completo informado não corresponde ao CPF consultado. Confira o nome e o CPF.",422);
    if(response.status===429)throw new IdentityError("Limite temporário de consultas de CPF atingido. Tente novamente mais tarde.",429);
    throw new IdentityError("Não foi possível validar o CPF agora. Tente novamente.",503);
  }catch(error){
    if(error instanceof IdentityError)throw error;
    throw new IdentityError("Não foi possível validar o CPF agora. Tente novamente.",503);
  }finally{clearTimeout(timeout);}
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método inválido."},405);
  const length=Number(req.headers.get("content-length")||0);
  if(length>9_000_000)return json({error:"Envio muito grande."},413);
  try{
    const url=Deno.env.get("SUPABASE_URL")!, key=Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    // Bound even chunked requests, before decoding multipart or JSON.
    const reader=req.body?.getReader();
    const chunks:Uint8Array[]=[];let size=0;
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;if(value){size+=value.byteLength;if(size>9_000_000){await reader.cancel();return json({error:"Envio muito grande."},413);}chunks.push(value);}}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const bounded=new Response(bytes,{headers:{"Content-Type":req.headers.get("content-type")||"application/json"}});
    const multipart=req.headers.get("content-type")?.startsWith("multipart/form-data");
    const form=multipart?await bounded.formData():null;
    const body=form?{action:"submit",token:form.get("token"),payload:JSON.parse(String(form.get("payload")||"{}"))}:await bounded.json();
    const action=String(body.action||"");
    if(action==="open"||action==="models"||action==="identity"||action==="submit"){
      const token=String(body.token||"");
      if(!/^[a-f0-9]{64}$/.test(token))return json({error:"Link inválido ou expirado."},404);
      const row=check(await admin.from("order_intake_requests").select("id,organization_id,created_by,phone,status,expires_at,upload_attempt,upload_started_at,bound_customer_id").eq("token_hash",await hash(token)).maybeSingle());
      if(!row||Date.parse(row.expires_at)<Date.now()||row.status==="cancelled")return json({error:"Link inválido ou expirado. Peça outro à assistência."},404);
      if(["received","converted"].includes(row.status))return json({status:"received"});
      // Recover only a lease older than the maximum Edge runtime. Use a CAS to
      // prevent competing requests from cleaning a newly started upload.
      if(row.status==="submitting"){
        if(!row.upload_attempt||!row.upload_started_at||Date.now()-Date.parse(row.upload_started_at)<15*60_000)
          return json({error:"Envio em andamento. Tente novamente em instantes."},409);
        const recoveryStarted=new Date().toISOString();
        const recovered=check(await admin.from("order_intake_requests").update({upload_started_at:recoveryStarted}).eq("id",row.id).eq("status","submitting").eq("upload_attempt",row.upload_attempt).eq("upload_started_at",row.upload_started_at).select("id").maybeSingle());
        if(!recovered)return json({error:"Envio em recuperação. Tente novamente."},409);
        // Files are deterministic for the old attempt; clean only these paths.
        const paths=Array.from({length:5},(_,i)=>"orders/"+row.organization_id+"/draft/pre-os-"+row.id+"-"+row.upload_attempt+"-"+i+".webp");
        try{
          check(await admin.storage.from("service-images").remove(paths));
          check(await admin.from("media").delete().eq("organization_id",row.organization_id).eq("bucket_id","service-images").in("storage_path",paths));
          check(await admin.from("order_intake_requests").update({status:"filling",upload_attempt:null,upload_started_at:null}).eq("id",row.id).eq("upload_attempt",row.upload_attempt).eq("upload_started_at",recoveryStarted).eq("status","submitting"));
          row.status="filling";
        }catch{
          await admin.from("order_intake_requests").update({upload_started_at:row.upload_started_at}).eq("id",row.id).eq("upload_attempt",row.upload_attempt).eq("upload_started_at",recoveryStarted);
          return json({error:"Não foi possível recuperar o envio. Tente novamente."},503);
        }
      }
      const org=check(await admin.from("organizations").select("id,name,status,logo_url").eq("id",row.organization_id).eq("status","active").maybeSingle());
      if(!org)return json({error:"Link indisponível."},404);
      if(action==="identity"){
        if(row.bound_customer_id)return json({required:false});
        const cpf=digits(body.document), name=clean(body.name,120).replace(/\s+/g," ");
        if(!validCpf(cpf)||name.length<5||name.split(" ").length<2)throw new InputError("Informe um CPF válido e o nome completo.");
        if(!await artvideoIdentityRequired(admin,org.id))return json({required:false});
        const ticket=await validateArtvideoIdentity(url,key,cpf,name);
        return json({required:true,ticket});
      }
      if(action==="models"){
        if(!uuid(body.brand_id))throw new InputError("Marca inválida.");
        const brand=check(await admin.from("equipment_brands").select("id").eq("organization_id",org.id).eq("id",body.brand_id).eq("is_active",true).maybeSingle());
        if(!brand)throw new InputError("Marca indisponível.");
        return json({models:check(await admin.from("equipment_models").select("id,name").eq("organization_id",org.id).eq("equipment_brand_id",brand.id).eq("is_active",true).order("name").limit(500))});
      }
      if(action==="open"){
        if(row.status==="sent")check(await admin.from("order_intake_requests").update({status:"filling"}).eq("id",row.id).eq("status","sent"));
        const types=check(await admin.from("equipment_types").select("id,name").eq("organization_id",org.id).eq("is_active",true).order("name").limit(1000));
        const brands=check(await admin.from("equipment_brands").select("id,name,equipment_type_id").eq("organization_id",org.id).eq("is_active",true).order("name").limit(2000));
        // Only the configured company logo, never arbitrary tenant media.
        let companyLogo:string|null=null;
        try{
          const settings=await admin.from("organization_company_settings").select("logo_media_id,menu_logo_media_id").eq("organization_id",org.id).maybeSingle();
          const logoId=settings.data?.logo_media_id||settings.data?.menu_logo_media_id;
          if(logoId&&uuid(logoId)){
            const media=await admin.from("media").select("bucket_id,storage_path,mime_type").eq("organization_id",org.id).eq("id",logoId).maybeSingle();
            if(media.data?.mime_type?.startsWith("image/")&&media.data.bucket_id&&media.data.storage_path){
              const signed=await admin.storage.from(media.data.bucket_id).createSignedUrl(media.data.storage_path,3600);
              companyLogo=signed.data?.signedUrl||null;
            }
          }
          if(!companyLogo&&typeof org.logo_url==="string"&&/^https:\/\//i.test(org.logo_url))companyLogo=org.logo_url;
        }catch{/* branding unavailable must not prevent an authorized request */}
        return json({status:"filling",company:org.name,company_logo_url:companyLogo,types,brands,requires_customer_details:!row.bound_customer_id,requires_cpf_identity:!row.bound_customer_id&&await artvideoIdentityRequired(admin,org.id)});
      }
      const p=body.payload||{}, problem=clean(p.problem,2500);
      let a=p.address||{}, cpf=digits(p.document), name=clean(p.name), phone=digits(p.phone);
      const bound=Boolean(row.bound_customer_id);
      if(bound){
        const customer=check(await admin.from("customers").select("id,full_name,legal_name,document,cnpj,phone,addresses:customer_addresses(zip_code,street,number,complement,neighborhood,city,state,is_default)").eq("organization_id",org.id).eq("id",row.bound_customer_id).maybeSingle());
        if(!customer)throw new InputError("Cadastro não disponível. Solicite um novo link à assistência.");
        const matches=check(await admin.rpc("union_whatsapp_find_customer_by_phone",{p_organization:org.id,p_phone:row.phone}));
        if(matches.length!==1||matches[0].customer_id!==customer.id)throw new InputError("Vínculo do cadastro alterado. Solicite um novo link à assistência.");
        name=customer.full_name||customer.legal_name||"Cliente";
        cpf=digits(customer.document)||digits(customer.cnpj);
        phone=digits(customer.phone)||row.phone.replace(/^55(?=\d{10,11}$)/,"");
        const addresses=customer.addresses||[];
        a=addresses.find((address:any)=>address.is_default)||addresses[0]||{};
      }
      if(!bound&&p.phone!=null&&p.phone!==""&&!validPhone(phone))throw new InputError("Informe um telefone válido com DDD ou deixe em branco.");
      if((!bound&&(name.length<3||(!validCpf(cpf)&&!validCnpj(cpf))))||problem.length<5)throw new InputError("Confira nome, CPF/CNPJ e descrição do problema.");
      const address={zip_code:digits(a.zip_code),street:clean(a.street),number:clean(a.number,20),complement:clean(a.complement),neighborhood:clean(a.neighborhood),city:clean(a.city),state:clean(a.state,2).toUpperCase()};
      if(!bound&&(address.zip_code.length!==8||!address.street||!address.number||!address.neighborhood||!address.city||! /^[A-Z]{2}$/.test(address.state)))throw new InputError("Complete o endereço.");
      const typeId=p.type_id, brandId=p.brand_id;
      if(!uuid(typeId))throw new InputError("Selecione o tipo do equipamento.");
      const type=check(await admin.from("equipment_types").select("id,name").eq("organization_id",org.id).eq("id",typeId).eq("is_active",true).maybeSingle());
      if(!type)throw new InputError("Equipamento indisponível.");
      let brand=null;
      if(brandId){if(!uuid(brandId))throw new InputError("Marca inválida.");brand=check(await admin.from("equipment_brands").select("id,name").eq("organization_id",org.id).eq("equipment_type_id",typeId).eq("id",brandId).eq("is_active",true).maybeSingle());if(!brand)throw new InputError("Marca indisponível para este equipamento.");}
      const files=form?form.getAll("photo"):[];
      if(files.length>5)throw new InputError("Envie até cinco fotos.");
      const kinds=form?form.getAll("kind"):[];
      if(kinds.length!==files.length||kinds.some(k=>!["label","equipment","problem"].includes(String(k))))throw new InputError("Fotos inválidas.");
      for(const f of files){if(!(f instanceof File)||f.size<12||f.size>1_500_000||f.type!=="image/webp")throw new InputError("Foto inválida ou muito grande. Tente tirar outra.");
        const b=new Uint8Array(await f.slice(0,12).arrayBuffer());if(String.fromCharCode(...b.slice(0,4))!=="RIFF"||String.fromCharCode(...b.slice(8,12))!=="WEBP")throw new InputError("Formato de foto inválido.");}
      if(!kinds.includes("label")||!kinds.includes("problem"))throw new InputError("Envie uma foto da etiqueta e uma foto do defeito.");
      if(!bound&&cpf.length===11&&await artvideoIdentityRequired(admin,org.id)){
        const ticket=p.cpf_identity_ticket;
        const verified=uuid(ticket)&&check(await admin.rpc("artvideo_site_cpf_check_v1",{p_token:ticket,p_cpf:cpf,p_name:name}))===true;
        // A stale or missing proof never bypasses the authoritative validation.
        if(!verified)await validateArtvideoIdentity(url,key,cpf,name);
      }
      const attempt=crypto.randomUUID();
      const claim=check(await admin.from("order_intake_requests").update({status:"submitting",upload_attempt:attempt,upload_started_at:new Date().toISOString()}).eq("id",row.id).in("status",["sent","filling"]).gt("expires_at",new Date().toISOString()).select("id").maybeSingle());
      if(!claim)return json({error:"Solicitação já enviada ou em processamento."},409);
      const images:any[]=[];
      try{
        for(let i=0;i<files.length;i++){
          const f=files[i] as File, kind=kinds[i]==="label"?"label":"equipment";
          const filename=(kind==="label"?"Etiqueta":kinds[i]==="problem"?"Problema":"Equipamento")+"-"+(i+1)+".webp";
          const path="orders/"+org.id+"/draft/pre-os-"+row.id+"-"+attempt+"-"+i+".webp";
          check(await admin.storage.from("service-images").upload(path,f,{contentType:"image/webp",upsert:false}));
          const media=check(await admin.from("media").insert({organization_id:org.id,bucket_id:"service-images",storage_path:path,file_name:filename,mime_type:"image/webp",file_size:f.size,uploaded_by:row.created_by}).select("id").single());
          images.push({mediaId:media.id,path,kind,name:filename});
        }
        const saved=check(await admin.from("order_intake_requests").update({status:"received",upload_attempt:null,upload_started_at:null,submitted_at:new Date().toISOString(),payload:{name,document:cpf,phone:phone||row.phone.replace(/^55(?=\d{10,11}$)/,""),address,problem,type_id:type.id,type_name:type.name,brand_id:brand?.id||null,brand_name:brand?.name||clean(p.brand_text),model:clean(p.model),serial:clean(p.serial)},images}).eq("id",row.id).eq("status","submitting").eq("upload_attempt",attempt).select("id").maybeSingle());
        if(!saved)throw new Error("Envio não confirmado.");
      }catch(e){
        // A confirmed submission must never be cleaned after an ambiguous network response.
        const state=await admin.from("order_intake_requests").select("status,upload_attempt").eq("id",row.id).maybeSingle();
        if(!state.error&&["received","converted"].includes(state.data?.status))return json({status:"received"});
        if(!state.error&&state.data?.status==="submitting"&&state.data?.upload_attempt===attempt){
          const paths=Array.from({length:5},(_,i)=>"orders/"+org.id+"/draft/pre-os-"+row.id+"-"+attempt+"-"+i+".webp");
          const cleanup=await admin.storage.from("service-images").remove(paths);
          if(!cleanup.error){
            const records=await admin.from("media").delete().eq("organization_id",org.id).eq("bucket_id","service-images").in("storage_path",paths);
            if(!records.error)await admin.from("order_intake_requests").update({status:"filling",upload_attempt:null,upload_started_at:null}).eq("id",row.id).eq("status","submitting").eq("upload_attempt",attempt);
          }
        }
        throw e;
      }
      return json({status:"received"});
    }
    // Internal actions: the public token never grants staff access.
    const client=createClient(url,key,{global:{headers:{Authorization:req.headers.get("Authorization")||""}},auth:{persistSession:false}});
    const auth=await client.auth.getUser(), actor=auth.data.user;
    if(auth.error||!actor)return json({error:"Sessão expirada."},401);
    const org=body.organization_id;
    if(!uuid(org))throw new InputError("Empresa inválida.");
    const perms=check(await client.rpc("my_organization_permissions",{p_organization_id:org}));
    const keys=new Set((perms||[]).map((p:any)=>typeof p==="string"?p:p.permission_key));
    if(!keys.has("orders.create")||!keys.has("orders.view"))return json({error:"Sem permissão para Pré-OS."},403);
    if(action==="create"){
      if(!keys.has("whatsapp.inbox.send")||!uuid(body.conversation_id))return json({error:"Sem permissão para este atendimento."},403);
      const conv=check(await client.from("union_whatsapp_conversations").select("id,contact_phone,chat_jid").eq("organization_id",org).eq("id",body.conversation_id).maybeSingle());
      if(!conv||String(conv.chat_jid).endsWith("@g.us"))return json({error:"Conversa indisponível."},404);
      const phone=phoneOf(conv.contact_phone);
      if(!/^55[1-9]\d{9,10}$/.test(phone))throw new InputError("Não foi possível identificar o número desta conversa.");
      let boundCustomerId:string|null=null;
      if(keys.has("customers.view")){
        const matches=check(await admin.rpc("union_whatsapp_find_customer_by_phone",{p_organization:org,p_phone:phone}));
        if(Array.isArray(matches)&&matches.length===1&&uuid(matches[0].customer_id)){
          const customer=check(await client.from("customers").select("id").eq("organization_id",org).eq("id",matches[0].customer_id).maybeSingle());
          boundCustomerId=customer?.id||null;
        }
      }
      const requestId=crypto.randomUUID();
      const token=await recoverableToken(org,requestId);
      // Bound active invitations per operator/conversation (new invitations can be cancelled).
      const existing=check(await admin.from("order_intake_requests").select("id").eq("organization_id",org).eq("conversation_id",conv.id).in("status",["sent","filling","submitting"]).gt("expires_at",new Date().toISOString()).limit(5));
      if(existing.length>=5)throw new InputError("Há links pendentes demais. Cancele os antigos antes de gerar outro.");
      check(await admin.from("order_intake_requests").insert({id:requestId,organization_id:org,conversation_id:conv.id,created_by:actor.id,phone,bound_customer_id:boundCustomerId,token_hash:await hash(token)}));
      return json({id:requestId,token,requires_customer_details:!boundCustomerId});
    }
    const scoped=(columns:string,options?:{count:"exact";head?:boolean})=>{
      let q=admin.from("order_intake_requests").select(columns,options).eq("organization_id",org);
      if(!keys.has("orders.view_all"))q=q.eq("created_by",actor.id);
      return q;
    };
    let scope=scoped("id,status,created_at,expires_at,submitted_at,order_id,conversation_id,created_by,phone,customer_name:payload->>name,bound_customer_id");
    if(action==="list"){
      if(body.conversation_id&&!uuid(body.conversation_id))throw new InputError("Conversa inválida.");
      const filter=(q:any)=>body.conversation_id?q.eq("conversation_id",body.conversation_id):q;
      const page=Math.max(0,Math.min(10000,Math.trunc(Number(body.page)||0)));
      const [result,active,completed]=await Promise.all([
        filter(scoped("id,status,created_at,expires_at,submitted_at,order_id,conversation_id,phone,customer_name:payload->>name,bound_customer_id",{count:"exact"})).order("created_at",{ascending:false}).range(page*25,page*25+24),
        filter(scoped("id",{count:"exact",head:true})).or("status.in.(received,submitting),and(status.in.(sent,filling),expires_at.gt."+new Date().toISOString()+")"),
        filter(scoped("id",{count:"exact",head:true})).eq("status","converted")
      ]);
      const rows=check(result)||[];check(active);check(completed);
      const ids=[...new Set(rows.map((r:any)=>r.conversation_id))];
      const conversations=ids.length?check(await admin.from("union_whatsapp_conversations").select("id,contact_name").eq("organization_id",org).in("id",ids)):[];
      const customerIds=[...new Set(rows.filter((r:any)=>r.bound_customer_id&&!r.customer_name).map((r:any)=>r.bound_customer_id))];
      const customers=customerIds.length&&keys.has("customers.view")?check(await client.from("customers").select("id,full_name,legal_name").eq("organization_id",org).in("id",customerIds)):[];
      const names=new Map(conversations.map((c:any)=>[c.id,c.contact_name]));
      const registered=new Map(customers.map((c:any)=>[c.id,c.full_name||c.legal_name]));
      return json({rows:rows.map(({bound_customer_id,...row}:any)=>({...row,customer_name:row.customer_name||registered.get(bound_customer_id)||names.get(row.conversation_id)||null})),total:result.count||0,active:active.count||0,completed:completed.count||0});
    }
    if(!uuid(body.id))throw new InputError("Solicitação inválida.");
    if(action==="cancel"){
      let update=admin.from("order_intake_requests").update({status:"cancelled"}).eq("id",body.id).eq("organization_id",org).in("status",["sent","filling"]);
      if(!keys.has("orders.view_all"))update=update.eq("created_by",actor.id);
      const cancelled=check(await update.select("id").maybeSingle());
      if(!cancelled)throw new InputError("Link indisponível ou já encerrado.");
      return json({id:cancelled.id,status:"cancelled"});
    }
    const allowed=check(await scope.eq("id",body.id).maybeSingle());
    if(!allowed)return json({error:"Solicitação não encontrada."},404);
    if(action==="link"){
      if(!keys.has("whatsapp.inbox.send"))return json({error:"Sem permissão para compartilhar links."},403);
      const conversation=check(await client.from("union_whatsapp_conversations").select("id").eq("organization_id",org).eq("id",allowed.conversation_id).maybeSingle());
      if(!conversation)return json({error:"Sem acesso a este atendimento."},403);
      const row=check(await admin.from("order_intake_requests").select("id,token_hash,status,expires_at,created_at,bound_customer_id").eq("organization_id",org).eq("id",allowed.id).maybeSingle());
      if(!row||!["sent","filling"].includes(row.status)||Date.parse(row.expires_at)<=Date.now())throw new InputError("Este link não está mais disponível.");
      const token=await recoverableToken(org,row.id),digest=await hash(token);
      if(digest!==row.token_hash){
        // Legacy links may be recoverable from an already shared message. Limit
        // to this authorized conversation and accept only an exact hash match.
        const messages=check(await client.from("union_whatsapp_messages").select("body_text").eq("organization_id",org).eq("conversation_id",allowed.conversation_id).gte("created_at",row.created_at).like("body_text","%/solicitacao#t=%").order("created_at",{ascending:false}).limit(50));
        for(const message of messages||[]){
          for(const match of String(message.body_text||"").matchAll(/\/solicitacao#t=([a-f0-9]{64})(?![a-f0-9])/g)){
            if(await hash(match[1])===row.token_hash)return json({id:row.id,token:match[1],requires_customer_details:!row.bound_customer_id});
          }
        }
        if(row.status!=="sent")throw new InputError("O link antigo está em preenchimento. Utilize a mensagem original do WhatsApp.");
        if(body.replace_legacy!==true)return json({legacy:true});
        // Explicit replacement only for an unused legacy invitation; never silently invalidate.
        const changed=check(await admin.from("order_intake_requests").update({token_hash:digest}).eq("organization_id",org).eq("id",row.id).eq("status","sent").eq("token_hash",row.token_hash).gt("expires_at",new Date().toISOString()).select("id").maybeSingle());
        if(!changed)throw new InputError("A situação do link mudou. Abra a solicitação novamente.");
      }
      return json({id:row.id,token,requires_customer_details:!row.bound_customer_id});
    }
    if(action==="review"){
      if(allowed.status!=="received")throw new InputError("A solicitação ainda não está disponível para revisão.");
      const intake=check(await admin.from("order_intake_requests").select("id,phone,payload,images,conversation_id,bound_customer_id").eq("organization_id",org).eq("id",allowed.id).single());
      const images=await Promise.all((intake.images||[]).map(async(im:any)=>{
        const signed=check(await admin.storage.from("service-images").createSignedUrl(im.path,600));
        return {key:im.mediaId,mediaId:im.mediaId,kind:im.kind,name:im.name,url:signed.signedUrl};
      }));
      return json({intake:{...intake,images}});
    }
    return json({error:"Ação inválida."},400);
  }catch(e){return json({error:e instanceof InputError||e instanceof IdentityError?e.message:"Não foi possível concluir. Tente novamente."},e instanceof IdentityError?e.status:e instanceof InputError?400:500);}
});
