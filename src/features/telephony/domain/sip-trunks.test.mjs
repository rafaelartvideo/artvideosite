import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';

async function load(){
 const request=await transformWithEsbuild(readFileSync('src/features/telephony/application/pbx-request.ts','utf8'),'pbx-request.ts',{loader:'ts'});
 const url='data:text/javascript;base64,'+Buffer.from(request.code).toString('base64');
 const source=readFileSync('src/features/telephony/application/sip-trunks.ts','utf8').replace("'./pbx-request'",JSON.stringify(url));
 const built=await transformWithEsbuild(source,'sip-trunks.ts',{loader:'ts'});
 return import('data:text/javascript;base64,'+Buffer.from(built.code).toString('base64'));
}
test('new trunk is disabled, inbound blocked and password is never a row field',async()=>{
 const api=await load();const draft=api.newSipTrunk();
 assert.equal(draft.enabled,false);assert.equal(draft.inbound_enabled,false);
 assert.equal('password' in draft,false);
});
test('save binds company, sends password only as explicit write and sanitizes server failures',async()=>{
 const api=await load();const calls=[];
 const client={rpc(name,params){calls.push({name,params});return{abortSignal:async()=>({data:null,error:{message:'sensitive provider details'}})}}};
 const trunk=api.newSipTrunk();trunk.name='Company line';
 await assert.rejects(api.saveSipTrunk(client,'org',trunk,'test-secret'),error=>!error.message.includes('sensitive')&&!error.message.includes('test-secret'));
 assert.equal(calls[0].params.p_organization_id,'org');
 assert.equal(calls[0].params.p_password,'test-secret');
 assert.equal(calls[0].params.p_inbound_enabled,false);
});
