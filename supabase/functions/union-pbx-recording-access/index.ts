import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const origins=new Set(['https://unionworld.com.br','https://www.unionworld.com.br','http://localhost:5173']);

Deno.serve(async request=>{
 const origin=request.headers.get('Origin');
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info';
 headers['Access-Control-Allow-Methods']='POST,OPTIONS';
 const respond=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return respond({error:'Acesso indisponível.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return respond({error:'Método não permitido.'},405);
 const authorization=request.headers.get('Authorization')||'';
 if(!/^Bearer [^\r\n ]{1,6000}$/.test(authorization))return respond({error:'Autenticação necessária.'},401);
 try{
  if(Number(request.headers.get('Content-Length')||0)>1000)return respond({error:'Solicitação inválida.'},400);
  const raw=await request.text();if(raw.length>1000)return respond({error:'Solicitação inválida.'},400);
  const body=JSON.parse(raw);
  if(!body||typeof body.recording_id!=='string'||!uuid.test(body.recording_id))return respond({error:'Solicitação inválida.'},400);
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)return respond({error:'Serviço indisponível.'},503);
  const user=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const session=await user.auth.getUser();
  if(session.error||!session.data.user)return respond({error:'Autenticação necessária.'},401);
  // The user-scoped invoker checks active membership, module, the separate
  // playback permission, exact recording ownership, readiness and retention.
  const permitted=await user.rpc('pbx_authorize_recording_playback',{p_recording_id:body.recording_id});
  const metadata=permitted.data;
  const ttl=Math.min(60,Math.floor((Date.parse(metadata?.expires_at)-Date.now())/1000)-2);
  if(permitted.error||!metadata||typeof metadata.path!=='string'||!Number.isFinite(ttl)||ttl<1||
    !new RegExp('^[a-f0-9-]{36}/'+body.recording_id+'\\.wav$','i').test(metadata.path))return respond({error:'Gravação indisponível.'},403);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await admin.storage.from('pbx-call-recordings').createSignedUrl(metadata.path,ttl);
  if(signed.error||typeof signed.data?.signedUrl!=='string')return respond({error:'Gravação indisponível.'},503);
  return respond({url:signed.data.signedUrl,expires_at:new Date(Date.now()+ttl*1000).toISOString()});
 }catch{return respond({error:'Gravação indisponível.'},503);}
});
