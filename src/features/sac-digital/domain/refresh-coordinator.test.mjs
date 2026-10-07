import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as module from './refresh-coordinator.mjs';
test('concurrent refresh callers share one request and its result',async()=>{
 let calls=0,release;const run=()=>{calls++;return new Promise(resolve=>release=resolve)};
 const a=module.singleFlight('org:protocols',run),b=module.singleFlight('org:protocols',run);
 await Promise.resolve();assert.equal(calls,1);release(['latest']);assert.deepEqual(await a,['latest']);assert.deepEqual(await b,['latest']);
});
test('a burst of realtime events produces one refresh',async()=>{
 let calls=0;const queue=module.createRefreshQueue(async()=>{calls++},5);
 for(let i=0;i<100;i++)queue.request();
 await new Promise(r=>setTimeout(r,20));queue.dispose();assert.equal(calls,1);
});
test('the screen becomes usable while unread counters are still pending',async()=>{
 let ready=false,protocolsRequested=false;
 await module.initializeSacScreen({loadStatus:async()=>{},loadProtocols:async()=>{protocolsRequested=true},
   loadUnreadCounts:()=>new Promise(()=>{}),onReady:()=>{ready=true}});
 assert.equal(ready,true);assert.equal(protocolsRequested,true);
});

test('notifications received during a request schedule only one trailing refresh',async()=>{
 let calls=0,release;
 const queue=module.createRefreshQueue(()=>{calls++;return calls===1?new Promise(r=>release=r):Promise.resolve()},5);
 queue.request();await new Promise(r=>setTimeout(r,15));
 for(let i=0;i<100;i++)queue.request();
 assert.equal(calls,1);release();await new Promise(r=>setTimeout(r,20));queue.dispose();assert.equal(calls,2);
});
test('failed reads release their slot for a later retry',async()=>{
 await assert.rejects(module.singleFlight('failed',async()=>{throw Error('temporary')}));
 assert.equal(await module.singleFlight('failed',async()=>42),42);
});
test('disposing a notification queue cancels its pending refresh',async()=>{
 let calls=0;const queue=module.createRefreshQueue(async()=>{calls++},5);
 queue.request();queue.dispose();await new Promise(r=>setTimeout(r,15));assert.equal(calls,0);
});
