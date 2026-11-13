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

test('legacy controls send only scoped revision metadata and hide provider errors',async()=>{
 const api=await load();const calls=[];const controller=new AbortController();
 const client={rpc(name,params){calls.push({name,params});return{abortSignal:async signal=>{assert.equal(signal.aborted,false);return{data:name==='pbx_list_legacy_trunks'?[{id:'a',organization_id:'org'},{id:'b',organization_id:'other'}]:8,error:null}}}}};
 assert.deepEqual(await api.listLegacySipTrunks(client,'org',controller.signal),[{id:'a',organization_id:'org'}]);
 assert.equal(await api.setLegacySipTrunkEnabled(client,'org','a',false,7,controller.signal),8);
 assert.deepEqual(calls[1],{name:'pbx_set_legacy_trunk_enabled',params:{p_organization_id:'org',p_trunk_id:'a',p_enabled:false,p_expected_revision:7}});
 controller.abort();await assert.rejects(api.listLegacySipTrunks(client,'org',controller.signal));assert.equal(calls.length,2);
 const failure={rpc(){return{abortSignal:async()=>({error:{message:'private credentials'}})}}};
 await assert.rejects(api.setLegacySipTrunkEnabled(failure,'org','a',false,7),error=>!error.message.includes('private'));
});
test('blank password preserves the managed credential when changing enabled state',async()=>{
 const api=await load();let params;const client={rpc(_name,value){params=value;return{abortSignal:async()=>({data:'id',error:null})}}};
 await api.saveSipTrunk(client,'org',{...api.newSipTrunk(),id:'id',enabled:false},'');assert.equal(params.p_password,null);assert.equal(params.p_enabled,false);
});

test('legacy registration never claims a connection from stale, unknown or disabled observation',async()=>{
 const api=await load();const now=Date.parse('2026-11-13T12:00:00Z');const row={checked_at:new Date(now).toISOString(),observed_enabled:true,registration_state:'registered'};
 assert.equal(api.legacyRegistrationLabel(row,now),'Registrada na operadora');
 assert.equal(api.legacyRegistrationLabel({...row,checked_at:new Date(now-120001).toISOString()},now),'Registro sem confirmação recente');
 assert.equal(api.legacyRegistrationLabel({...row,checked_at:null},now),'Registro sem confirmação recente');
 assert.equal(api.legacyRegistrationLabel({...row,observed_enabled:null},now),'Registro desconhecido');
 assert.equal(api.legacyRegistrationLabel({...row,observed_enabled:false},now),'Linha observada desativada');
 assert.equal(api.legacyRegistrationLabel({...row,registration_state:'unknown'},now),'Registro desconhecido');
});
