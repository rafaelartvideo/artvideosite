import {createHash,createHmac,timingSafeEqual,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
export function canonicalForm(raw){
 const encode=value=>Array.from(new TextEncoder().encode(value)).map(b=>
  (b>=65&&b<=90)||(b>=97&&b<=122)||(b>=48&&b<=57)||[45,46,95,126].includes(b)?String.fromCharCode(b):b===32?'+':'%'+b.toString(16).toUpperCase().padStart(2,'0')).join('');
 return [...new URLSearchParams(raw).entries()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,v])=>encode(k)+'='+encode(v)).join('&');
}
export function authenticateEnvelope(input,secret){
 if(secret.length<32||!uuid(input.channel)||typeof input.raw!=='string'||Buffer.byteLength(input.raw)>1048576||!/^[a-f0-9]{64}$/i.test(input.signature||''))return false;
 if(!['application/json','application/x-www-form-urlencoded'].includes(input.contentType))return false;
 const derived=createHmac('sha256',secret).update('union-whatsapp-webhook:v1:'+input.channel).digest('hex');
 const signable=input.contentType==='application/x-www-form-urlencoded'?canonicalForm(input.raw):input.raw;
 const expected=createHmac('sha256',derived).update(signable).digest();
 return timingSafeEqual(expected,Buffer.from(input.signature,'hex'));
}
const keyFor=secret=>createHash('sha256').update('union-webhook-queue:v1:'+secret).digest();
export function sealEnvelope(input,secret){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFor(secret),iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(input),'utf8'),cipher.final()]);
 return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')};
}
export function openEnvelope(input,secret){
 if(input.v!==1)throw Error('queue_version');
 const cipher=createDecipheriv('aes-256-gcm',keyFor(secret),Buffer.from(input.iv,'base64'));
 cipher.setAuthTag(Buffer.from(input.tag,'base64'));
 return JSON.parse(Buffer.concat([cipher.update(Buffer.from(input.data,'base64')),cipher.final()]).toString('utf8'));
}
export const queueIdentity=input=>createHash('sha256').update(input.channel+'\n'+input.contentType+'\n'+input.raw).digest('hex');
export const shardFor=channel=>createHash('sha256').update(channel).digest()[0]%4;
export async function processQueuedEnvelope(job,forward){
 if(job.data.delivered===true)return;
 await forward(job.data);
 // Keep the idempotency marker, not a full encrypted message, after delivery.
 // If completion bookkeeping fails, retrying this marker does not redeliver.
 await job.updateData({delivered:true});
}
export function createEnqueuer({queues,getUsedBytes,softBytes=64*1024*1024}){
 let admission=Promise.resolve();
 return (input,encrypted,id)=>{
  const pending=admission.then(async()=>{
   const queue=queues[shardFor(input.channel)];
   const existing=await queue.getJob(id);
   if(existing){
    if(await existing.getState()==='failed')await existing.retry('failed',{resetAttemptsMade:true,resetAttemptsStarted:true});
    return;
   }
   if(await getUsedBytes()>=softBytes)throw Error('queue_memory_reserve');
   const counts=await queue.getJobCounts('wait','active','delayed','failed');
   if(Object.values(counts).reduce((a,b)=>a+b,0)>=500)throw Error('queue_full');
   await queue.add('deliver',encrypted,{jobId:id,attempts:12,backoff:{type:'bounded'},
    removeOnComplete:{age:86400,count:1000},removeOnFail:false});
  });
  admission=pending.catch(()=>{});
  return pending;
 };
}
export function createQueueHandler({secret,enqueue}){
 return async input=>{
  if(!authenticateEnvelope(input,secret))return {status:401,body:{ok:false}};
  try{await enqueue(input,sealEnvelope(input,secret),queueIdentity(input));return {status:202,body:{ok:true,queued:true}};}
  catch{return {status:503,body:{ok:false,retry:true}};}
 };
}
export function createForwarder({secret,fetch=globalThis.fetch}){
 return async encrypted=>{
  const input=openEnvelope(encrypted,secret);
  if(!authenticateEnvelope(input,secret))throw Error('queue_auth');
  const response=await fetch('https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/union-whatsapp-webhook?channel='+input.channel,{
   method:'POST',headers:{'content-type':input.contentType,'x-hmac-signature':input.signature},
   body:input.raw,signal:AbortSignal.timeout(30000),redirect:'error',
  });
  if(!response.ok)throw Error('downstream_http_'+response.status);
  const body=await response.json();if(body.ok!==true)throw Error('downstream_rejected');
  // A temporary channel outage must not acknowledge a persisted event as
  // delivered. Old-account timestamps remain a permanent downstream discard.
  if(body.ignored==='inactive_channel')throw Error('downstream_channel_inactive');
 };
}
