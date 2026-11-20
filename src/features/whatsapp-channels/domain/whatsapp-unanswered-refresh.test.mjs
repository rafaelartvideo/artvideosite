import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';

async function mount() {
  const source=readFileSync('src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx','utf8');
  const effect=source.slice(source.indexOf('  // Clock changes can make another chat overdue'),source.indexOf('  // Navegação contextual do Dashboard'));
  const {code}=await transform(effect,{loader:'tsx'});
  let tick,cleanup,calls=0;const pending=[],failures=[],applied=[],document={hidden:false};
  const organizationRef={current:'org'},accountRef={current:'phone'};
  const names=['useEffect','embedded','documentVisible','channelReady','activeOrganizationId','activeChannelId','activeChannelPhone','sharedActivity','filter','queueSettings','window','conversationPageCacheRef','refresh','listUnionWhatsAppUnansweredCount','setConversationCounts','organizationRef','accountRef','document'];
  new Function(...names,code)(fn=>{cleanup=fn();},false,true,true,'org','channel','phone',null,'waiting',{unanswered_priority_minutes:15},
    {setInterval(fn){tick=fn;return 1;},clearInterval(){}},{current:new Map()},()=>{},()=>{calls++;return new Promise((resolve,reject)=>{pending.push(resolve);failures.push(reject);});},
    update=>applied.push(update({unanswered:0})),organizationRef,accountRef,document);
  return {tick:()=>tick(),cleanup:()=>cleanup(),pending,failures,applied,calls:()=>calls,organizationRef,document};
}
test('unanswered fallback keeps one request in flight without caching subsequent results',async()=>{
  const h=await mount();h.tick();h.tick();assert.equal(h.calls(),1);
  h.pending[0](7);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.applied[0].unanswered,7);
  h.tick();assert.equal(h.calls(),2);h.cleanup();h.pending[1](8);
});
test('unanswered response cannot update a closed or switched account',async()=>{
  const h=await mount();h.tick();h.cleanup();h.pending[0](9);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.applied.length,0);
  const switched=await mount();switched.tick();switched.organizationRef.current='other';switched.pending[0](9);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(switched.applied.length,0);switched.cleanup();
});
test('hidden tabs do not poll and a failed count can retry on the next interval',async()=>{
  const h=await mount();h.document.hidden=true;h.tick();assert.equal(h.calls(),0);
  h.document.hidden=false;h.tick();h.failures[0](new Error('network'));
  await new Promise(resolve=>setImmediate(resolve));h.tick();assert.equal(h.calls(),2);
  h.cleanup();h.pending[1](0);
});
