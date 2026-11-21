import {Queue} from 'bullmq';
// Local-only recovery: no payload, phone, signature or credential is printed.
let retried=0;
for(let shard=0;shard<4;shard++){
 const queue=new Queue('union-webhook-'+shard,{connection:{path:'/opt/union-whatsapp-webhook-queue/data/redis.sock',maxRetriesPerRequest:1}});
 try{for(const job of await queue.getJobs(['failed'],0,49)){
  await job.retry('failed',{resetAttemptsMade:true,resetAttemptsStarted:true});retried++;
 }}finally{await queue.close();}
}
console.log(JSON.stringify({retried}));
