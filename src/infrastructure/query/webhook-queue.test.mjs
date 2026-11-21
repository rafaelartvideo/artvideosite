import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {authenticateEnvelope,sealEnvelope,openEnvelope,queueIdentity,shardFor,createQueueHandler,createForwarder,createEnqueuer,processQueuedEnvelope} from '../../../services/union-whatsapp-webhook-queue/core.mjs';
const secret='s'.repeat(64),channel='11111111-1111-4111-8111-111111111111';
function signed(raw='{"type":"UnionProbe"}'){
 const key=createHmac('sha256',secret).update('union-whatsapp-webhook:v1:'+channel).digest('hex');
 return {channel,raw,contentType:'application/json',signature:createHmac('sha256',key).update(raw).digest('hex')};
}
test('fila autentica antes de persistir e cifra payload completo com integridade',()=>{
 const input=signed();assert.equal(authenticateEnvelope(input,secret),true);
 assert.equal(authenticateEnvelope({...input,raw:'changed'},secret),false);
 const encrypted=sealEnvelope(input,secret);
 assert.equal(JSON.stringify(encrypted).includes('UnionProbe'),false);
 assert.deepEqual(openEnvelope(encrypted,secret),input);
 assert.throws(()=>openEnvelope(encrypted,'x'.repeat(64)));
 assert.equal(queueIdentity(input),queueIdentity(input));
 assert.notEqual(queueIdentity(input),queueIdentity({...input,channel:'22222222-2222-4222-8222-222222222222'}));
 assert.equal(shardFor(channel),shardFor(channel));
});
test('ACK só ocorre depois da fila; assinatura inválida nunca toca Redis; indisponibilidade não perde evento',async()=>{
 let release,adds=0;
 const handler=createQueueHandler({secret,enqueue:async()=>{adds++;await new Promise(r=>release=r);}});
 const bad=await handler({...signed(),signature:'0'.repeat(64)});assert.equal(bad.status,401);assert.equal(adds,0);
 let settled=false;const pending=handler(signed()).then(r=>{settled=true;return r;});
 await Promise.resolve();assert.equal(settled,false);release();assert.equal((await pending).status,202);
 const down=createQueueHandler({secret,enqueue:async()=>{throw Error('redis');}});
 assert.equal((await down(signed())).status,503);
});
test('worker encaminha somente ao endpoint fixo com assinatura original e rejeita erro HTTP/lógico',async()=>{
 const input=signed(),calls=[];
 const forward=createForwarder({secret,fetch:async(url,options)=>{calls.push({url,options});return new Response('{"ok":true}',{status:200});}});
 await forward(sealEnvelope(input,secret));
 assert.equal(calls[0].url,'https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/union-whatsapp-webhook?channel='+channel);
 assert.equal(calls[0].options.body,input.raw);
 assert.equal(calls[0].options.headers['x-hmac-signature'],input.signature);
 for(const result of [new Response('{"ok":false}',{status:200}),new Response('fail',{status:503})]){
  await assert.rejects(createForwarder({secret,fetch:async()=>result})(sealEnvelope(input,secret)));
 }
});

test('sucesso remove payload retido e retry de conclusão não reenvia mensagem',async()=>{
 let sends=0;const job={data:{data:'encrypted message'},updateData:async value=>{job.data=value;}};
 await processQueuedEnvelope(job,async()=>{sends++;});assert.deepEqual(job.data,{delivered:true});
 await processQueuedEnvelope(job,async()=>{sends++;});assert.equal(sends,1);
});
test('reserva de memória rejeita novos eventos; duplicata falhada é reativada com tentativas renovadas',async()=>{
 let added=0,retried=0;const queue={getJob:async id=>id==='failed'?{getState:async()=> 'failed',retry:async(state,options)=>{assert.equal(state,'failed');assert.equal(options.resetAttemptsMade,true);retried++;}}:null,
  getJobCounts:async()=>({wait:0,active:0,delayed:0,failed:1}),add:async()=>{added++;}};
 const enqueue=createEnqueuer({queues:Array(4).fill(queue),getUsedBytes:async()=>70*1024*1024});
 await assert.rejects(enqueue(signed(),{},'new'),/queue_memory_reserve/);assert.equal(added,0);
 await enqueue(signed(),{},'failed');assert.equal(retried,1);
});

test('configurador usa os campos reais da ponte e assinatura sobre o corpo exato',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync('services/union-whatsapp-webhook-queue/configure-channel.mjs','utf8').replace(/^import .*?;\s*$/gm,'');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;let sent;
 await new AsyncFunction('createHmac','randomUUID','process','fetch','console',source)(createHmac,()=> '11111111-1111-4111-8111-111111111111',
  {env:{UNION_WUZAPI_BRIDGE_SECRET:secret},argv:['node','script',channel,channel]},async(url,options)=>{
   sent=options;assert.equal(url,'http://127.0.0.1:19080/v1/channel-control');return new Response('{"ok":true,"auth_mode":"hmac-sha256"}');
  },{log:()=>{}});
 assert.deepEqual(JSON.parse(sent.body),{connection_id:channel,organization_id:channel,action:'webhook_setup'});
 assert.equal(sent.headers['x-union-signature'],createHmac('sha256',secret).update(sent.headers['x-union-timestamp']+'.'+sent.headers['x-union-nonce']+'.'+sent.body).digest('hex'));
});
