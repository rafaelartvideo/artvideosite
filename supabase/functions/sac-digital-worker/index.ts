import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {runJobs} from "../_shared/sac-events.mjs";
Deno.serve(async request=>{
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url || !key) return Response.json({success:false}, {status:503});
 if(request.method!=='POST') return Response.json({success:false},{status:405});

 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await admin.rpc(name,args);if(error)throw error;return data;};
 let authorized=request.headers.get('Authorization')===`Bearer ${key}`;
 if(!authorized){
  const token=request.headers.get('x-sac-worker-key')||'';
  if(/^[0-9a-f]{64}$/.test(token)) {try{authorized=(await rpc('verify_sac_digital_worker_token',{p_token:token}))===true;}catch{authorized=false;}}
 }
 if(!authorized)return Response.json({success:false},{status:401});

 try {const body=await request.json().catch(()=>({}));const data=await runJobs({limit:Number(body.limit)||20,
 claim:()=>rpc('claim_sac_digital_jobs',{p_limit:1,p_organization_id:typeof body.organization_id==='string'?body.organization_id:null}),
 execute:async(job: any)=>{
  if(job.kind==='cleanup'){const candidates=await rpc('sac_digital_orphan_media_candidates',{p_organization_id:job.organization_id});if(candidates?.length){const {error}=await admin.storage.from('sac-digital-attachments').remove(candidates.map((r:any)=>r.path));if(error)throw error;}return;}
  if(job.kind==='projection'){await rpc('project_sac_digital_webhook_event',{p_event_id:job.event_id});return;}
  for(const action of ['enrich_protocol','sync_protocol_history']){
   const response=await fetch(`${url}/functions/v1/sac-digital-api`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({action,organization_id:job.organization_id,protocol:job.protocol}),signal:AbortSignal.timeout(25000)});
   const result=await response.json();if(!response.ok || result.success===false || result.status===false)throw Error('reconciliation failed');
  }
 },finish:(job:any,error:string|null)=>rpc('finish_sac_digital_job',{p_id:job.id,p_lease:job.lease_token,p_error:error})});return Response.json({success:true,data});
 }catch{return Response.json({success:false,error:'Worker indisponível.'},{status:503});}
});
