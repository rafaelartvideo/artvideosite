import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as runtime from './sac-runtime.mjs';
import {buildSacRequest} from './sac-contracts.mjs';
import * as ui from '../../../src/features/sac-digital/domain/resource-ui.mjs';
const gateway=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('./sac-gateway.ts',import.meta.url),'utf8')).toString('base64'));
const jwt=sub=>'e30.'+Buffer.from(JSON.stringify({sub,scopes:['protocol']})).toString('base64url')+'.signature';
test('an application token with empty operator subject is not operational authentication',()=>{
 assert.equal(gateway.operatorTokenError(jwt('')),'operator_authorization_required');
 assert.equal(gateway.operatorTokenError(jwt('123')),null);
 assert.equal(gateway.operatorTokenError('opaque-provider-token'),null);
});
test('new conversations notify contacts before requiring an assigned operational protocol',()=>{
 assert.equal(gateway.newConversationRoute('operator',null),'notification');
 assert.equal(gateway.newConversationRoute('operator',{isAtt:false}),'client');
 assert.equal(gateway.newConversationRoute('operator',{isAtt:true}),'operator');
 assert.equal(gateway.newConversationRoute('manager',{isAtt:true}),'notification');
});
test('abandoned, inbox and actual operator queue are distinct states',()=>{
 const waiting=new Set(['current']);
 assert.equal(runtime.protocolOperationalStatus({external_protocol_id:'old',status:'inbox',raw_metadata:{api_info:{abandoned_at:'2026-10-08 12:00:00'}}},waiting),'abandoned');
 assert.equal(runtime.protocolOperationalStatus({external_protocol_id:'old',status:'inbox'},waiting),'inbox');
 assert.equal(runtime.protocolOperationalStatus({external_protocol_id:'current',status:'inbox'},waiting),'waiting');
 assert.equal(runtime.protocolOperationalStatus({external_protocol_id:'current',status:'finished',closed_at:'2026-10-09'},waiting),'finished');
 assert.equal(runtime.protocolOperationalStatus({status:'in_att',operator_id:null},waiting),'inbox');
});
test('operational mutation contracts use exact PATCH routes and bodies',()=>{
 assert.deepEqual(buildSacRequest(73,{protocol:'P123'}),{method:'PATCH',path:'/operator/att/select/P123',body:undefined,mode:'operator',scopes:['protocol','edit']});
 assert.equal(buildSacRequest(90,{protocol:'P123',to:'department',department:'D'}).path,'/operator/att/forward/P123');
 assert.deepEqual(buildSacRequest(90,{protocol:'P123',to:'operator',operator:'O'}).body,{to:'operator',operator:'O'});
 assert.deepEqual(buildSacRequest(92,{protocol:'P123',vote:3}).body,{vote:3});
});
test('socket authentication remains open until the operational request releases it',async()=>{
 let socket;
 class Socket extends EventTarget {constructor(url){super();socket=this;this.url=url;this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}close(){this.readyState=3;}}
 const session=await gateway.openOperatorSocket('fixture-token',Socket,50);
 assert.equal(socket.readyState,1);
 assert.equal(socket.url,'wss://ws.sac.digital/ws/att?fixture-token');
 session.close();assert.equal(socket.readyState,3);
});
test('missing OAuth operator authorization is rejected before mutation and releases the lease',async()=>{
 let sent=false,released=false,recorded;
 const result=await gateway.executeSacOperation({mode:'operator',method:'PATCH',path:'/operator/att/select/P123',protocol:'P123'}, {
  authorize:async()=>true,begin:async()=>({id:'A',state:'prepared',created:true}),lease:async()=>true,
  operator:async()=>{throw Object.assign(Error('Authorize operator'),{code:'operator_authorization_required'});},
  transport:async()=>{sent=true;},record:async(id,state)=>{recorded=state;},release:async()=>{released=true;},
 });
 assert.equal(result.type,'operator_authorization_required');assert.equal(result.outcome,'rejected');
 assert.equal(recorded,'rejected');assert.equal(sent,false);assert.equal(released,true);
});
test('queue recovery pauses only for a deterministic operator authorization error',()=>{
 assert.equal(ui.isOperatorAuthError(Object.assign(Error('authorize'),{type:'operator_authorization_required'})),true);
 assert.equal(ui.isOperatorAuthError(Error('operator_identity_mismatch: another profile')),true);
 assert.equal(ui.isOperatorAuthError(Object.assign(Error('timeout'),{type:'external_transport_failed'})),false);
 assert.equal(ui.isOperatorAuthError(Error('operator_session_unavailable: connection lost')),false);
});
test('finish routes provide required client notification flag and retain only operator vote',()=>{
 const input={protocol:'P123',vote:3,notify_contact:false};
 const auto=gateway.routeProtocolOperation(38,input,{is_open:true,is_att:false});
 assert.deepEqual(buildSacRequest(auto.endpointId,auto.values).body,{protocol:'P123',notify_contact:false});
 const operational=gateway.routeProtocolOperation(38,input,{is_open:true,is_att:true});
 assert.deepEqual(buildSacRequest(operational.endpointId,operational.values).body,{vote:3});
});

test('the SAC queue contains A and E; only A is waiting, and a selected Operator beats an older queue snapshot',()=>{
 const rows=[{protocol:'P-A',status:'A',abandoned_at:null,finish_at:null},{protocol:'P-E',status:'E',att_at:'2026-10-09 10:40:47'},{protocol:'P-F',status:'A',finish_at:'2026-10-09 11:00:00'},{protocol:'P-B',status:'A',abandoned_at:'2026-10-09 11:00:00'}];
 assert.deepEqual(runtime.waitingOperatorProtocolIds(rows),['P-A']);
 assert.equal(runtime.protocolOperationalStatus({external_protocol_id:'P-E',status:'in_att',operator_id:'op'},new Set(['P-E'])),'in_att');
 assert.equal(runtime.protocolOperationalStatus({external_protocol_id:'P-A',status:'inbox',operator_id:null},new Set(['P-A'])),'waiting');
});
test('queue rows without a confirmed waiting status are not guessed from ownership or names',()=>{
 assert.deepEqual(runtime.waitingOperatorProtocolIds([{protocol:'P',status:'E'},{protocol:'X'},{protocol:'P-A',status:'A'},{protocol:'P-A',status:'A'}]),['P-A']);
});
