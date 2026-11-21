import {createHmac,randomUUID} from 'node:crypto';
import {Queue} from 'bullmq';
import {queueIdentity,shardFor} from './core.mjs';
const secret=process.env.UNION_WUZAPI_BRIDGE_SECRET||'',channel=process.argv[2];
if(secret.length<32||!/^[0-9a-f-]{36}$/.test(channel||''))throw Error('invalid_probe_configuration');
const raw=JSON.stringify({type:'UnionProbe',probe_id:randomUUID()});
const key=createHmac('sha256',secret).update('union-whatsapp-webhook:v1:'+channel).digest('hex');
const signature=createHmac('sha256',key).update(raw).digest('hex');
const input={channel,raw,contentType:'application/json',signature};
const queue=new Queue('union-webhook-'+shardFor(channel),{connection:{path:'/opt/union-whatsapp-webhook-queue/data/redis.sock',maxRetriesPerRequest:1}});
const start=performance.now();
const response=await fetch('https://wa.unionworld.com.br/union-wuzapi/v1/whatsapp-webhook?channel='+channel,{
 method:'POST',headers:{'content-type':'application/json','x-hmac-signature':signature},body:raw,signal:AbortSignal.timeout(10000),
});
if(response.status!==202)throw Error('probe_ack_'+response.status);
console.log(JSON.stringify({ack_ms:Math.round(performance.now()-start),http:response.status}));
for(let i=0;i<60;i++){
 const job=await queue.getJob(queueIdentity(input)),state=await job?.getState();
 if(state==='completed'){console.log('probe_forwarded_successfully');await queue.close();process.exit(0);}
 if(state==='failed')throw Error('probe_delivery_failed');
 await new Promise(resolve=>setTimeout(resolve,500));
}
await queue.close();throw Error('probe_delivery_timeout');
