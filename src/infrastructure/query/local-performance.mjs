const CONTEXT_KEYS=['build','session','user','organization','screen','network','cache','visibility','visit'];
const contextOnly=value=>Object.fromEntries(CONTEXT_KEYS.filter(k=>typeof value?.[k]==='string').map(k=>[k,value[k].slice(0,120)]));
export function rpcName(input) {
  try { const path=new URL(typeof input==='string'||input instanceof URL?input:input.url).pathname;
    return path.match(/^\/rest\/v1\/rpc\/([a-z][a-z0-9_]{0,79})$/)?.[1]??null;
  } catch { return null; }
}
export function summarize(rows) {
  const values=rows.filter(r=>r.outcome==='success').map(r=>r.durationMs).sort((a,b)=>a-b);
  const q=(p,min)=>values.length>=min?values[Math.ceil(values.length*p)-1]:null;
  return {total:rows.length,success:values.length,errors:rows.filter(r=>!['success','interrupted','hidden'].includes(r.outcome)).length,
    censored:rows.filter(r=>['interrupted','hidden'].includes(r.outcome)).length,p50:q(.5,30),p95:q(.95,200),p99:q(.99,1000)};
}
export function createLocalPerformance({now=()=>performance.now(),maxSamples=25000,maxDurationMs=8*3600000}={}) {
  let enabled=false,until=0,startedAt=null,collectionStart=0,ctx={},samples=[],dropped=0,generation=0;
  const pending=new Set();
  const active=()=>enabled&&now()<until;
  const record=(kind,name,durationMs,outcome,context=ctx)=>{
    if(!active()||!Number.isFinite(durationMs)||durationMs<0)return;
    if(!/^[a-z0-9_.-]{1,80}$/i.test(name)||!['rpc_headers','rpc_body','rpc','screen_paint','screen_ready'].includes(kind))return;
    if(samples.length>=maxSamples){dropped++;return;}
    samples.push({kind,name,offsetMs:Math.max(0,now()-collectionStart),durationMs:Math.round(durationMs*10)/10,outcome,context:contextOnly(context)});
  };
  const begin=(kind,name)=>{
    if(!active()||pending.size>=512){if(active())dropped++;return {end(){}};}
    const start=now(),context={...ctx},owner=generation,wasActive=active();let done=false;
    const span={kind,name,context,start,end(outcome='success'){if(done)return;done=true;
      // A response beyond the observation window remains right-censored.
      if(wasActive&&owner===generation&&enabled&&now()>=until)return;
      pending.delete(span);if(wasActive&&owner===generation)record(kind,name,now()-start,outcome,context);}};
    pending.add(span);return span;
  };
  const censored=()=>[...pending].map(s=>({kind:s.kind,name:s.name,offsetMs:Math.max(0,Math.min(now(),until)-collectionStart),context:{...s.context},durationMs:Math.max(0,Math.min(now(),until)-s.start),outcome:'interrupted'}));
  const api={active,record,begin,
    status(){return {active:active(),samples:samples.length,pending:pending.size,dropped};},
    start(context={}){generation++;pending.clear();ctx=contextOnly(context);samples=[];dropped=0;collectionStart=now();until=collectionStart+maxDurationMs;enabled=true;startedAt=new Date().toISOString();},
    stop(){for(const row of censored()){if(samples.length<maxSamples)samples.push(row);else dropped++;}pending.clear();generation++;enabled=false;},context(value){ctx={...ctx,...contextOnly(value)};},
    export(){return {schema:1,startedAt,exportedAt:new Date().toISOString(),active:active(),dropped,pending:censored(),limits:{maxSamples,maxDurationMs},samples:samples.map(s=>({...s,context:{...s.context}}))};},
    report(){const groups=new Map();for(const row of [...samples,...censored()]){const key=JSON.stringify([row.kind,row.name,CONTEXT_KEYS.map(k=>row.context[k]??'unknown')]);
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
      return [...groups.values()].map(rows=>({kind:rows[0].kind,name:rows[0].name,context:{...rows[0].context},
        outcomes:rows.reduce((counts,row)=>({...counts,[row.outcome]:(counts[row.outcome]??0)+1}),{}),...summarize(rows)}));},
    wrapFetch(base){return async(input,init)=>{
      const name=active()?rpcName(input):null;if(!name)return base(input,init);
      const headers=begin('rpc_headers',name),body=begin('rpc_body',name);
      const outcome=error=>error?.name==='TimeoutError'||(init?.signal??input?.signal)?.reason?.name==='TimeoutError'?'timeout':error?.name==='AbortError'?'aborted':error?.name==='SyntaxError'?'body_error':'network_error';
      try {
        const response=await base(input,init),result=response.ok?'success':'http_'+response.status;headers.end(result);
        if(response.status===204||init?.method==='HEAD')body.end(result);
        // Observe the consumer's existing body read. Never clone, buffer twice,
        // inspect payloads or delay the caller with an additional request.
        for(const method of ['text','json','arrayBuffer','blob','formData']){
          try {const original=response[method].bind(response);Object.defineProperty(response,method,{configurable:true,value:async(...args)=>{
            try {const value=await original(...args);body.end(result);return value;}
            catch(error){body.end(outcome(error));throw error;}
          }});} catch {/* Non-extensible Response: header metric remains available. */}
        }
        return response;
      } catch(error){const result=outcome(error);headers.end(result);body.end(result);throw error;}
    };},
  };return api;
}
