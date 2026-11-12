import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { createHash } from "node:crypto";

const respond = (data: Record<string, unknown>, status=200) =>
  new Response(JSON.stringify(data), {status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

type Recording = {id:string;organization_id:string;agent_id:string;event_id:string;scope:string;storage_path:string;status:string;expires_at:string;size_bytes:number;sha256:string;duration_seconds:number};
const ownRecording=(r:Recording,a:{id:string;organization_id:string})=>r&&uuid.test(r.id)&&r.organization_id===a.organization_id&&r.agent_id===a.id&&r.storage_path===`${a.organization_id}/${r.id}.wav`;
// Bounded prefix parsing and incremental hashing keep a long call out of memory.
async function verifyRecording(response:Response,r:Recording):Promise<boolean>{
  if(!response.ok||!response.body)throw Error('Recording unavailable');
  const reader=response.body.getReader(),hash=createHash('sha256'),prefix=new Uint8Array(4096);
  let count=0,prefixLength=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;
      count+=value.length;if(count>128000044||count>Number(r.size_bytes)){await reader.cancel();return false;}
      hash.update(value);const n=Math.min(value.length,prefix.length-prefixLength);prefix.set(value.subarray(0,n),prefixLength);prefixLength+=n;
    }
  }finally{reader.releaseLock();}
  if(count!==Number(r.size_bytes)||hash.digest('hex')!==r.sha256||prefixLength<44)return false;
  const view=new DataView(prefix.buffer),tag=(n:number)=>String.fromCharCode(...prefix.subarray(n,n+4));
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||view.getUint32(4,true)+8!==count)return false;
  let offset=12,format=false;
  while(offset+8<=prefixLength){
    const kind=tag(offset),size=view.getUint32(offset+4,true),start=offset+8;
    if(kind==='fmt '){
      if(format||size<16||start+size>prefixLength)return false;
      format=view.getUint16(start,true)===1&&view.getUint16(start+2,true)===1&&view.getUint32(start+4,true)===8000&&view.getUint32(start+8,true)===16000&&view.getUint16(start+12,true)===2&&view.getUint16(start+14,true)===16;
      if(!format)return false;
    }
    if(kind==='data')return format&&size>0&&size%2===0&&start+size===count&&Math.abs(size/16000-Number(r.duration_seconds))<=1/8000;
    offset=start+size+(size%2);
  }
  return false;
}

