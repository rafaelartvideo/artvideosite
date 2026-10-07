import test from 'node:test';import assert from 'node:assert/strict';import {canonicalEvent,classifyMessage,ingestEvent,EVENTS,acceptsState,runJobs} from './sac-events.mjs';
test('canonical dedupe and all eight events',()=>{assert.equal(canonicalEvent({b:2,a:{z:1,x:3}}),canonicalEvent({a:{x:3,z:1},b:2}));assert.equal(EVENTS.length,8);});
test('media before caption',()=>assert.equal(classifyMessage({text:'caption',image:'https://image'}),'image'));
test('state ordering',()=>assert.equal(acceptsState('2026-10-07T12:00Z','2026-10-07T11:00Z'),false));
test('durable ingress ACK does not await delayed background',async()=>{let durable=false,release;const slow=new Promise(r=>release=r);const result=await ingestEvent({payload:{event:'protocol_opened'},organizationId:'org',hash:async()=> 'hash',persist:async()=>{durable=true;return {event_id:1};},accelerate:()=>slow,waitUntil:()=>{}});assert.equal(durable,true);assert.equal(result.event_id,1);release();});
test('durable failure prevents ACK',async()=>assert.rejects(ingestEvent({payload:{},organizationId:'org',hash:async()=>'',persist:async()=>{throw Error('database');}})));
test('failed jobs retained for retry',async()=>{const results=[];await runJobs({claim:async()=>[{id:1}],execute:async()=>{throw Error('timeout');},finish:async(j,e)=>results.push(e)});assert.match(results[0],/Falha/);});
