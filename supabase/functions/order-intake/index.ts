import { createClient } from "npm:@supabase/supabase-js@2.112.3";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const clean=(v:unknown,max=160)=>typeof v==="string"?v.trim().slice(0,max):"";
const digits=(v:unknown)=>clean(v).replace(/\D/g,"");
const hash=async(token:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,"0")).join("");
const tokenValue=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
const ddCodes=new Set("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "));
const validPhone=(v:string)=>ddCodes.has(v.slice(0,2))&& !/^(\d)\1+$/.test(v) && /^(?:\d{2}[2-5]\d{7}|\d{2}9\d{8})$/.test(v);
const phoneOf=(v:unknown)=>{const p=digits(v);return /^[1-9]\d{9,10}$/.test(p)?"55"+p:p;};
function validCpf(c:string){if(!/^\d{11}$/.test(c)||/^(\d)\1{10}$/.test(c))return false;return [9,10].every(n=>{let sum=0;for(let i=0;i<n;i++)sum+=Number(c[i])*(n+1-i);return (sum*10%11)%10===Number(c[n]);});}
function validCnpj(c:string){if(!/^\d{14}$/.test(c)||/^(\d)\1{13}$/.test(c))return false;return [12,13].every(n=>{let s=0,w=2;for(let i=n-1;i>=0;i--){s+=Number(c[i])*w;w=w===9?2:w+1;}return (s%11<2?0:11-s%11)===Number(c[n]);});}
function check(r:any){if(r.error)throw new Error("Não foi possível concluir a operação.");return r.data;}
class InputError extends Error{}
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
    if(action==="open"||action==="models"||action==="submit"){
      const token=String(body.token||"");
      if(!/^[a-f0-9]{64}$/.test(token))return json({error:"Link inválido ou expirado."},404);
      const row=check(await admin.from("order_intake_requests").select("id,organization_id,created_by,status,expires_at").eq("token_hash",await hash(token)).maybeSingle());
      if(!row||Date.parse(row.expires_at)<Date.now()||row.status==="cancelled")return json({error:"Link inválido ou expirado. Peça outro à assistência."},404);
      if(["received","converted"].includes(row.status))return json({status:"received"});
      if(row.status==="submitting")return json({error:"Envio em andamento. Tente novamente em instantes."},409);
      const org=check(await admin.from("organizations").select("id,name,status").eq("id",row.organization_id).eq("status","active").maybeSingle());
      if(!org)return json({error:"Link indisponível."},404);
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
        return json({status:"filling",company:org.name,types,brands});
      }
      const p=body.payload||{}, a=p.address||{}, cpf=digits(p.document), name=clean(p.name), problem=clean(p.problem,2500);
      const phone=digits(p.phone);
      if(p.phone!=null&&p.phone!==""&&!validPhone(phone))throw new InputError("Informe um telefone válido com DDD ou deixe em branco.");
      if(name.length<3||(!validCpf(cpf)&&!validCnpj(cpf))||problem.length<5)throw new InputError("Confira nome, CPF/CNPJ e descrição do problema.");
      const address={zip_code:digits(a.zip_code),street:clean(a.street),number:clean(a.number,20),complement:clean(a.complement),neighborhood:clean(a.neighborhood),city:clean(a.city),state:clean(a.state,2).toUpperCase()};
      if(address.zip_code.length!==8||!address.street||!address.number||!address.neighborhood||!address.city||! /^[A-Z]{2}$/.test(address.state))throw new InputError("Complete o endereço.");
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
      const claim=check(await admin.from("order_intake_requests").update({status:"submitting"}).eq("id",row.id).in("status",["sent","filling"]).gt("expires_at",new Date().toISOString()).select("id").maybeSingle());
      if(!claim)return json({error:"Solicitação já enviada ou em processamento."},409);
      const stored:string[]=[], mediaIds:string[]=[], images:any[]=[];
      try{
        for(let i=0;i<files.length;i++){
          const f=files[i] as File, kind=kinds[i]==="label"?"label":"equipment";
          const filename=(kind==="label"?"Etiqueta":kinds[i]==="problem"?"Problema":"Equipamento")+"-"+(i+1)+".webp";
          const path="orders/"+org.id+"/draft/pre-os-"+row.id+"-"+crypto.randomUUID()+".webp";
          check(await admin.storage.from("service-images").upload(path,f,{contentType:"image/webp",upsert:false}));stored.push(path);
          const media=check(await admin.from("media").insert({organization_id:org.id,bucket_id:"service-images",storage_path:path,file_name:filename,mime_type:"image/webp",file_size:f.size,uploaded_by:row.created_by}).select("id").single());
          mediaIds.push(media.id);images.push({mediaId:media.id,path,kind,name:filename});
        }
        const saved=check(await admin.from("order_intake_requests").update({status:"received",submitted_at:new Date().toISOString(),payload:{name,document:cpf,phone:phone||null,address,problem,type_id:type.id,type_name:type.name,brand_id:brand?.id||null,brand_name:brand?.name||clean(p.brand_text),model:clean(p.model),serial:clean(p.serial)},images}).eq("id",row.id).eq("status","submitting").select("id").maybeSingle());
        if(!saved)throw new Error("Envio não confirmado.");
      }catch(e){
        // A confirmed submission must never be cleaned after an ambiguous network response.
        const state=await admin.from("order_intake_requests").select("status").eq("id",row.id).maybeSingle();
        if(!state.error&&state.data?.status==="received")return json({status:"received"});
        if(!state.error&&state.data?.status==="submitting"){
          if(mediaIds.length)await admin.from("media").delete().in("id",mediaIds).eq("organization_id",org.id);
          if(stored.length)await admin.storage.from("service-images").remove(stored);
          await admin.from("order_intake_requests").update({status:"filling"}).eq("id",row.id).eq("status","submitting");
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
      const token=tokenValue();
      // Bound active invitations per operator/conversation (new invitations can be cancelled).
      const existing=check(await admin.from("order_intake_requests").select("id").eq("organization_id",org).eq("conversation_id",conv.id).in("status",["sent","filling","submitting"]).gt("expires_at",new Date().toISOString()).limit(5));
      if(existing.length>=5)throw new InputError("Há links pendentes demais. Cancele os antigos antes de gerar outro.");
      check(await admin.from("order_intake_requests").insert({organization_id:org,conversation_id:conv.id,created_by:actor.id,phone,token_hash:await hash(token)}));
      return json({token});
    }
    let scope=admin.from("order_intake_requests").select("id,status,created_at,expires_at,submitted_at,order_id,conversation_id,created_by").eq("organization_id",org);
    if(!keys.has("orders.view_all"))scope=scope.eq("created_by",actor.id);
    if(action==="list"){
      if(body.conversation_id){if(!uuid(body.conversation_id))throw new InputError("Conversa inválida.");scope=scope.eq("conversation_id",body.conversation_id);}
      const page=Math.max(0,Math.min(10000,Math.trunc(Number(body.page)||0)));
      return json({rows:check(await scope.order("created_at",{ascending:false}).range(page*25,page*25+24))});
    }
    if(!uuid(body.id))throw new InputError("Solicitação inválida.");
    const allowed=check(await scope.eq("id",body.id).maybeSingle());
    if(!allowed)return json({error:"Solicitação não encontrada."},404);
    if(action==="cancel"){
      const cancelled=check(await admin.from("order_intake_requests").update({status:"cancelled"}).eq("id",allowed.id).eq("organization_id",org).in("status",["sent","filling"]).select("id").maybeSingle());
      if(!cancelled)throw new InputError("Só é possível cancelar links não enviados pelo cliente.");
      return json({status:"cancelled"});
    }
    if(action==="review"){
      if(allowed.status!=="received")throw new InputError("A solicitação ainda não está disponível para revisão.");
      const intake=check(await admin.from("order_intake_requests").select("id,phone,payload,images,conversation_id").eq("organization_id",org).eq("id",allowed.id).single());
      const images=await Promise.all((intake.images||[]).map(async(im:any)=>{
        const signed=check(await admin.storage.from("service-images").createSignedUrl(im.path,600));
        return {key:im.mediaId,mediaId:im.mediaId,kind:im.kind,name:im.name,url:signed.signedUrl};
      }));
      return json({intake:{...intake,images}});
    }
    return json({error:"Ação inválida."},400);
  }catch(e){return json({error:e instanceof InputError?e.message:"Não foi possível concluir. Tente novamente."},e instanceof InputError?400:500);}
});
