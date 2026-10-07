import {test} from 'node:test';import assert from 'node:assert/strict';
import {SAC_ENDPOINTS} from './sac-contracts.mjs';
import * as runtime from './sac-runtime.mjs';
test('only client reads and WhatsApp group reads remain in the resource catalog',()=>{
 const enabled=SAC_ENDPOINTS.filter(e=>runtime.resourceEnabled(e.id));
 assert.deepEqual([...new Set(enabled.map(e=>e.area))],['Contatos','Grupos de WhatsApp']);
 assert.ok(enabled.every(e=>e.method==='GET'));
});
test('legacy actions are blocked before any provider work',()=>{
 for(const action of ['sms_replies','delivery_history','process_jobs'])assert.equal(runtime.actionEnabled(action),false,action);
 for(const action of ['send_message','send_media','refresh_protocol','bootstrap','start_new_conversation','routing_options'])assert.equal(runtime.actionEnabled(action),true,action);
 assert.equal(runtime.actionEnabled('resource_operation',45),false);
 assert.equal(runtime.actionEnabled('resource_operation',42),true);
});
test('SMS and unknown webhook events do not enter the job queue',()=>{
 assert.equal(runtime.eventEnabled('smsideal_reply'),false);assert.equal(runtime.eventEnabled('unknown'),false);
 assert.equal(runtime.eventEnabled('protocol_new_message'),true);assert.equal(runtime.eventEnabled('contact_new'),true);
});

test('the browser catalog contains only the enabled contracts',async()=>{
 const {SAC_ENDPOINTS:browser}=await import('./sac-operational-contracts.mjs');
 assert.deepEqual(browser,SAC_ENDPOINTS.filter(e=>runtime.resourceEnabled(e.id)));
});

test('company integration configuration remains available without enabling legacy catalog',()=>{
 for(const action of ['health','resource_health','test_connection','retry_webhook_event','operator_bindings_admin','set_operator_binding_admin'])assert.equal(runtime.actionEnabled(action),true,action);
 assert.equal(runtime.actionEnabled('resource_operation',45),false);
 assert.equal(runtime.actionEnabled('sms_replies'),false);
});
test('operational queue and protocol selection stay active without exposing legacy resource menus',()=>{
 for(const id of [72,73]){
  assert.equal(runtime.actionEnabled('resource_operation',id),true);
  assert.equal(runtime.resourceEnabled(id),false);
 }
});
