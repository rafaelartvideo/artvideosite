import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { openArchiveStore } from "./archive-store.mjs";
import { validateIndex,validatePayload,nextJobState } from "./archive-contract.mjs";
const org="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
const account="5579999999999", phone="5579888888888", actor="33333333-3333-4333-8333-333333333333";
const pid="a".repeat(20), ck="b".repeat(32), mk="c".repeat(40), hash="d".repeat(64);
const payload={schema_version:1,scope:"union_world_historical_archive",contact:{import_key:ck,phone_normalized:phone},protocols:[{protocol_key:ck}],messages:[{import_key:mk,protocol_key:ck,at:"2024-01-01T00:00:00.000Z",direction:"incoming",media:[{url_sha256:hash,available:false}],text:"fixture"}],media:[{url_sha256:hash,available:false}]};
const file=gzipSync(JSON.stringify(payload));
const row={contact_key:ck,phone_normalized:phone,file:"historicos/"+ck+".json.gz",sha256:createHash("sha256").update(file).digest("hex"),bytes:file.length,messages:1,protocols:1,media:1,media_available:0,media_pending:1};
const summary={version:1,stage:"union_history_pilot_packaging",package_id:pid,contacts:1,messages:1,protocols:1,media_recovered:0,media_pending:1};
function fixture(){
 let corrupt=false, reads=0;
 const read=(packageId,name)=>{
   reads++;
   assert.equal(packageId,pid);
   if(name==="resumo-seguro.json")return Buffer.from(JSON.stringify(summary));
   if(name==="indice-privado.jsonl")return Buffer.from(JSON.stringify(row)+"\n");
   if(name===row.file)return corrupt?Buffer.from("invalid"):file;
   throw Error("unexpected");
 };
 const store=openArchiveStore(":memory:",read);
 return {store,reads:()=>reads,corrupt:()=>{corrupt=true},repair:()=>{corrupt=false}};
}
test("reject unsafe paths, directions, inconsistent media and transitions",()=>{
 assert.throws(()=>validateIndex([{...row,file:"../../secret"}],summary,pid));
 assert.throws(()=>validatePayload({...payload,messages:[{...payload.messages[0],direction:"unknown"}]},row));
 assert.throws(()=>validatePayload({...payload,messages:[{...payload.messages[0],media:[{url_sha256:hash,available:true}]}]},row));
 assert.throws(()=>nextJobState("completed","start"));
});
test("tenant grant, immutable number, idempotent prepare, checkpoint, rollback",()=>{
 const {store}=fixture();
 const prepare={packageId:pid,organizationId:org,accountPhone:account,actor};
 try{
   assert.throws(()=>store.prepare(prepare));
   store.grantPackage(pid,org,actor);
   assert.throws(()=>store.grantPackage(pid,other,actor));
   assert.equal(store.list(other).packages.length,0);
   const id=store.prepare(prepare);
   assert.equal(store.prepare(prepare),id);
   assert.throws(()=>store.prepare({...prepare,accountPhone:"5579777777777"}));
   assert.throws(()=>store.status(id,other));
   store.control({id,organizationId:org,actor,action:"start"});
   store.control({id,organizationId:org,actor,action:"pause"});
   assert.equal(store.tick(),false);
   store.control({id,organizationId:org,actor,action:"resume"});
   assert.equal(store.tick(),true);
   assert.equal(store.status(id,org).verified.messages,1);
   assert.equal(store.lookup({organizationId:org,accountPhone:account,contactPhone:phone}),null);
   assert.equal(store.tick(),true);
   assert.equal(store.status(id,org).state,"completed");
   assert.deepEqual(store.lookup({organizationId:org,accountPhone:account,contactPhone:phone}),payload);
   assert.equal(store.lookup({organizationId:other,accountPhone:account,contactPhone:phone}),null);
   assert.equal(store.lookup({organizationId:org,accountPhone:"5579777777777",contactPhone:phone}),null);
   store.control({id,organizationId:org,actor,action:"rollback"});
   assert.equal(store.lookup({organizationId:org,accountPhone:account,contactPhone:phone}),null);
 }finally{store.close()}
});
test("bad hash leaves job failed; resume validates same pending contact",()=>{
 const {store,corrupt,repair}=fixture();
 try{
   store.grantPackage(pid,org,actor);
   const id=store.prepare({packageId:pid,organizationId:org,accountPhone:account,actor});
   store.control({id,organizationId:org,actor,action:"start"});
   corrupt();store.tick();
   assert.equal(store.status(id,org).state,"failed");
   assert.equal(store.status(id,org).verified.messages,0);
   repair();store.control({id,organizationId:org,actor,action:"resume"});
   store.tick();store.tick();
   assert.equal(store.status(id,org).state,"completed");
   assert.equal(store.status(id,org).verified.messages,1);
 }finally{store.close()}
});

