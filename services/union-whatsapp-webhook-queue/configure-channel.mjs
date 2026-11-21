import {createHmac,randomUUID} from 'node:crypto';
const secret=process.env.UNION_WUZAPI_BRIDGE_SECRET||'';
const [id,org]=process.argv.slice(2);
if(secret.length<32||![id,org].every(value=>/^[0-9a-f-]{36}$/.test(value||'')))throw Error('invalid_channel_scope');
const raw=JSON.stringify({connection_id:id,organization_id:org,action:'webhook_setup'});
const timestamp=String(Date.now()),nonce=randomUUID();
const signature=createHmac('sha256',secret).update(timestamp+'.'+nonce+'.'+raw).digest('hex');
const response=await fetch('http://127.0.0.1:19080/v1/channel-control',{
 method:'POST',headers:{'content-type':'application/json','x-union-timestamp':timestamp,'x-union-nonce':nonce,'x-union-signature':signature},body:raw,signal:AbortSignal.timeout(15000),
});
const result=await response.json();
if(!response.ok||result.ok!==true)throw Error('webhook_configuration_failed_'+response.status+'_'+String(result.code||'unknown').slice(0,80));
console.log(JSON.stringify({ok:true,channel:id,auth_mode:result.auth_mode}));