async function recordingTransfer(admin:ReturnType<typeof createClient>,agent:{id:string;organization_id:string},transfer:Record<string,unknown>,url:string,key:string,isPlatform=false){
  const reject=()=>respond({error:'Gravação não confirmada'},400);
  if(transfer.kind==='prepare'){
    const record=transfer.record as Record<string,unknown>;
    if(!record||typeof record!=='object'||Array.isArray(record)||typeof record.event_id!=='string'||record.event_id.length>240||!uuid.test(String(record.policy_revision))||!['internal','inbound','outbound'].includes(String(record.scope))||!Number.isSafeInteger(record.size_bytes)||Number(record.size_bytes)<44||Number(record.size_bytes)>128000044||!/^[a-f0-9]{64}$/.test(String(record.sha256))||typeof record.duration_seconds!=='number'||!Number.isFinite(record.duration_seconds)||record.duration_seconds<=0)return reject();
    const {data:r,error}=await admin.rpc('pbx_prepare_recording_upload',{p_agent_id:agent.id,p_record:{event_id:record.event_id,policy_revision:record.policy_revision,scope:record.scope,size_bytes:record.size_bytes,sha256:record.sha256,duration_seconds:record.duration_seconds}});
    if(error||!ownRecording(r,agent))return reject();
    if(r.status==='ready')return respond({accepted:true,already_ready:true,id:r.id,event_id:r.event_id,scope:r.scope});
    if(r.status!=='uploading'||Date.parse(r.expires_at)<=Date.now())return reject();
    const signed=await admin.storage.from('pbx-call-recordings').createSignedUploadUrl(r.storage_path,{upsert:false});
    if(signed.error||!signed.data?.signedUrl)return respond({error:'Envio indisponível'},503);
    return respond({accepted:true,id:r.id,path:r.storage_path,signed_url:signed.data.signedUrl,event_id:r.event_id,scope:r.scope,sha256:r.sha256,size_bytes:r.size_bytes});
  }
  if(transfer.kind==='complete'){
    if(!uuid.test(String(transfer.recording_id)))return reject();
    // This capability-gated RPC precedes even metadata/Storage access. Generic
    // signed reports alone must never refresh or bypass recording admission.
    const capability=await admin.rpc('pbx_poll_recording_policy',{p_agent_id:agent.id});
    if(capability.error||!capability.data)return reject();
    const {data:r,error}=await admin.from('pbx_call_recordings').select('id,organization_id,agent_id,event_id,scope,storage_path,status,expires_at,size_bytes,sha256,duration_seconds').eq('agent_id',agent.id).eq('organization_id',agent.organization_id).eq('id',transfer.recording_id).maybeSingle();
    if(error||!ownRecording(r,agent)||Date.parse(r.expires_at)<=Date.now())return reject();
    if(r.status==='ready')return respond({accepted:true,id:r.id});
    if(r.status!=='uploading')return reject();
    let valid:boolean;
    try{valid=await verifyRecording(await fetch(`${url.replace(/\/$/,'')}/storage/v1/object/authenticated/pbx-call-recordings/${r.storage_path}`,{headers:{Authorization:`Bearer ${key}`,apikey:key},redirect:'error',signal:AbortSignal.timeout(20000)}),r);}catch{return respond({error:'Verificação indisponível'},503);}
    if(!valid){await admin.storage.from('pbx-call-recordings').remove([r.storage_path]);return reject();}
    const result=await admin.rpc('pbx_finish_recording_upload',{p_agent_id:agent.id,p_recording_id:r.id});
    if(result.error)return respond({error:'Gravação não confirmada'},503);
    return respond({accepted:result.data===true,id:r.id});
  }
  if(transfer.kind==='purge'){
    const claim=await admin.rpc('pbx_claim_recording_purge',{p_agent_id:agent.id});
    if(claim.error||!Array.isArray(claim.data)||claim.data.length>10)return reject();
    // Only the trusted platform admission can service global expired claims.
    // Partners remain restricted to their own org; bodies never supply paths.
    if(!claim.data.every((r:{id:string;storage_path:string;organization_id?:string})=>{
      const owner=isPlatform&&typeof r.organization_id==='string'&&uuid.test(r.organization_id)?r.organization_id:agent.organization_id;
      return uuid.test(r.id)&&r.storage_path===`${owner}/${r.id}.wav`;
    }))return reject();
    let acknowledged=0;
    for(const r of claim.data){const removed=await admin.storage.from('pbx-call-recordings').remove([r.storage_path]);if(removed.error)continue;
      const done=await admin.rpc('pbx_finish_recording_purge',{p_agent_id:agent.id,p_recording_id:r.id});if(!done.error&&done.data===true)acknowledged++;
    }
    return respond({accepted:true,acknowledged});
  }
  return reject();
}