test("explicit binding is required and cannot cross company, number, or contact",()=>{
 const {store}=fixture(), contactId="44444444-4444-4444-8444-444444444444", another="55555555-5555-4555-8555-555555555555";
 const query={organizationId:org,accountPhone:account,contactPhone:phone,contactId};
 try{
   store.grantPackage(pid,org,actor);
   const id=store.prepare({packageId:pid,organizationId:org,accountPhone:account,actor});
   const binding={id,organizationId:org,actor,accountPhone:account,contactKey:ck,contactId,contactPhone:phone};
   assert.throws(()=>store.bindContact(binding));
   store.control({id,organizationId:org,actor,action:"start"});
   store.tick();store.tick();
   assert.equal(store.lookupBound(query),null);
   assert.equal(store.candidates(id,org).entries.length,1);
   assert.throws(()=>store.candidates(id,other));
   assert.throws(()=>store.bindContact({...binding,organizationId:other}));
   assert.throws(()=>store.bindContact({...binding,contactPhone:"5579777777777"}));
   assert.throws(()=>store.bindContact({...binding,accountPhone:"5579777777777"}));
   assert.equal(store.bindContact(binding).bound,true);
   assert.equal(store.bindContact(binding).bound,true);
   assert.equal(store.status(id,org).bound,1);
   assert.throws(()=>store.bindContact({...binding,contactId:another}));
   assert.deepEqual(store.lookupBound(query),payload);
   assert.equal(store.lookupBound({...query,contactId:another}),null);
   assert.equal(store.lookupBound({...query,organizationId:other}),null);
   assert.equal(store.lookupBound({...query,accountPhone:"5579777777777"}),null);
   store.control({id,organizationId:org,actor,action:"rollback"});
   assert.equal(store.lookupBound(query),null);
 }finally{store.close()}
});

test("indexed history is paginated, explicitly bound, private, and never rereads R2",()=>{
 const {store,reads}=fixture(), contactId="44444444-4444-4444-8444-444444444444", conversationId="55555555-5555-4555-8555-555555555555";
 const query={organizationId:org,accountPhone:account,contactPhone:phone,contactId,conversationId,limit:1};
 try{
   store.grantPackage(pid,org,actor);
   const id=store.prepare({packageId:pid,organizationId:org,accountPhone:account,actor});
   store.control({id,organizationId:org,actor,action:"start"});
   store.tick();store.tick();
   assert.equal(store.pageBound(query).items.length,0);
   store.bindContact({id,organizationId:org,actor,accountPhone:account,contactKey:ck,contactId,contactPhone:phone});
   const count=reads(), result=store.pageBound(query);
   assert.equal(result.items.length,1);
   assert.equal(result.items[0].body_text,"fixture");
   assert.equal(result.items[0].conversation_id,conversationId);
   assert.equal(result.items[0].delivery_status,null);
   assert.equal(result.items[0].attachments.length,1);
   assert.equal(result.items[0].attachments[0].available,false);
   assert.equal(result.hasMore,false);
   assert.equal(store.pageBound({...query,before:result.nextCursor}).items.length,0);
   const protocols=store.pageBound({...query,kind:"protocols"});
   assert.equal(protocols.items.length,1);
   assert.equal(protocols.items[0].message_count,1);
   assert.equal(store.pageBound({...query,protocolId:protocols.items[0].id}).items.length,1);
   assert.equal(store.pageBound({...query,organizationId:other}).items.length,0);
   assert.equal(store.pageBound({...query,contactId:conversationId}).items.length,0);
   assert.equal(store.pageBound({...query,accountPhone:"5579777777777"}).items.length,0);
   assert.throws(()=>store.pageBound({...query,limit:101}));
   assert.equal(reads(),count);
   store.control({id,organizationId:org,actor,action:"rollback"});
   assert.equal(store.pageBound(query).items.length,0);
 }finally{store.close()}
});
