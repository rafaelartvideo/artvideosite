import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const respond = (data: Record<string, unknown>, status=200) =>
  new Response(JSON.stringify(data), {status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

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
    const {data:advanced,error:advanceError}=await admin.from("pbx_agents")
      .update({last_sequence:seq,last_seen_at:new Date().toISOString()})
      .eq("id",agent.id).eq("enabled",true).lt("last_sequence",seq).select("id").maybeSingle();
    if(advanceError||!advanced) return respond({error:"Requisição repetida ou agente revogado"},409);
    let body:Record<string,unknown>;
    try {
      body=JSON.parse(raw);
      if(!body||typeof body!=="object"||Array.isArray(body)) throw Error();
    } catch {return respond({error:"JSON inválido"},400)}
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
            !Number.isInteger(item.waiting_count) ||
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
        .eq("status","ready").lt("expires_at",expiredAt);
      if(cleanupError) return respond({error:"Falha na limpeza de credenciais expiradas"},503);
      // Remove registros antigos; mantém apenas evidências recentes sem senha.
      const retention=new Date(Date.now()-24*3600*1000).toISOString();
      await admin.from("pbx_browser_login_requests").delete().lt("created_at",retention);
      const {data,error}=await admin.from("pbx_extensions")
        .select("id,organization_id,number,endpoint_name,desired_enabled,updated_at")
        .eq("organization_id",agent.organization_id).eq("is_managed",true)
        .eq("provisioning_status","pending").order("updated_at").limit(10);
      if(error) return respond({error:"Erro ao consultar ramais"},503);
      const {data:loginRequests,error:loginError}=await admin.from("pbx_browser_login_requests")
        .select("id,organization_id,extension_id,public_key_base64,expires_at")
        .eq("organization_id",agent.organization_id)
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
      return respond({jobs:data||[],login_requests:loginRequests||[],queue_jobs:queueJobs});
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
