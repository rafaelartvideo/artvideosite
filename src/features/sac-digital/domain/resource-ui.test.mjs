import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaMaximum, resultItems, formValues, deliveryLabel, fieldVisible } from './resource-ui.mjs';
test('media uses provider limits', () => { assert.equal(mediaMaximum('audio/ogg'), 3*1024*1024); assert.equal(mediaMaximum('video/mp4'),5*1024*1024); assert.equal(mediaMaximum('image/png'),1024*1024); });
test('unknown sends never imply delivery', () => { assert.equal(deliveryLabel({sent_via_union:true}), 'Aguardando confirmação'); assert.equal(deliveryLabel({status:'delivered'}),'Entregue'); });
test('list wrappers preserve rows and scalar details', () => { assert.deepEqual(resultItems({contacts:[{id:1}]}),[{id:1}]); assert.deepEqual(resultItems({name:'Ana'}),[{name:'Ana'}]); });
test('conditional hidden fields are excluded and types coerced', () => { const fields=[{name:'type',type:'text'},{name:'count',type:'number'},{name:'caption',type:'text',when:{type:'image'}}]; assert.deepEqual(formValues(fields,{type:'text',count:'2',caption:'unused'}),{type:'text',count:2}); assert.equal(fieldVisible(fields[2],{type:'image'}),true); });
test('unknown provider outcome is actionable without implying rejection', async () => { const { apiDiagnostic, initialValues }=await import('./resource-ui.mjs'); assert.match(apiDiagnostic({outcome:'unknown',error:'Tempo esgotado'}),/Não repita/); assert.deepEqual(initialValues([{name:'p',type:'number',required:true},{name:'protocol',type:'text'}],'123'),{p:1,protocol:'123'}); });
test('intent survives unknown and allows repeated confirmed messages', async()=>{const { IntentLedger, recordContext, friendlyEntries }=await import('./resource-ui.mjs'); let n=0;const ledger=new IntentLedger(()=>String(++n));const key={action:'send',text:'Olá'};assert.equal(ledger.begin(key),'1');ledger.finish(key,'unknown');assert.equal(ledger.begin(key),'1');ledger.finish(key,'accepted');assert.equal(ledger.begin(key),'2');assert.deepEqual(recordContext([{name:'contact'},{name:'p'}],{id:'A'},'Contatos'),{contact:'A',p:1});assert.deepEqual(friendlyEntries({token:'secret',request_id:'x',name:'Ana'}),[['Nome','Ana']]);});
test('private attachment hydration selects at most50 and preserves public/cached URLs',async()=>{const {privateMediaIds,hydrateMedia}=await import('./resource-ui.mjs');const rows=[{id:'private',media_url:'cached',raw_metadata:{temp_storage_bucket:'sac-digital-attachments'}},{id:'public',media_url:'public',raw_metadata:{temp_storage_bucket:'sac-digital-media'}}];assert.deepEqual(privateMediaIds(rows),['private']);assert.equal(privateMediaIds(Array.from({length:70},(_,id)=>({...rows[0],id:String(id)}))).length,50);assert.deepEqual(hydrateMedia(rows,{private:'fresh',public:'unexpected'}).map(r=>r.media_url),['fresh','public']);assert.deepEqual(hydrateMedia(rows,{}),rows);});
test('channel chooser filters inactive/primary callcenter and forces Cloud templates',async()=>{const {usableChannels,cloudChannel,approvedTemplates}=await import('./resource-ui.mjs');assert.deepEqual(usableChannels([{id:'off',status:'disconnected'},{id:'primary',type:'callcenter',primary:true},{id:'secondary',type:'callcenter',primary:false},{id:'cloud',type:'cloud',actived:true}]).map(c=>c.id),['secondary','cloud']);assert.equal(cloudChannel({type:'cloud'}),true);assert.equal(cloudChannel({type:'unknown'}),false);assert.deepEqual(approvedTemplates([{id:'yes',status:'APPROVED'},{id:'no',status:'REJECTED'}]).map(t=>t.id),['yes']);});

test('group membership and coupon code retain their parent without using related record ID',async()=>{const {recordContext}=await import('./resource-ui.mjs');assert.deepEqual(recordContext([{name:'id'},{name:'contact'}],{id:'group-1'},'Grupos de Contatos',null,{sourceEndpointId:19}),{id:'group-1'});assert.deepEqual(recordContext([{name:'id'},{name:'contact'}],{id:'contact-23'},'Grupos de Contatos',null,{sourceEndpointId:20,parent:{groupId:'group-1'}}),{id:'group-1',contact:'contact-23'});assert.deepEqual(recordContext([{name:'id'},{name:'code'}],{id:'customer-1',code:'abc'},'Cupom',null,{sourceEndpointId:46,parent:{couponId:'coupon-1'}}),{id:'coupon-1',code:'abc'});});


test('delivery labels use history timestamps and never treat a provider ACK as delivery', () => {
 assert.equal(deliveryLabel({sac_history:{status:{sended_at:'2026-10-09T10:00:00Z'}}}), 'Enviada');
 assert.equal(deliveryLabel({delivery_status:'accepted',sac_history:{status:{delivered_at:'2026-10-09T10:00:00Z'}}}), 'Entregue');
 assert.equal(deliveryLabel({delivery_status:'sent',sac_history:{status:{readed_at:'2026-10-09T10:00:00Z'}}}), 'Lida');
 assert.equal(deliveryLabel({api_response:{status:true,success:true,request_id:'ack'}}), 'Aguardando confirmação');
 assert.equal(deliveryLabel({delivery_status:'accepted'}), 'Aceita pela SAC');
});


test('history delivery updates refresh the open conversation without reloading bulk inserts', async () => {
 const { liveMessageChanges } = await import('./resource-ui.mjs');
 const history = {protocol_id:'current',direction:'outgoing',raw_metadata:{history_synced:true}};
 assert.deepEqual(liveMessageChanges({eventType:'INSERT',new:history},'current'),{selected:false,unread:false,inbox:false});
 assert.deepEqual(liveMessageChanges({eventType:'UPDATE',new:history},'current'),{selected:true,unread:false,inbox:false});
 assert.deepEqual(liveMessageChanges({eventType:'UPDATE',new:history},'other'),{selected:false,unread:false,inbox:false});
 assert.deepEqual(liveMessageChanges({eventType:'INSERT',new:{protocol_id:'current',direction:'incoming'}},'current'),{selected:true,unread:true,inbox:true});
});
