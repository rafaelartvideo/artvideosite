import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./sac-gateway.ts', import.meta.url), 'utf8');
const {executeSacOperation, operationPermission, responseEnvelope,parsePagination,operatorScopes,importPhoneCandidates,mayTryImportVariant,routeProtocolOperation,channelCapabilityError,ownMediaStoragePath,chooseImportChannel} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('permissions distinguish read, send, administrative and settings',()=>{
 assert.equal(operationPermission({method:'GET',path:'/contact/all',area:'contact'}),'sac_digital.messages.view');
 assert.equal(operationPermission({method:'POST',path:'/protocol/send',area:'protocol'}),'sac_digital.messages.send');
 assert.equal(operationPermission({method:'POST',path:'/campaign/create',area:'campaign'}),'sac_digital.settings.manage');
});
test('unknown mutations stay unknown and lease releases', async()=>{
 const calls=[]; const result=await executeSacOperation({method:'POST',path:'/client/protocol/send',mode:'operator',body:{}},{operator:async()=>{},authorize:async()=>true,begin:async()=>({id:'x',state:'prepared',created:true}),record:async(...args)=>calls.push(args),transport:async()=>{throw new Error('timeout')},lease:async()=>true,release:async()=>calls.push(['released'])});
 assert.equal(result.outcome,'unknown'); assert.equal(result.success,false); assert.equal(calls[0][1],'unknown'); assert.equal(calls[1][0],'released');
});
test('operator ambiguity fails before transport and mutation',async()=>{
 let called=false;const result=await executeSacOperation({method:'POST',path:'/operator/att/send/P',mode:'operator'},{authorize:async()=>true,transport:async()=>{called=true}});
 assert.equal(result.type,'operator_auth_contract_unverified'); assert.equal(called,false);
});
test('a duplicate unknown attempt never calls transport',async()=>{
 let called=false;const result=await executeSacOperation({method:'POST',path:'/client/protocol/send',mode:'client'},{authorize:async()=>true,begin:async()=>({id:'x',state:'unknown'}),transport:async()=>{called=true}});
 assert.equal(result.outcome,'unknown'); assert.equal(called,false);
});
test('accepted response retains real IDs and pagination, never request ID as message ID',()=>{
 const value=responseEnvelope({status:true,request_id:'audit',notification_id:'n',has_more:true,next_page:2},200);
 assert.equal(value.outcome,'queued');assert.equal(value.next_page,2);assert.equal(value.data.message_id,undefined);
});
test('operator selects PATCH inside lease before executing and releases',async()=>{
 const order=[];const result=await executeSacOperation({method:'POST',path:'/operator/att/send/P',mode:'operator',protocol:'P',body:{type:'text',text:'fixture'}},{authorize:async()=>true,begin:async()=>({id:'a',state:'prepared',created:true}),record:async()=>{},lease:async()=>{order.push('lease');return true},release:async()=>order.push('release'),operator:async()=>order.push('login'),transport:async op=>{order.push(`${op.method} ${op.path}`);return {response:new Response('{}'),body:{status:true}}}});
 assert.equal(result.success,true);assert.deepEqual(order,['lease','login','PATCH /operator/att/select/P','POST /operator/att/send/P','release']);
});
test('busy operator finalizes attempt without invoking transport',async()=>{
 const recorded=[];const result=await executeSacOperation({method:'POST',path:'/operator/att/send/P',mode:'operator'},{authorize:async()=>true,begin:async()=>({id:'a',state:'prepared',created:true}),operator:async()=>{},lease:async()=>false,record:async(...args)=>recorded.push(args)});
 assert.equal(result.type,'operator_busy');assert.equal(recorded[0][1],'rejected');
});
test('scope handshake includes profile and edit when selecting',()=>{assert.deepEqual(operatorScopes(['send','protocol'],true),['edit','profile','protocol','send']);});
test('duplicate prepared attempt never executes',async()=>{
 let called=false;const value=await executeSacOperation({method:'POST',path:'/client/protocol/send',mode:'client'},{authorize:async()=>true,begin:async()=>({id:'a',state:'prepared',created:false}),transport:async()=>{called=true}});assert.equal(called,false);assert.equal(value.outcome,'unknown');
});
test('missing pagination only stops at empty page, explicit pager continues',()=>{
 assert.deepEqual(parsePagination({list:[{id:1}]},4),{has_more:true,next_page:5});
 assert.deepEqual(parsePagination({list:[]},5),{has_more:false,next_page:null});
 assert.deepEqual(parsePagination({pager:{has_more:true,next_page:7}},6),{has_more:true,next_page:7});
 assert.deepEqual(parsePagination({list:[1],has_more:false},4),{has_more:false,next_page:null});
});
test('phone import variants retain DDI and retries only documented validation refusal',()=>{
 assert.deepEqual(importPhoneCandidates('5511998765432'),['5511998765432','551198765432']);
 assert.equal(mayTryImportVariant({type:'invalid_number'},400),true);
 assert.equal(mayTryImportVariant({type:'error_valid_wpp'},500),false);
 assert.equal(mayTryImportVariant({type:'invalid_number',outcome:'unknown'},400),false);
});
test('common protocol routing protects direct catalog requests',()=>{
 assert.deepEqual(routeProtocolOperation(36,{protocol:'P',type:'image',url:'https://fixture.test/media',text:'caption'},{is_att:true,is_open:true}),{endpointId:78,values:{protocol:'P',type:'image',url:'https://fixture.test/media',caption:'caption'}});
 assert.throws(()=>routeProtocolOperation(37,{protocol:'P'},{is_att:true,is_open:true}),/operacional/);
 assert.throws(()=>routeProtocolOperation(38,{protocol:'P'},{is_att:true,is_open:true}),/votação/);
 assert.deepEqual(routeProtocolOperation(38,{protocol:'P',vote:5,notify_contact:false},{is_att:true,is_open:true}),{endpointId:92,values:{protocol:'P',vote:5}});
 assert.deepEqual(routeProtocolOperation(38,{protocol:'P',vote:5,notify_contact:false},{is_att:false,is_open:true}),{endpointId:38,values:{protocol:'P',notify_contact:false}});
 assert.throws(()=>routeProtocolOperation(36,{protocol:'P'},{is_closed:true}),/encerrado/);
});
test('operational reads cannot select without manage permission',async()=>{
 let called=false;const value=await executeSacOperation({method:'GET',path:'/operator/att/messages/P',mode:'operator',protocol:'P'},{authorize:async permission=>permission.endsWith('messages.view'),operator:async()=>{},transport:async()=>{called=true}});assert.equal(value.type,'permission_denied');assert.equal(called,false);
});
test('channel special capabilities use explicit supplier metadata and inactive rejects',()=>{
 assert.match(channelCapabilityError({actived:false,id:'a'},{type:'text'}),/ativo/);
 assert.match(channelCapabilityError({actived:true,type:'callcenter',primary:true},{type:'text'}),/secundário/);
 assert.equal(channelCapabilityError({actived:true,type:'callcenter',primary:false},{type:'text'}),null);
 assert.match(channelCapabilityError({actived:true,type:'whatsapp_cloud'},{type:'text'}),/template/);
 assert.equal(channelCapabilityError({actived:true,type:'whatsapp_cloud'},{type:'template',template:'approved'}),null);
 assert.match(channelCapabilityError({actived:true,type:'future_cloud_type'},{type:'text'}),/não confirmada/);
 assert.equal(channelCapabilityError({actived:true,primary:true,id:'legacy'},{type:'text'}),null);
});
test('empty mutation result is unknown and records evidence failure',async()=>{
 let recorded;const value=await executeSacOperation({method:'POST',path:'/client/protocol/send',mode:'client'},{authorize:async()=>true,begin:async()=>({id:'a',state:'prepared',created:true}),record:async(id,state)=>recorded=state,transport:async()=>({response:new Response('{}'),body:{}})});assert.equal(value.success,false);assert.equal(value.outcome,'unknown');assert.equal(recorded,'unknown');
});
test('paginated operation uses its actual requested page and rejects missing list',async()=>{
 const value=await executeSacOperation({method:'GET',path:'/client/contact/all?p=4',mode:'client'},{authorize:async()=>true,transport:async()=>({response:new Response('{}'),body:{list:[{id:'a'}]}})});assert.equal(value.next_page,5);
 const malformed=await executeSacOperation({method:'GET',path:'/client/contact/all?p=4',mode:'client'},{authorize:async()=>true,transport:async()=>({response:new Response('{}'),body:{status:true}})});assert.equal(malformed.success,false);assert.equal(malformed.type,'invalid_provider_response');
 assert.equal(responseEnvelope({},200).success,false);
});
test('invalid selection response never executes the business mutation',async()=>{
 const paths=[];const value=await executeSacOperation({method:'POST',path:'/operator/att/send/P',mode:'operator',protocol:'P'},{authorize:async()=>true,begin:async()=>({id:'a',state:'prepared',created:true}),operator:async()=>{},lease:async()=>true,release:async()=>{},record:async()=>{},transport:async operation=>{paths.push(operation.path);return {response:new Response('{}'),body:{}}}});assert.equal(value.success,false);assert.deepEqual(paths,['/operator/att/select/P']);
});
test('media refresh signs only new private bucket paths inside the organization',()=>{
 const metadata={temp_storage_bucket:'sac-digital-attachments',temp_storage_path:'org/file.jpg'};
 assert.equal(ownMediaStoragePath({raw_metadata:metadata},'org'),'org/file.jpg');
 assert.equal(ownMediaStoragePath({raw_metadata:{...metadata,temp_storage_bucket:'sac-digital-outbox'}},'org'),null);
 assert.equal(ownMediaStoragePath({raw_metadata:{...metadata,temp_storage_path:'other/file.jpg'}},'org'),null);
 assert.equal(ownMediaStoragePath({raw_metadata:{...metadata,temp_storage_path:'org/../other/file.jpg'}},'org'),null);
});

test('closed or unknown provider modality never defaults to manager send',()=>{assert.throws(()=>routeProtocolOperation(36,{protocol:'P',type:'text',text:'Hi'},{is_att:false,is_open:false}),/encerrado/);assert.throws(()=>routeProtocolOperation(36,{protocol:'P',type:'text',text:'Hi'},{}),/confirmar/);assert.throws(()=>routeProtocolOperation(36,{protocol:'P',type:'text',text:'Hi'},{is_open:true}),/confirmar/);});

test('Callcenter import never chooses primary or inactive secondary',()=>{assert.equal(chooseImportChannel([{id:'p',primary:true,actived:true,type:'callcenter'},{id:'off',primary:false,actived:false,type:'callcenter'},{id:'s',primary:false,actived:true,type:'callcenter'}]).id,'s');assert.throws(()=>chooseImportChannel([{id:'p',primary:true,actived:true,type:'callcenter'}]),/secundário/);});