async function loadFlowJobs(admin:ReturnType<typeof createClient>,organizationId:string){
  const {data:flows,error}=await admin.from('pbx_call_flows')
    .select('id,organization_id,name,test_extension,enabled,updated_at,config')
    .eq('organization_id',organizationId).eq('provisioning_status','pending').order('updated_at').limit(2);
  if(error) throw Error('Flow lookup failed');
  const result=[];
  for(const flow of flows||[]){
    if(!flow.enabled){result.push({flow,extensions:[],queues:[],prompts:[]});continue;}
    const targets=[flow.config.fallback,flow.config.closed_target,...flow.config.options.map((option:{target:unknown})=>option.target)];
    const extensionIds=[...new Set(targets.filter(target=>target.kind==='extension').map(target=>target.id))];
    const queueIds=[...new Set(targets.filter(target=>target.kind==='queue').map(target=>target.id))];
    const promptIds=[...new Set([flow.config.prompt_id,flow.config.closed_prompt_id].filter(Boolean))];
    const [extensions,queues,prompts]=await Promise.all([
      extensionIds.length?admin.from('pbx_extensions').select('id,organization_id,number,endpoint_name,desired_enabled,provisioning_status')
        .eq('organization_id',organizationId).in('id',extensionIds):Promise.resolve({data:[],error:null}),
      queueIds.length?admin.from('pbx_queues').select('id,organization_id,test_extension,enabled,provisioning_status')
        .eq('organization_id',organizationId).in('id',queueIds):Promise.resolve({data:[],error:null}),
      promptIds.length?admin.from('pbx_audio_prompts').select('id,organization_id,storage_path,sha256,duration_seconds,size_bytes,status')
        .eq('organization_id',organizationId).in('id',promptIds):Promise.resolve({data:[],error:null}),
    ]);
    if(extensions.error||queues.error||prompts.error||extensions.data?.length!==extensionIds.length||
       queues.data?.length!==queueIds.length||prompts.data?.length!==promptIds.length)throw Error('Flow resources unavailable');
    const assets=[];
    for(const prompt of prompts.data||[]){
      if(prompt.status!=='uploaded'||prompt.storage_path!==`${organizationId}/${prompt.id}.wav`)throw Error('Invalid flow asset');
      const {data,error:signError}=await admin.storage.from('pbx-audio-prompts').createSignedUrl(prompt.storage_path,120);
      if(signError||!data?.signedUrl)throw Error('Private flow asset unavailable');
      assets.push({id:prompt.id,organization_id:organizationId,sha256:prompt.sha256,
        duration_seconds:Number(prompt.duration_seconds),size_bytes:prompt.size_bytes,url:data.signedUrl});
    }
    result.push({flow,extensions:(extensions.data||[]).map(item=>({id:item.id,organization_id:item.organization_id,
      number:item.number,endpoint:item.endpoint_name,enabled:item.desired_enabled})),queues:queues.data||[],prompts:assets});
  }
  return result;
}

