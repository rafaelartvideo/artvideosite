import test from 'node:test';
import assert from 'node:assert/strict';
import {providerDelivery,submissionCanMatchHistory} from './sac-delivery.mjs';
test('provider acceptance and request diagnostics never imply delivery',()=>{
 assert.deepEqual(providerDelivery({status:true,request_id:'diagnostic'}),{state:'accepted',externalMessageId:null});
 assert.equal(providerDelivery({status:true,notification_id:'n'}).state,'queued');
});
test('provider timestamps and explicit message identifiers preserve actual delivery evidence',()=>{
 assert.deepEqual(providerDelivery({status:{status:'sent',sended_at:'2026-10-09 11:30:00'},message_id:'real'}),{state:'sent',externalMessageId:'sac:real'});
 assert.equal(providerDelivery({status:{delivered_at:'2026-10-09 11:30:00'}}).state,'delivered');
 assert.equal(providerDelivery({readed_at:'2026-10-09 11:30:00'}).state,'read');
});
test('an old history entry cannot confirm a new preliminary submission with the same text',()=>{
 const metadata={client_request_id:'uuid',submission_started_at:'2026-10-09T14:30:00Z'};
 assert.equal(submissionCanMatchHistory(metadata,Date.parse('2026-10-09T14:29:00Z')),false);
 assert.equal(submissionCanMatchHistory(metadata,Date.parse('2026-10-09T14:30:12Z')),true);
});
test('history cannot confirm a rejected submission or overwrite another external message identity',()=>{
 const metadata={client_request_id:'request',submission_started_at:'2026-10-09T14:30:00Z',delivery_status:'accepted'};
 const time=Date.parse('2026-10-09T14:30:12Z');
 assert.equal(submissionCanMatchHistory({...metadata,delivery_status:'rejected'},time,null,'sac:A'),false);
 assert.equal(submissionCanMatchHistory(metadata,time,'sac:B','sac:A'),false);
 assert.equal(submissionCanMatchHistory(metadata,time,'sac:A','sac:A'),true);
 assert.equal(submissionCanMatchHistory(metadata,time,null,'sac:A'),true);
});
