import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {transform} from 'esbuild';
async function repository(responses){
 const calls=[];let pos=0;
 const supabase={from:table=>{
  const steps=[['from',table]],reply=responses[pos++];calls.push(steps);
  const builder={then:(yes,no)=>Promise.resolve(reply).then(yes,no)};
  for(const name of ['select','eq','in','or','order','limit','range'])builder[name]=(...args)=>{steps.push([name,...args]);return builder;};
  return builder;
 }};
 const {code}=await transform(readFileSync('src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts','utf8'),{loader:'ts',format:'cjs'});
 const module={exports:{}};new Function('require','module','exports',code)(()=>({supabase}),module,module.exports);return {repo:module.exports,calls};
}
test('anexos carregam 24 itens por cursor estável com desempate em ID e escopo completo',async()=>{
 const rows=Array.from({length:25},(_,i)=>({id:String(30-i),sent_at:'2026-11-21T12:00:00+00:00',message_type:'image'}));
 const {repo,calls}=await repository([{data:rows,error:null},{data:[],error:null}]);
 const page=await repo.listUnionWhatsAppSharedItems('org','thread','channel','5511','media');
 assert.equal(page.items.length,24);assert.equal(page.hasMore,true);assert.deepEqual(page.nextCursor,{sent_at:rows[23].sent_at,id:rows[23].id});
 const next=await repo.listUnionWhatsAppSharedItems('org','thread','channel','5511','media',page.nextCursor);
 assert.equal(next.hasMore,false);assert.equal(next.nextCursor,null);
 for(const call of calls){assert.equal(call.some(x=>x[0]==='range'),false);assert.ok(call.some(x=>x[0]==='limit'&&x[1]===25));
  for(const [key,value] of [['organization_id','org'],['channel_id','channel'],['account_phone','5511'],['conversation_id','thread']])assert.ok(call.some(x=>x[0]==='eq'&&x[1]===key&&x[2]===value));}
 assert.ok(calls[1].some(x=>x[0]==='or'&&x[1]===`sent_at.lt.${page.nextCursor.sent_at},and(sent_at.eq.${page.nextCursor.sent_at},id.lt.${page.nextCursor.id})`));
});
test('consulta de anexos propaga erro sem apresentar sucesso vazio',async()=>{
 const error=Error('database unavailable'),{repo}=await repository([{data:null,error}]);
 await assert.rejects(repo.listUnionWhatsAppSharedItems('org','thread','channel','5511','documents'),/database unavailable/);
});
