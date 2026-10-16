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
test('valid SAC Operator profile accepts missing or unverifiable email without a directory lookup',async()=>{
 assert.equal(await assertOperatorIdentity({status:true,info:{name:'Atendente'}},'op'),'op');
 assert.equal(await assertOperatorIdentity({status:true,info:{email:'different@example.test'}},'op'),'op');
 assert.equal(await assertOperatorIdentity({status:true},'op'),'op');
});
test('explicit different or contradictory provider IDs cannot authorize the binding',async()=>{
 for(const info of [{id:'other'},{operator_id:'other'},{operator:{id:777}}]) {
  await assert.rejects(assertOperatorIdentity({status:true,info},'op'),e=>e.code==='operator_identity_mismatch');
 }
 await assert.rejects(assertOperatorIdentity({status:true,info:{id:'one',operator_id:'two'}},'one'),e=>e.code==='operator_auth_contract_unverified');
});
test('provider profile rejection and empty Union Operator binding still stop authorization',async()=>{
 await assert.rejects(assertOperatorIdentity({status:false,info:{}},'op'),e=>e.code==='operator_profile_incompatible');
 await assert.rejects(assertOperatorIdentity({status:true,info:{name:'Atendente'}},''),e=>e.code==='operator_auth_contract_unverified');
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

test('numeric and nested provider IDs still match valid binding',async()=>{
 assert.equal(await assertOperatorIdentity({status:true,info:{id:123}},'123'),'123');
 assert.equal(await assertOperatorIdentity({status:true,info:{operator_id:'op'}},'op'),'op');
 assert.equal(await assertOperatorIdentity({status:true,info:{operator:{id:'op'}}},'op'),'op');
});
test('a successful OAuth profile no longer needs the directory or JWT subject',async()=>{
 const noDirectory=()=>{throw Error('Unexpected directory lookup');};
 assert.equal(await assertOperatorIdentity({status:true,info:{email:'nonmatching@example.test'}},'op',noDirectory,'irrelevant-token'),'op');
 assert.equal(await assertOperatorIdentity({status:true,info:{email:'a@example.test',user:{email:'b@example.test'}}},'op'),'op');
});