Deno.serve(async request=>{
  if(request.method!=="POST") return respond({error:"Método não permitido"},405);
  if((request.headers.get("content-type")||"").split(";")[0]!=="application/json") return respond({error:"Content-Type inválido"},415);
  if(Number(request.headers.get("content-length")||"0")>16000) return respond({error:"Tamanho inválido"},413);
  const raw=await request.text();
  if(raw.length>16000) return respond({error:"Tamanho inválido"},413);
  const url=Deno.env.get("SUPABASE_URL");
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key) return respond({error:"Ponte não configurada"},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const id=request.headers.get("X-Pbx-Agent")||"";
  const time=request.headers.get("X-Pbx-Time")||"";
  const seqRaw=request.headers.get("X-Pbx-Sequence")||"";
  const signature=request.headers.get("X-Pbx-Signature")||"";
  const seq=Number(seqRaw);
  if(!uuid.test(id)||!/^[0-9]{13}$/.test(time)||!/^[1-9][0-9]{0,13}$/.test(seqRaw)||
     !Number.isSafeInteger(seq)||Math.abs(Date.now()-Number(time))>120000||
     !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return respond({error:"Identificação inválida"},401);
  try {
    const {data:agent,error:lookupError}=await admin.from("pbx_agents")
      .select("id,organization_id,public_key,enabled,last_sequence").eq("id",id).maybeSingle();
    if(lookupError||!agent?.enabled||seq<=Number(agent.last_sequence)) return respond({error:"Agente não autorizado"},401);
    const publicKey=await crypto.subtle.importKey("raw",decode(agent.public_key) as BufferSource,{name:"Ed25519"},false,["verify"]);
    const signedText=time+"\n"+seqRaw+"\n"+raw;
    const verified=await crypto.subtle.verify("Ed25519",publicKey,decode(signature) as BufferSource,new TextEncoder().encode(signedText));
    if(!verified) return respond({error:"Assinatura inválida"},401);
    let body:Record<string,unknown>;
    try {
      body=JSON.parse(raw);
      if(!body||typeof body!=="object"||Array.isArray(body)) throw Error();
    } catch {return respond({error:"JSON inválido"},400)}
    const {data:advanced,error:advanceError}=await admin.from("pbx_agents")
      .update({last_sequence:seq,last_seen_at:new Date().toISOString()})
      .eq("id",agent.id).eq("enabled",true).lt("last_sequence",seq).select("id").maybeSingle();
    if(advanceError||!advanced) return respond({error:"Requisição repetida ou agente revogado"},409);
    // Admission is service-only and runs AFTER Ed25519 verification and the
    // atomic replay barrier. Generic reports never refresh capability freshness.
    const {data:admission,error:admissionError}=await admin.rpc("pbx_admit_agent_request",{
      p_agent_id:agent.id,p_sequence:seq,p_action:typeof body.action==="string"?body.action:"",
      p_protocol_version:typeof body.protocol_version==="number"&&Number.isInteger(body.protocol_version)?body.protocol_version:null,
      p_profile_id:typeof body.profile_id==="string"?body.profile_id:null,
      p_profile_context:typeof body.profile_context==="string"?body.profile_context:null,
    });
    if(admissionError) return respond({error:"Não foi possível validar a capacidade do agente"},503);
    if(admission?.allowed!==true) return respond({error:"Agente sem capacidade de operação para esta empresa"},403);
    const isPlatform=admission.is_platform===true;
    if(body.action==="poll"){
      // Telemetria enviada no mesmo ciclo assinado, sem conexao adicional
      // e sem bloquear ramais ou a entrega de credenciais em caso de falha.
      const telemetry = Array.isArray(body.telemetry) ? body.telemetry : [];
      if(telemetry.length <= 10 && telemetry.length > 0) {
        const states = new Set(["available","busy","ringing","paused","unavailable","unknown"]);
        const valid = telemetry.every((entry:unknown) => {
          if(!entry || typeof entry!=="object" || Array.isArray(entry)) return false;
          const item=entry as Record<string,unknown>;
          if(typeof item.queue_id!=="string" || !uuid.test(item.queue_id) ||
            !["active","missing"].includes(String(item.queue_state)) ||
            typeof item.waiting_count!=="number" || !Number.isInteger(item.waiting_count) ||
            Number(item.waiting_count)<0 || Number(item.waiting_count)>500 ||
            !Array.isArray(item.members) || item.members.length>20) return false;
          const nums=new Set<number>();
          return item.members.every((member:unknown)=>{
            if(!member || typeof member!=="object" || Array.isArray(member)) return false;
            const m=member as Record<string,unknown>;
            const num=Number(m.number);
            if(typeof m.number!=="number" || !Number.isInteger(num) ||
              num<100 || num>9999 || !states.has(String(m.state)) || nums.has(num)) return false;
            nums.add(num);
            return true;
          });
        });
        if(valid){
          const ids=telemetry.map((entry:{queue_id:string})=>entry.queue_id);
          if(new Set(ids).size!==ids.length) return respond({error:"Identificadores de fila duplicados"},400);
          const {data:allowed,error:verifyError}=await admin.from("pbx_queues")
            .select("id").eq("organization_id",agent.organization_id)
            .eq("enabled",true).eq("provisioning_status","applied").in("id",ids);
          if(!verifyError && allowed?.length){
            const allowedIds=new Set(allowed.map(q=>q.id));
            const sampledAt=new Date().toISOString();
            const rows=telemetry.filter((entry:{queue_id:string})=>allowedIds.has(entry.queue_id))
              .map((entry:{queue_id:string;queue_state:string;waiting_count:number;members:unknown[]})=>({
                queue_id:entry.queue_id,
                organization_id:agent.organization_id,
                waiting_count:entry.waiting_count,
                queue_state:entry.queue_state,
                members:entry.members,
                sampled_at:sampledAt,
              }));
            if(rows.length){
              const {error:telemetryError}=await admin.from("pbx_queue_live_status")
                .upsert(rows,{onConflict:"queue_id"});
              if(telemetryError) console.error("PBX telemetry storage failed",telemetryError.code);
            }
          } else if(verifyError) console.error("PBX telemetry authorization failed",verifyError.code);
        } else {
          console.error("PBX telemetry malformed");
        }
      }
      // Apaga segredos criptografados que expiraram. O navegador só pode obtê-los uma vez.
      const expiredAt=new Date().toISOString();
      const {error:cleanupError}=await admin.from("pbx_browser_login_requests")
        .update({status:"failed",encrypted_secret:null})
        .eq("organization_id",agent.organization_id)
        .eq("status","ready").lt("expires_at",expiredAt);
      if(cleanupError) return respond({error:"Falha na limpeza de credenciais expiradas"},503);
      // Remove registros antigos; mantém apenas evidências recentes sem senha.
      const retention=new Date(Date.now()-24*3600*1000).toISOString();
      await admin.from("pbx_browser_login_requests").delete().eq("organization_id",agent.organization_id).lt("created_at",retention);
      const {data,error}=await admin.from("pbx_extensions")
        .select("id,organization_id,number,endpoint_name,desired_enabled,updated_at")
        .eq("organization_id",agent.organization_id).eq("is_managed",true)
        .eq("provisioning_status","pending").order("updated_at").limit(10);
      if(error) return respond({error:"Erro ao consultar ramais"},503);
      const {data:loginRequests,error:loginError}=await admin.from("pbx_browser_login_requests")
        .select("id,organization_id,extension_id,public_key_base64,expires_at")
        .eq("organization_id",agent.organization_id)
        .eq("agent_id",agent.id)
        .eq("status","pending")
        .gt("expires_at",new Date().toISOString())
        .order("created_at")
        .limit(10);
      if(loginError) return respond({error:"Erro ao consultar solicitações de acesso"},503);
      // As filas só são provisionadas por um agente de mesma organização.
      // Busca duas coleções pequenas, evitando um join de múltiplas filas por requisição.
      const {data:queues,error:queuesError}=await admin.from("pbx_queues")
        .select("id,organization_id,name,test_extension,strategy,ring_seconds,max_wait_seconds,enabled,updated_at")
        .eq("organization_id",agent.organization_id).eq("provisioning_status","pending")
        .order("updated_at").limit(10);
      if(queuesError) return respond({error:"Não foi possível consultar filas"},503);
      let queueJobs:Record<string,unknown>[]=[];
      if(queues?.length){
        const {data:members,error:membersError}=await admin.from("pbx_queue_members")
          .select("queue_id,position,pbx_extensions(organization_id,number,endpoint_name,desired_enabled,provisioning_status)")
          .in("queue_id",queues.map(queue=>queue.id)).order("position");
        if(membersError) return respond({error:"Não foi possível consultar membros da fila"},503);
        queueJobs=queues.map(queue=>({
          ...queue,
          members:(members||[]).filter(member=>member.queue_id===queue.id).map(member=>({
            position:member.position,
            organization_id:(member.pbx_extensions as unknown as {organization_id:string}|null)?.organization_id,
            number:(member.pbx_extensions as unknown as {number:number}|null)?.number,
            endpoint_name:(member.pbx_extensions as unknown as {endpoint_name:string}|null)?.endpoint_name,
            desired_enabled:(member.pbx_extensions as unknown as {desired_enabled:boolean}|null)?.desired_enabled,
            provisioning_status:(member.pbx_extensions as unknown as {provisioning_status:string}|null)?.provisioning_status,
          })),
        }));
      }
      // A missing history registry must never block provisioning or phone login.
      const historyEndpoints = new Set<string>();
      const historySignal=AbortSignal.timeout(2000);
      const [extensionHistory,trunkHistory]=await Promise.all([
        admin.from("pbx_extensions").select("endpoint_name")
          .eq("organization_id",agent.organization_id).limit(1001).abortSignal(historySignal),
        isPlatform?admin.from("pbx_trunks").select("inbound_endpoint,outbound_endpoint")
          .eq("organization_id",agent.organization_id).eq("agent_id",agent.id).limit(101).abortSignal(historySignal)
          :Promise.resolve({data:[],error:null}),
      ]);
      const {data:ownedExtensions,error:extensionHistoryError}=extensionHistory;
      const {data:ownedTrunks,error:trunkHistoryError}=trunkHistory;
      if(!extensionHistoryError && !trunkHistoryError &&
         (ownedExtensions?.length||0)<=1000 && (ownedTrunks?.length||0)<=100){
        for(const extension of ownedExtensions||[]) historyEndpoints.add(extension.endpoint_name);
        for(const trunk of ownedTrunks||[]){
          historyEndpoints.add(trunk.inbound_endpoint); historyEndpoints.add(trunk.outbound_endpoint);
        }
      }
      let availabilityJobs:unknown[]=[];
      if(body.protocol_version===2||body.protocol_version===3){
        const {data:availability,error:availabilityError}=await admin.rpc("pbx_poll_queue_availability",{p_agent_id:agent.id});
        if(!availabilityError && Array.isArray(availability) && availability.length<=10) availabilityJobs=availability;
      }
      let flowJobs:unknown[]=[];
      if(Array.isArray(body.features)&&body.features.length<=10&&body.features.includes('flows-v1')){
        // A legacy agent never receives commands for uninstalled media support.
        // Failure here must not block phone login, queue control or call history.
        try{flowJobs=await loadFlowJobs(admin,agent.organization_id);}
        catch{console.error('PBX flow resources unavailable');}
      }
      let sipTrunks:unknown[]|undefined;
      if(!isPlatform&&body.protocol_version===3&&Array.isArray(body.features)&&body.features.length<=10&&body.features.includes('sip_trunks_v1')){
        // Optional support must never prevent existing phone logins. No secret
        // is selected before the verified profile's fresh capability admission.
        try{
          const admitted=await admin.rpc('pbx_admit_sip_trunk_poll',{p_agent_id:agent.id,p_sequence:seq,p_features:body.features});
          if(!admitted.error&&admitted.data===true){
            const result=await admin.rpc('pbx_poll_sip_trunks',{p_agent_id:agent.id});
            if(!result.error&&Array.isArray(result.data)&&result.data.length<=100)sipTrunks=result.data;
            const history=await admin.rpc('pbx_sip_history_endpoints',{p_agent_id:agent.id});
            const prefix=`uwt-${agent.organization_id.replaceAll('-','')}-`;
            if(!history.error&&Array.isArray(history.data)&&history.data.length<=100&&
              history.data.every((endpoint:unknown)=>typeof endpoint==='string'&&endpoint.startsWith(prefix)&&/^uwt-[a-f0-9]{32}-[a-f0-9]{32}-ep$/.test(endpoint))){
              for(const endpoint of history.data)historyEndpoints.add(endpoint);
            }
          }
        }catch{console.error('PBX SIP configuration unavailable');}
      }
      let recordingPolicy:unknown=undefined;
      if((body.protocol_version===2||body.protocol_version===3)&&Array.isArray(body.features)&&body.features.length<=10&&body.features.every(feature=>typeof feature==='string')&&body.features.includes('recordings_v1')){
        try{
          const admitted=await admin.rpc('pbx_admit_recording_poll',{p_agent_id:agent.id,p_sequence:seq,p_features:body.features});
          if(!admitted.error&&admitted.data===true){
            const report=body.recording_report as Record<string,unknown>|undefined;
            if(report&&uuid.test(String(report.revision))&&['applied','failed'].includes(String(report.status)))await admin.rpc('pbx_report_recording_policy',{p_agent_id:agent.id,p_revision:report.revision,p_status:report.status,p_error:report.status==='failed'?'Recording policy application failed':null});
            const policy=await admin.rpc('pbx_poll_recording_policy',{p_agent_id:agent.id});
            if(!policy.error){
              recordingPolicy=policy.data;
              const p=policy.data;
              if(p?.organization_id!==undefined&&p.organization_id!==agent.organization_id)throw Error('Invalid policy');
              if(p?.notice_enabled&&p.notice_prompt){
                const prompt=p.notice_prompt;
                if(!uuid.test(prompt.id)||prompt.storage_path!==`${agent.organization_id}/${prompt.id}.wav`)throw Error('Invalid notice');
                const signed=await admin.storage.from('pbx-audio-prompts').createSignedUrl(prompt.storage_path,120);
                if(signed.error||!signed.data?.signedUrl)throw Error('Notice unavailable');
                recordingPolicy={...p,notice_prompt:{...prompt,url:signed.data.signedUrl}};
              }
            }
          }
        }catch{recordingPolicy=undefined;console.error('PBX recording configuration unavailable');}
      }
      return respond({jobs:data||[],login_requests:loginRequests||[],queue_jobs:queueJobs,
        history_endpoints: [...historyEndpoints],availability_jobs:availabilityJobs,flow_jobs:flowJobs,
        ...(sipTrunks===undefined?{}:{sip_trunks:sipTrunks}),...(recordingPolicy===undefined?{}:{recording_policy:recordingPolicy})});
    }
    if(body.action==='report_sip_trunks'){
      if(!Array.isArray(body.results)||body.results.length<1||body.results.length>200)return respond({error:'Confirmação de troncos inválida'},400);
      const {data,error}=await admin.rpc('pbx_report_sip_trunks',{p_agent_id:agent.id,p_results:body.results});
      if(error||typeof data?.acknowledged!=='number')return respond({error:'Troncos sem confirmação'},503);
      return respond({accepted:true,acknowledged:data.acknowledged});
    }
    if(body.action==="report_availability"){
      if(!Array.isArray(body.results)||body.results.length<1||body.results.length>10)
        return respond({error:"Lote de disponibilidade inválido"},400);
      const {data,error}=await admin.rpc("pbx_report_queue_availability",{
        p_agent_id:agent.id,p_results:body.results,
      });
      if(error || data?.accepted!==true) return respond({error:"Disponibilidade não confirmada"},503);
      return respond({accepted:true,acknowledged:data.acknowledged});
    }
    if(body.action==="report_calls"){
      if(body.records===undefined&&body.recording_transfer&&typeof body.recording_transfer==='object'&&!Array.isArray(body.recording_transfer)){
        return await recordingTransfer(admin,agent,body.recording_transfer as Record<string,unknown>,url,key,isPlatform);
      }
      if(!Array.isArray(body.records)||body.records.length<1||body.records.length>10)
        return respond({error:"Lote de chamadas inválido"},400);
      const {data,error}=await admin.rpc("pbx_ingest_call_records",{
        p_agent_id:agent.id,p_records:body.records,
      });
      if(error){
        // Do not log callers, destinations or raw database error messages.
        console.error("PBX call metadata rejected",error.code);
        return respond({error:"Histórico não confirmado"},["23514","22007","22008","22P02"].includes(error.code)?400:503);
      }
      if(data?.accepted!==true) return respond({error:"Histórico não confirmado"},503);
      if(body.recording_transfer&&typeof body.recording_transfer==='object'&&!Array.isArray(body.recording_transfer)){
        return await recordingTransfer(admin,agent,body.recording_transfer as Record<string,unknown>,url,key,isPlatform);
      }
      return respond({accepted:true,acknowledged:data.acknowledged});
    }
    if(body.action==='report_flow'){
      const flowId=String(body.id||''),version=String(body.version||''),status=String(body.status||'');
      if(!uuid.test(flowId)||!/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(version)||
         !['applied','failed'].includes(status))return respond({error:'Confirmação de fluxo inválida'},400);
      const {data,error}=await admin.from('pbx_call_flows').update({provisioning_status:status,
        last_error:status==='failed'?'A central não conseguiu aplicar este fluxo. Confira avisos e destinos.':null})
        .eq('id',flowId).eq('organization_id',agent.organization_id).eq('provisioning_status','pending')
        .eq('updated_at',version).select('id').maybeSingle();
      if(error)return respond({error:'Fluxo sem confirmação'},503);
      return respond({accepted:Boolean(data),stale:!data});
    }
    if(body.action==="report_queue"){
      const queueId=String(body.id||""),version=String(body.version||""),status=String(body.status||"");
      if(!uuid.test(queueId)||
        !/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(version)||
        !["applied","failed"].includes(status)) return respond({error:"Confirmação de fila inválida"},400);
      const errorText=status==="failed"?String(body.error||"Falha ao configurar fila").slice(0,240):null;
      const {data,error}=await admin.from("pbx_queues")
        .update({provisioning_status:status,last_error:errorText})
        .eq("id",queueId).eq("organization_id",agent.organization_id)
        .eq("provisioning_status","pending").eq("updated_at",version).select("id").maybeSingle();
      if(error) return respond({error:"Falha ao confirmar configuração de fila"},503);
      return respond({accepted:Boolean(data),stale:!data});
    }
    if(body.action==="report_login"){
      const requestId=String(body.id||""),ciphertext=String(body.ciphertext||"");
      if(!uuid.test(requestId)||!/^[A-Za-z0-9+/]{342}==$/.test(ciphertext)) {
        return respond({error:"Resposta criptografada inválida"},400);
      }
      const {data,error}=await admin.from("pbx_browser_login_requests")
        .update({status:"ready",encrypted_secret:ciphertext,fulfilled_at:new Date().toISOString()})
        .eq("id",requestId).eq("organization_id",agent.organization_id)
        .eq("agent_id",agent.id)
        .eq("status","pending").gt("expires_at",new Date().toISOString())
        .select("id").maybeSingle();
      if(error) return respond({error:"Não foi possível entregar a credencial criptografada"},503);
      return respond({accepted:Boolean(data)});
    }
    if(body.action==="report"){
      const jobId=String(body.id||""),version=String(body.version||""),status=String(body.status||"");
      if(!uuid.test(jobId)||!/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(version)||
        !["applied","failed"].includes(status)) return respond({error:"Confirmação inválida"},400);
      const errorText=status==="failed"?String(body.error||"Falha na VPS").slice(0,240):null;
      const {data,error}=await admin.from("pbx_extensions")
        .update({provisioning_status:status,last_error:errorText})
        .eq("id",jobId).eq("organization_id",agent.organization_id)
        .eq("is_managed",true).eq("provisioning_status","pending")
        .eq("updated_at",version).select("id").maybeSingle();
      if(error) return respond({error:"Erro ao confirmar operação"},503);
      return respond({accepted:Boolean(data),stale:!data});
    }
    return respond({error:"Ação desconhecida"},400);
  } catch(error){
    console.error("PBX bridge error",error instanceof Error?error.name:"unknown");
    return respond({error:"Falha temporária da ponte"},503);
  }
});
