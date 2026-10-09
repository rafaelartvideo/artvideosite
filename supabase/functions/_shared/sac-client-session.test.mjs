import test from 'node:test';
import assert from 'node:assert/strict';
import { createSacClientSessions, clientCredentialFingerprint, clientTokenExpiry } from './sac-client-session.mjs';

const credentials={clientId:'client',clientSecret:'secret'};
const input={organizationId:'org-a',credentials,scopes:['protocol','contact']};
const jwt=exp=>`e30.${Buffer.from(JSON.stringify({exp})).toString('base64url')}.signature`;

function environment() {
 let clock=1_800_000_000_000,logins=0;
 const rows=new Map();
 const rpc=async(name,args)=>{
  assert.equal(name,'sac_digital_client_session');
  const key=[args.p_organization_id,args.p_credential_fingerprint,args.p_scope_key].join(':');
  const row=rows.get(key);
  if(args.p_action==='acquire') {
   if(row?.token && row.expiresAt>clock+30_000) return {state:'cached',token:row.token,expires_at:new Date(row.expiresAt).toISOString()};
   if(row?.leaseUntil>clock) return {state:'wait'};
   if(row?.retryAfter>clock) return {state:'blocked'};
   rows.set(key,{...row,lease:args.p_lease,leaseUntil:clock+30_000});return {state:'acquired'};
  }
  if(args.p_action==='store') {
   if(row?.lease!==args.p_lease || row.leaseUntil<=clock)return false;
   rows.set(key,{token:args.p_token,expiresAt:Date.parse(args.p_expires_at)});return true;
  }
  if(args.p_action==='invalidate') {
   if(row?.token===args.p_token)rows.delete(key);return true;
  }
  if(args.p_action==='release') {
   if(row?.lease===args.p_lease)rows.set(key,{...row,lease:null,leaseUntil:0,retryAfter:clock+60_000});return true;
  }
  throw Error('unknown cache action');
 };
 const fetcher=async()=>{logins++; await new Promise(resolve=>setImmediate(resolve));return Response.json({status:true,token:jwt(clock/1000+3600),expires_in:3600});};
 const options={rpc,fetcher,now:()=>clock,sleep:()=>new Promise(resolve=>setImmediate(resolve))};
 return {options,rows,logins:()=>logins,advance:ms=>{clock+=ms;}};
}

test('cold isolates and simultaneous reads share one persistent Client login',async()=>{
 const env=environment(), a=createSacClientSessions(env.options),b=createSacClientSessions(env.options);
 const sessions=await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).get(input)));
 assert.ok(sessions.every(s=>s?.token));assert.ok(sessions.every(s=>s.token===sessions[0].token));assert.equal(env.logins(),1);
 env.advance(60_000);
 assert.equal((await createSacClientSessions(env.options).get(input)).token,sessions[0].token);
 assert.equal(env.logins(),1);
});

test('JWT exp bounds expiry and expiry renewal happens only once',async()=>{
 const env=environment(),cache=createSacClientSessions(env.options);
 const initial=await cache.get(input);assert.equal(initial?.expiresAt,1_800_003_600_000);
 env.advance(3_580_000);await cache.get(input);assert.equal(env.logins(),2);
 assert.equal(clientTokenExpiry(jwt(1_800_000_120),{expires_in:3600},1_800_000_000_000),1_800_000_120_000);
 assert.equal(clientTokenExpiry(jwt(1_800_003_600),{expires_in:120},1_800_000_000_000),1_800_000_120_000);
});

test('credentials, tenant and canonical scope sets isolate sessions',async()=>{
 const env=environment(),cache=createSacClientSessions(env.options);
 await cache.get(input);await cache.get({...input,scopes:['contact','protocol','protocol']});assert.equal(env.logins(),1);
 await cache.get({...input,credentials:{...credentials,clientSecret:'rotated'}});
 await cache.get({...input,organizationId:'org-b'});await cache.get({...input,scopes:['operator']});assert.equal(env.logins(),4);
 assert.notEqual(await clientCredentialFingerprint(credentials),await clientCredentialFingerprint({...credentials,clientSecret:'rotated'}));
});

test('late 401 does not invalidate the already renewed token',async()=>{
 const env=environment(),cache=createSacClientSessions(env.options),old=await cache.get(input);
 assert.ok(old?.token);await cache.invalidate(input,old.token);env.advance(60_000);const fresh=await cache.get(input);
 // Give the renewed provider token a distinct issuance/expiry.
 env.advance(60_000);await cache.invalidate(input,old.token);
 const current=await cache.get(input);
 assert.equal(current.token,fresh.token);assert.equal(env.logins(),2);
});

test('a provider failure releases its lease with cooldown and never exposes credentials',async()=>{
 const env=environment();env.options.fetcher=async()=>Response.json({status:false,message:'secret'}, {status:401});
 const cache=createSacClientSessions(env.options);
 await assert.rejects(cache.get(input),error=>error.code==='client_credentials_rejected'&&!error.message.includes('secret'));
 await assert.rejects(createSacClientSessions(env.options).get(input),error=>error.code==='client_session_unavailable');
});

test('expiry must be evidenced and rejected login does not cache a token',async()=>{
 assert.throws(()=>clientTokenExpiry('opaque',{},1_800_000_000_000),/validade/);
 assert.throws(()=>clientTokenExpiry(jwt(1_799_999_000),{},1_800_000_000_000),/validade/);
 const env=environment();env.options.fetcher=async()=>Response.json({status:false,token:jwt(1_800_003_600)});
 await assert.rejects(createSacClientSessions(env.options).get(input));
 assert.ok([...env.rows.values()].every(row=>!row.token));
});

test('cache outages fail closed without opening an unpersisted external session',async()=>{
 let calls=0;
 const cache=createSacClientSessions({rpc:async()=>{throw Error('db down');},fetcher:async()=>{calls++;}});
 await assert.rejects(cache.get(input));assert.equal(calls,0);
});

test('an uncertain cache commit never causes a second provider login',async()=>{
 const env=environment(),originalRpc=env.options.rpc;
 env.options.rpc=async(name,args)=>args.p_action==='store'?false:originalRpc(name,args);
 await assert.rejects(createSacClientSessions(env.options).get(input));assert.equal(env.logins(),1);
 await assert.rejects(createSacClientSessions(env.options).get(input));assert.equal(env.logins(),1);
});

test('an existing login lease makes other isolates wait without authenticating',async()=>{
 let calls=0;
 const cache=createSacClientSessions({rpc:async()=>({state:'wait'}),fetcher:async()=>{calls++;},sleep:async()=>{}});
 await assert.rejects(cache.get(input));assert.equal(calls,0);
});
