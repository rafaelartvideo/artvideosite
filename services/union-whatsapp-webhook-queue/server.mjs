import {createServer} from 'node:http';
import {Queue,Worker} from 'bullmq';
import {createQueueHandler,createForwarder,createEnqueuer,processQueuedEnvelope} from './core.mjs';
const secret=process.env.UNION_WUZAPI_BRIDGE_SECRET||'';
if(secret.length<32)throw Error('bridge_secret_missing');
const path=process.env.UNION_WEBHOOK_REDIS_SOCKET||'/opt/union-whatsapp-webhook-queue/data/redis.sock';
const port=19081;
const queues=Array.from({length:4},(_,i)=>new Queue('union-webhook-'+i,{connection:{path,maxRetriesPerRequest:1,enableOfflineQueue:false,connectTimeout:2000}}));
const stats={accepted:0,rejected:0,unavailable:0,completed:0,failedAttempts:0};
const forward=createForwarder({secret});
// One active request per shard: channels retain affinity and Supabase has at
// most four webhook requests from this worker. Retries may overtake delayed
// events; downstream timestamps and provider IDs remain authoritative.
const workers=queues.map(queue=>new Worker(queue.name,job=>processQueuedEnvelope(job,forward),{
 connection:{path,maxRetriesPerRequest:null},concurrency:1,
 settings:{backoffStrategy:attempt=>Math.min(30000,1000*2**Math.min(attempt,5))},
}));
for(const worker of workers){
 worker.on('completed',()=>stats.completed++);
 worker.on('failed',()=>stats.failedAttempts++);
 worker.on('error',()=>{}); // Never log provider payloads, credentials or URLs.
}
for(const queue of queues)queue.on('error',()=>{});
const enqueue=createEnqueuer({queues,getUsedBytes:async()=>{
 const memory=await (await queues[0].client).info('memory');
 const bytes=Number(/^used_memory:(\d+)/m.exec(memory)?.[1]);
 if(!Number.isFinite(bytes))throw Error('queue_memory_unknown');
 return bytes;
}});
const handler=createQueueHandler({secret,enqueue});
let intake=0;
const server=createServer(async(req,res)=>{
 const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 const url=new URL(req.url||'/', 'http://localhost');
 if(url.pathname==='/health'&&req.method==='GET'){
  try{const counts=await Promise.all(queues.map(q=>q.getJobCounts('wait','active','delayed','failed')));
   const failed=counts.reduce((n,c)=>n+c.failed,0);send(failed?503:200,{ok:failed===0,stats,queues:counts});}
  catch{send(503,{ok:false});}return;
 }
 if(url.pathname!=='/v1/whatsapp-webhook'||req.method!=='POST'){send(404,{ok:false});return;}
 if(intake>=8){send(503,{ok:false,retry:true});req.resume();return;}
 intake++;
 let bytes=0;const chunks=[];
 try{
  for await(const chunk of req){bytes+=chunk.length;if(bytes>1048576){send(413,{ok:false});req.resume();return;}chunks.push(chunk);}
  const result=await handler({channel:url.searchParams.get('channel')||'',raw:Buffer.concat(chunks).toString('utf8'),
   contentType:String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase(),signature:String(req.headers['x-hmac-signature']||'')});
  if(result.status===202)stats.accepted++;else if(result.status===401)stats.rejected++;else stats.unavailable++;
  send(result.status,result.body);
 }catch{send(400,{ok:false});}finally{intake--;}
});
server.requestTimeout=10000;server.headersTimeout=10000;
await Promise.all([...queues.map(q=>q.waitUntilReady()),...workers.map(w=>w.waitUntilReady())]);
server.listen(port,'127.0.0.1');
async function close(){server.close();await Promise.all(workers.map(w=>w.close()));await Promise.all(queues.map(q=>q.close()));process.exit(0);}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
