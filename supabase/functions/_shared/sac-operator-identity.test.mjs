import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOperatorIdentity,fetchSacOperatorDirectory } from './sac-operator-identity.mjs';
const profile={status:true,info:{name:'Atendente',email:' Operator@Example.Test '}};
const operators=[{id:'op',name:'Atendente',email:'operator@example.test'}];
test('a durable Client token reads the directory without creating a new login',async()=>{
 const paths=[];
 const list=await fetchSacOperatorDirectory({clientId:'c',clientSecret:'s'},async(url,init)=>{
  paths.push(url);assert.equal(init.headers.Authorization,'Bearer cached');
  return Response.json({status:true,list:operators,has_more:false});
 },'cached');
 assert.deepEqual(list,operators);assert.equal(paths.length,1);assert.ok(paths.every(path=>!path.includes('auth2/login')));
});
test('profile without id matches the unique authenticated email against the company Operator directory',async()=>{
 assert.equal(await assertOperatorIdentity(profile,'op',async()=>operators),'op');
});
test('explicit provider id remains authoritative and cannot be replaced by matching email',async()=>{
 let called=false;
 await assert.rejects(assertOperatorIdentity({info:{id:'other',email:profile.info.email}},'op',async()=>{called=true;return operators;}),e=>e.code==='operator_identity_mismatch');
 assert.equal(called,false);
});
test('another Operator email rejects the session even if the display name is identical',async()=>{
 await assert.rejects(assertOperatorIdentity(profile,'op',async()=>[{id:'other',name:'Atendente',email:profile.info.email}]),e=>e.code==='operator_identity_mismatch');
});
test('missing, unmatched and ambiguous emails never authorize an Operator',async()=>{
 for(const [p,rows] of [[{info:{name:'Atendente'}},operators],[profile,[]],[profile,[...operators,{...operators[0],id:'other'}]]]) {
  await assert.rejects(assertOperatorIdentity(p,'op',async()=>rows),e=>e.code==='operator_auth_contract_unverified');
 }
});
test('directory unavailable is an authentication failure before any attendance action',async()=>{
 await assert.rejects(assertOperatorIdentity(profile,'op',async()=>{throw Error('private provider details');}),e=>e.code==='operator_session_unavailable'&&!e.message.includes('private'));
});
test('directory uses application credentials only to read Operators, preserving all pages',async()=>{
 const seen=[];
 const result=await fetchSacOperatorDirectory({clientId:'c',clientSecret:'s'},async(url,init)=>{
  seen.push({url,init});
  if(url.endsWith('/auth2/login')) return Response.json({status:true,token:'catalog'});
  return Response.json({status:true,list:url.endsWith('p=1')?operators:[],has_more:url.endsWith('p=1')});
 });
 assert.deepEqual(result,operators);
 assert.deepEqual(JSON.parse(seen[0].init.body),{client:'c',password:'s',scopes:['operator']});
 assert.equal(seen[1].init.headers.Authorization,'Bearer catalog');
 assert.equal(seen.length,3);
 assert.ok(seen.every(x=>!x.url.includes('/operator/att/')));
});
test('directory failures and missing list stop the lookup instead of authorizing against partial data',async()=>{
 for(const body of [{status:false,list:operators},{status:true,info:operators}]) {
  await assert.rejects(fetchSacOperatorDirectory({clientId:'c',clientSecret:'s'},async url=>Response.json(url.endsWith('/auth2/login')?{token:'catalog'}:body)));
 }
});

test('accepts numeric Operator IDs and trusted provider alternate fields',async()=>{
 assert.equal(await assertOperatorIdentity({info:{id:123}},'123',async()=>{throw Error('directory not needed');}),'123');
 assert.equal(await assertOperatorIdentity({info:{operator_id:'op'}},'op',async()=>{throw Error('directory not needed');}),'op');
 assert.equal(await assertOperatorIdentity({info:{user:{email:'OPERATOR@example.test'}}},'op',async()=>operators),'op');
 assert.equal(await assertOperatorIdentity({info:{email:'Operator@Example.Test'}},'123',async()=>[{id:123,email:'operator@example.test'}]),'123');
});
test('a verified Operator profile can match an OAuth subject when SAC omits profile id and email',async()=>{
 const token='h.'+Buffer.from(JSON.stringify({sub:'op'})).toString('base64url')+'.s';
 assert.equal(await assertOperatorIdentity({info:{name:'Atendente'}},'op',async()=>{throw Error('directory not needed');},token),'op');
 await assert.rejects(assertOperatorIdentity({info:{name:'Atendente'}},'op',async()=>[], 'h.'+Buffer.from(JSON.stringify({sub:'other'})).toString('base64url')+'.s'),e=>e.code==='operator_auth_contract_unverified');
});
test('OAuth subject never overrides a conflicting provider profile ID or ambiguous operator emails',async()=>{
 const token='h.'+Buffer.from(JSON.stringify({sub:'op'})).toString('base64url')+'.s';
 await assert.rejects(assertOperatorIdentity({info:{id:'other',email:'operator@example.test'}},'op',async()=>operators,token),e=>e.code==='operator_identity_mismatch');
 await assert.rejects(assertOperatorIdentity({info:{email:'a@example.test',user:{email:'b@example.test'}}},'op',async()=>operators,token),e=>e.code==='operator_auth_contract_unverified');
});

test('accepted SAC Operator profile without ID or email can finish OAuth',async()=>{
 let fetched=false;
 const accepted={status:true,info:{name:'Atendente',departments:[]}};
 assert.equal(await assertOperatorIdentity(accepted,'op',async()=>{fetched=true;throw Error('directory not needed');}),'op');
 assert.equal(fetched,false);
});
test('missing profile acceptance and explicit different Operator ID still reject',async()=>{
 await assert.rejects(assertOperatorIdentity({status:false,info:{name:'Atendente'}},'op',async()=>[]),e=>e.code==='operator_auth_contract_unverified');
 await assert.rejects(assertOperatorIdentity({status:true,info:{id:'other'}},'op',async()=>[]),e=>e.code==='operator_identity_mismatch');
});
