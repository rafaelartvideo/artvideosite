// Run only before callback rollout on the newly isolated Redis instance.
// The restart and memory-pressure test affect no pre-existing Redis/container.
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Queue,Worker} from 'bullmq';
import {createQueueHandler,createEnqueuer,sealEnvelope,processQueuedEnvelope} from './core.mjs';
if(process.env.UNION_QUEUE_STANDBY_TEST!=='1')throw Error('standby_only_test_requires_explicit_flag');
const path='/opt/union-whatsapp-webhook-queue/data/redis.sock';
const name='union-audit-'+randomUUID();
const queue=new Queue(name,{connection:{path,maxRetriesPerRequest:1}});
const secret='synthetic-audit-only-secret-123456789';
const channel='11111111-1111-4111-8111-111111111111';
const input={channel,contentType:'application/json',raw:'{"type":"UnionProbe","audit":true}'};
const key=createHmac('sha256',secret).update('union-whatsapp-webhook:v1:'+channel).digest('hex');
input.signature=createHmac('sha256',key).update(input.raw).digest('hex');
let outage=false,sends=0;
const waitState=async(id,state)=>{
 for(let i=0;i<100;i++){
  try{const job=await queue.getJob(id);if(await job?.getState()===state)return job;}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('audit_state_timeout_'+state);
};
queue.on('error',()=>{});
await queue.waitUntilReady();
const client=await queue.client;
assert.match(await client.config('GET','appendonly').then(x=>x[1]),/^yes$/);
assert.equal((await client.config('GET','appendfsync'))[1],'always');
assert.equal((await client.config('GET','maxmemory-policy'))[1],'noeviction');
await queue.pause();
await queue.add('audit',sealEnvelope(input,secret),{jobId:'persisted',removeOnComplete:false});
execFileSync('docker',['restart','union-whatsapp-webhook-redis'],{stdio:'ignore'});
await waitState('persisted','waiting');
console.log('restart_persistence_verified');
const worker=new Worker(name,job=>processQueuedEnvelope(job,async()=>{
 if(outage)throw Error('synthetic_downstream_failure');sends++;
}),{connection:{path,maxRetriesPerRequest:null},concurrency:1});
worker.on('error',()=>{});
await queue.resume();
assert.deepEqual((await waitState('persisted','completed')).data,{delivered:true});
outage=true;
await queue.add('audit',sealEnvelope(input,secret),{jobId:'replay',attempts:1,removeOnFail:false});
await waitState('replay','failed');
const enqueue=createEnqueuer({queues:Array(4).fill(queue),getUsedBytes:async()=>{
 const info=await (await queue.client).info('memory');return Number(/^used_memory:(\d+)/m.exec(info)[1]);
}});
outage=false;
await enqueue(input,sealEnvelope(input,secret),'replay');
await waitState('replay','completed');
assert.equal(sends,2);
console.log('failed_replay_and_payload_release_verified');
const handler=createQueueHandler({secret,enqueue});
const limit=(await (await queue.client).config('GET','maxmemory'))[1];
try{
 await (await queue.client).config('SET','maxmemory','1');
 assert.equal((await handler({...input,raw:input.raw,signature:input.signature})).status,503);
}finally{await (await queue.client).config('SET','maxmemory',limit);}
assert.equal((await handler(input)).status,202);
// The production enqueue uses a body-derived ID; only the synthetic audit queue is observed.
await new Promise(resolve=>setTimeout(resolve,500));
console.log('real_redis_oom_refusal_and_recovery_verified');
await worker.close();
assert.ok(name.startsWith('union-audit-'));
await queue.obliterate({force:true});
await queue.close();
