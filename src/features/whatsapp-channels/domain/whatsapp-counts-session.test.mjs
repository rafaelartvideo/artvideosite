import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
test('count cache shares only within the same authenticated viewer',async()=>{
  const source=readFileSync('src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts','utf8');
  const fragment=source.slice(source.indexOf('const WHATSAPP_COUNTS_CACHE_TTL_MS'),source.indexOf('export async function listUnionWhatsAppConversations')).replace('export function','function');
  const {code}=await transform(fragment+'\nreturn listUnionWhatsAppConversationCounts;',{loader:'ts'});
  const pending=[];let now=0;
  const list=new Function('supabase','listUnionWhatsAppUnansweredCount','raise','Date',code)(
    {rpc:()=>new Promise(resolve=>pending.push(resolve))},async()=>0,error=>{if(error)throw error;},
    {now:()=>now},
  );
  const a=list('org','channel','phone',15,'viewer-a');
  assert.equal(list('org','channel','phone',15,'viewer-a'),a);
  now=21000;
  assert.equal(list('org','channel','phone',15,'viewer-a'),a,'pending requests must still coalesce after the result TTL expires');
  const b=list('org','channel','phone',15,'viewer-b');
  assert.notEqual(a,b,'RLS-dependent counters from another viewer cannot be reused');
  assert.equal(pending.length,2);
  pending[0]({data:{waiting_count:1},error:null});pending[1]({data:{waiting_count:2},error:null});
  assert.equal((await a).waiting,1);assert.equal((await b).waiting,2);
  const fresh=list('org','channel','phone',15,'viewer-a');
  assert.notEqual(fresh,a,'finishing a slow request must not extend the original result TTL');
  pending[2]({data:{waiting_count:3},error:null});assert.equal((await fresh).waiting,3);
  const unknownA=list('org','channel','phone'),unknownB=list('org','channel','phone');
  assert.notEqual(unknownA,unknownB,'without an identity do not reuse authorization-dependent results');
  pending[3]({data:{},error:null});pending[4]({data:{},error:null});await Promise.all([unknownA,unknownB]);
});
test('persistent activity scope changes on a viewer swap within the same company and number',()=>{
  const provider=readFileSync('src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx','utf8');
  const declaration=provider.match(/const accountKey=([^\n]+);/)[1];
  const scope=new Function('user','organizationId','channelId','channelPhone',`return ${declaration};`);
  assert.notEqual(scope({id:'viewer-a'},'org','channel','phone'),scope({id:'viewer-b'},'org','channel','phone'));
});
