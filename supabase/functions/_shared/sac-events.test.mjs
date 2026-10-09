import test from 'node:test';import assert from 'node:assert/strict';import {canonicalEvent,classifyMessage,ingestEvent,EVENTS,acceptsState,runJobs} from './sac-events.mjs';
test('canonical dedupe and all eight events',()=>{assert.equal(canonicalEvent({b:2,a:{z:1,x:3}}),canonicalEvent({a:{x:3,z:1},b:2}));assert.equal(EVENTS.length,8);});
test('media before caption',()=>assert.equal(classifyMessage({text:'caption',image:'https://image'}),'image'));
test('state ordering',()=>assert.equal(acceptsState('2026-10-07T12:00Z','2026-10-07T11:00Z'),false));
test('durable ingress ACK does not await delayed background',async()=>{let durable=false,release;const slow=new Promise(r=>release=r);const result=await ingestEvent({payload:{event:'protocol_opened'},organizationId:'org',hash:async()=> 'hash',persist:async()=>{durable=true;return {event_id:1};},accelerate:()=>slow,waitUntil:()=>{}});assert.equal(durable,true);assert.equal(result.event_id,1);release();});
test('durable failure prevents ACK',async()=>assert.rejects(ingestEvent({payload:{},organizationId:'org',hash:async()=>'',persist:async()=>{throw Error('database');}})));
test('failed jobs retained for retry',async()=>{const results=[];await runJobs({claim:async()=>[{id:1}],execute:async()=>{throw Error('timeout');},finish:async(j,e)=>results.push(e)});assert.match(results[0],/Falha/);});
test('projection-created reconciliation is claimed in the same worker invocation',async()=>{
 const queue=[{id:1,kind:'projection'}],calls=[];
 const result=await runJobs({claim:async limit=>queue.splice(0,limit),execute:async job=>{calls.push(job.kind);if(job.kind==='projection')queue.push({id:2,kind:'reconciliation'});},finish:async()=>{},limit:4});
 assert.deepEqual(calls,['projection','reconciliation']);assert.equal(result.completed,2);
});
test('independent protocol jobs run within a bounded parallel limit',async()=>{
 const queue=[{id:1},{id:2},{id:3}],started=[];let release;
 const held=new Promise(resolve=>release=resolve);
 const work=runJobs({claim:async limit=>queue.splice(0,limit),execute:async job=>{started.push(job.id);if(job.id===1)await held;},finish:async()=>{},limit:3,concurrency:2});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(started,[1,2]);release();assert.equal((await work).completed,3);
});
