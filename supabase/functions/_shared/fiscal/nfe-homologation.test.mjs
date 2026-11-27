import test from "node:test";
import assert from "node:assert/strict";
import {buildHomologationNfe,assertProviderDraft,classifyValidation,classifyDetail,createNfeHomologationService} from "./nfe-homologation.mjs";
const remote="11111111-2222-4333-8444-555555555555", key="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const profile={id:7,version:2,model:"55",catalogCode:"7870"};
const input={description:"Painel de teste",unitPrice:"10.10",discount:"0.20",customer:{tax_id:"12345678901",name:"Destinatário de teste",address:{street:"Rua de teste",number:"1",district:"Centro",city:"Aracaju",uf:"SE",municipality:"2800308",postal_code:"49000000"}}};
test("commercial payload uses profile code and exact decimal math",()=>{
 const d=buildHomologationNfe(input,profile,"889");
 assert.deepEqual(d.commercial.payment,{type:"01",amount:"9.90"});
 assert.equal(d.commercial.items[0].catalog_code,"7870");
 assert.equal(d.commercial.customer.ie_indicator,9);
 assert.equal(d.profileVersion,2);
});
test("rejects other models, malformed amounts and interstate address",()=>{
 assert.throws(()=>buildHomologationNfe(input,{...profile,model:"65"},"889"),/INVALID_PROFILE/);
 assert.throws(()=>buildHomologationNfe({...input,unitPrice:"1e3"},profile,"889"),/INVALID_AMOUNT/);
 assert.throws(()=>buildHomologationNfe({...input,discount:"10.10"},profile,"889"),/INVALID_AMOUNT/);
 assert.throws(()=>buildHomologationNfe({...input,customer:{...input.customer,address:{...input.customer.address,uf:"SP"}}},profile,"889"),/PILOT_ONLY/);
});
test("unrecognized validation and detail are not authorization",()=>{
 assert.equal(classifyValidation({ok:true}),"validation_unknown");
 assert.equal(classifyValidation({valid:true,errors:["failure"]}),"validation_rejected");
 assert.equal(classifyValidation({valid:true}),"validated");
 assert.equal(classifyDetail({processed:true}).state,"awaiting_confirmation");
 assert.equal(classifyDetail({state:"authorized"}).state,"awaiting_confirmation");
 assert.equal(classifyDetail({state:"authorized",protocol:"123456789012345"}).state,"authorized");
 assert.throws(()=>assertProviderDraft({id:remote}),/UNRECOGNIZED/);
});
function fixture(fail=""){
 let row={id:"local",state:"prepared",payload:{model:"55",series:"889",commercial:{}},profile_id:7,profile_version:2,issue_key:key};
 const calls=[];
 const repository={claim:async(id,allowed,state)=>{if(!allowed.includes(row.state))return null;row={...row,state};return {...row};},finish:async(id,state,patch)=>{if(row.state!==state)return null;row={...row,...patch};return {...row};}};
 const provider={emission:async args=>{calls.push(args);if(args.operation===fail)throw Error("timeout");return args.operation==="create"?{id:remote,revision:1}:args.operation==="validate"?{valid:true}:args.operation==="detail"?{state:"authorized",protocol:"123456789012345"}:{processed:true};}};
 return {service:createNfeHomologationService({repository,provider,companyId:2541}),calls,row:()=>row};
}
test("create validate issue process detail remain distinct and homologation-only",async()=>{
 const f=fixture();await f.service.create("local");await f.service.validate("local");
 assert.throws(()=>f.service.issue("local",false),/CONFIRMATION/);
 await f.service.issue("local",true);
 assert.equal(f.row().state,"queued");
 assert.equal(f.calls[2].key,key);
 await f.service.process("local",true);
 assert.equal(f.row().state,"awaiting_confirmation");
 await f.service.detail("local");assert.equal(f.row().state,"authorized");
 assert.equal(f.calls.every(c=>c.environment===2&&c.company===2541),true);
 assert.deepEqual(f.calls.map(c=>c.operation),["create","validate","issue","process_pending","detail"]);
});
test("concurrent create claim permits one external draft only",async()=>{
 const f=fixture();const outcomes=await Promise.allSettled([f.service.create("local"),f.service.create("local")]);
 assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(f.calls.length,1);
});
test("timeout creating does not create another draft",async()=>{
 const f=fixture("create");await assert.rejects(f.service.create("local"));assert.equal(f.row().state,"create_uncertain");
 await assert.rejects(f.service.create("local"),/OPERATION_CONFLICT/);assert.equal(f.calls.length,1);
});
test("issue timeout preserves key and requires detail rather than blind resend",async()=>{
 const f=fixture("issue");await f.service.create("local");await f.service.validate("local");
 await assert.rejects(f.service.issue("local",true));assert.equal(f.row().state,"issue_uncertain");assert.equal(f.row().issue_key,key);
 await assert.rejects(f.service.issue("local",true),/OPERATION_CONFLICT/);
 await f.service.detail("local");assert.equal(f.row().state,"authorized");
});
