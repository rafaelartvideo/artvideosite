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
test('initial loading waits for conversations and SAC profile, but not unread counters',async()=>{
 let ready=false,unreadStarted=false,releaseProtocols,releaseBinding;
 const protocols=new Promise(resolve=>{releaseProtocols=resolve;});
 const binding=new Promise(resolve=>{releaseBinding=resolve;});
 const initial=module.initializeSacScreen({
   loadStatus:async()=>({enabled:true}),
   loadProtocols:()=>protocols,
   loadOperatorBinding:enabled=>{assert.equal(enabled,true);return binding;},
   loadUnreadCounts:async()=>{unreadStarted=true;},
   onReady:()=>{ready=true;},
 });
 await Promise.resolve();assert.equal(ready,false);
 releaseProtocols();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(ready,false);
 releaseBinding();await initial;assert.equal(ready,true);
 await Promise.resolve();assert.equal(unreadStarted,true);
});
test('disabled integration does not require an Operator lookup, and bootstrap resolves on failed reads',async()=>{
 let bindingEnabled=null,readUnread=false,ready=false;
 await module.initializeSacScreen({
   loadStatus:async()=>({enabled:false}),
   loadProtocols:async()=>{throw Error('temporary unavailable');},
   loadOperatorBinding:async enabled=>{bindingEnabled=enabled;},
   loadUnreadCounts:async()=>{readUnread=true;},
   onReady:()=>{ready=true;},
 });
 assert.equal(bindingEnabled,false);assert.equal(ready,true);
 await Promise.resolve();assert.equal(readUnread,true);
});
test('unmounted SAC screens do not launch deferred unread requests',async()=>{
 let unread=false;
 await module.initializeSacScreen({
   loadStatus:async()=>({enabled:true}),
   loadProtocols:async()=>{},
   loadUnreadCounts:async()=>{unread=true;},
   onReady:()=>false,
 });
 assert.equal(unread,false);
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


test('a refresh after an operation waits for the older queue read and requests a new snapshot',async()=>{
 let release,calls=0;
 const old=module.singleFlight('operation-queue',()=>new Promise(r=>release=r));
 await Promise.resolve();
 const fresh=module.freshSingleFlight('operation-queue',async()=>{calls++;return ['current'];});
 await Promise.resolve();assert.equal(calls,0);
 release(['old']);assert.deepEqual(await old,['old']);assert.deepEqual(await fresh,['current']);assert.equal(calls,1);
});
test('a failed older queue read does not prevent a fresh snapshot',async()=>{
 let reject;
 const old=module.singleFlight('operation-failed',()=>new Promise((resolve,r)=>reject=r));
 await Promise.resolve();
 const fresh=module.freshSingleFlight('operation-failed',async()=>['current']);
 reject(Error('old request failed'));await assert.rejects(old);assert.deepEqual(await fresh,['current']);
});

test('normal polling during a fresh refresh shares the fresh barrier instead of the pre-operation response',async()=>{
 let release;
 const old=module.singleFlight('fresh-barrier',()=>new Promise(r=>release=r));
 await Promise.resolve();
 const fresh=module.freshSingleFlight('fresh-barrier',async()=>['fresh']);
 const normal=module.singleFlight('fresh-barrier',async()=>['unexpected']);
 release(['stale']);await old;
 assert.deepEqual(await fresh,['fresh']);assert.deepEqual(await normal,['fresh']);
});
