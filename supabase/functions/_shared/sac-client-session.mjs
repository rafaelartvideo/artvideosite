const failure=(code,message)=>Object.assign(Error(message),{code});
const unavailable=()=>failure('client_session_unavailable','A sessão Client da SAC Digital está temporariamente indisponível.');
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
const utf8=value=>new TextEncoder().encode(value);
const hash=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8(value))));

// Length/encoding-independent framing, also calculated from current Vault credentials by SQL.
export async function clientCredentialFingerprint(credentials) {
 return hash(hex(utf8(String(credentials.clientId).trim()))+':'+hex(utf8(String(credentials.clientSecret).trim())));
}

// JWT claims are used only to bound lifetime, never to authorize a caller.
export function clientTokenExpiry(token,body,now=Date.now()) {
 const expiries=[];
 try {
  const part=token.split('.')[1];
  const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=')));
  if(typeof claims.exp==='number'&&Number.isFinite(claims.exp))expiries.push(claims.exp*1000);
 } catch { /* Opaque tokens need an explicit provider expires_in. */ }
 const seconds=Number(body.expires_in);
 if(Number.isFinite(seconds)&&seconds>0)expiries.push(now+seconds*1000);
 const expiry=Math.min(...expiries);
 if(!Number.isFinite(expiry)||expiry<=now+30_000)throw failure('client_session_unavailable','A SAC Digital não confirmou uma validade utilizável para a sessão Client.');
 return expiry;
}

/** rpc must be a service-role adapter returning data, and throwing on PostgREST errors.
 * No token-only memory fast path: every request checks current credentials and the durable cache.
 */
export function createSacClientSessions({rpc,fetcher=fetch,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
 const inflight=new Map();
 const cacheInput=async input=>{
  const scopes=[...new Set(input.scopes||[])].sort();
  if(scopes.some(scope=>typeof scope!=='string'||!/^[-a-z0-9_]+$/i.test(scope)))throw unavailable();
  return {scopes,args:{p_organization_id:input.organizationId,p_credential_fingerprint:await clientCredentialFingerprint(input.credentials),p_scope_key:scopes.join(' ')}};
 };
 const call=async args=>{try{return await rpc('sac_digital_client_session',args);}catch{throw unavailable();}};
 const acquire=async(input,prepared)=>{
  const lease=crypto.randomUUID(),deadline=now()+17_000;
  for(let attempt=0;attempt<70&&now()<=deadline;attempt++) {
   const result=await call({...prepared.args,p_action:'acquire',p_lease:lease});
   if(result?.state==='cached') {
    const expiresAt=Date.parse(result.expires_at);
    if(typeof result.token!=='string'||!result.token||!Number.isFinite(expiresAt)||expiresAt<=now()+30_000)throw unavailable();
    return {token:result.token,expiresAt};
   }
   if(result?.state==='wait'){await sleep(250);continue;}
   if(result?.state!=='acquired')throw unavailable();
   try {
    const started=now();
    let response,body;
    try {
     response=await fetcher('https://api.sac.digital/v2/client/auth2/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({client:input.credentials.clientId,password:input.credentials.clientSecret,scopes:prepared.scopes}),signal:AbortSignal.timeout(15000)});
     body=await response.json();
    } catch {throw unavailable();}
    if(!response.ok||!body||body.status===false||body.success===false||typeof body.token!=='string'||!body.token.trim()) {
     throw response.status===401||response.status===403
      ?failure('client_credentials_rejected','Credenciais Client da SAC Digital recusadas pela API.')
      :unavailable();
    }
    const session={token:body.token.trim(),expiresAt:clientTokenExpiry(body.token.trim(),body,started)};
    const stored=await call({...prepared.args,p_action:'store',p_lease:lease,p_token:session.token,p_expires_at:new Date(session.expiresAt).toISOString()});
    // Never return an unpersisted token or retry login after an uncertain commit.
    if(stored!==true)throw unavailable();
    return session;
   } catch(error) {
    try {await call({...prepared.args,p_action:'release',p_lease:lease});}catch{ /* Durable lease expires safely. */ }
    throw error;
   }
  }
  throw unavailable();
 };
 return {
  async get(input) {
   const prepared=await cacheInput(input),key=JSON.stringify(prepared.args);
   if(inflight.has(key))return inflight.get(key);
   const promise=acquire(input,prepared);inflight.set(key,promise);
   try{return await promise;}finally{if(inflight.get(key)===promise)inflight.delete(key);}
  },
  async invalidate(input,rejectedToken) {
   if(typeof rejectedToken!=='string'||!rejectedToken)return;
   const prepared=await cacheInput(input);
   await call({...prepared.args,p_action:'invalidate',p_token:rejectedToken});
  },
 };
}
