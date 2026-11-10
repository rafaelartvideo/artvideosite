import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
async function load() {
  const path='src/features/telephony/application/queue-availability.ts';
  assert.ok(existsSync(path));
  const {code}=await transformWithEsbuild(readFileSync(path,'utf8'),path,{loader:'ts'});
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const org='company-a', now=Date.parse('2026-11-10T02:00:00Z');
const row={organization_id:org,queue_id:'queue',extension_id:'extension',revision:'new',request_generation:1,desired_paused:true,status:'applied',updated_at:'2026-11-10T01:59:30Z',last_checked_at:'2026-11-10T01:59:50Z'};

test('confirmação recente supera snapshot anterior e solicitação pendente não vira estado aplicado',async()=>{
 const {queueControlState}=await load();
 assert.equal(queueControlState(row,false,'2026-11-10T01:59:40Z',now).paused,true);
 assert.equal(queueControlState({...row,status:'pending'},false,'2026-11-10T01:59:40Z',now).paused,false);
 assert.equal(queueControlState(row,false,'2026-11-10T01:59:55Z',now).paused,false);
 assert.equal(queueControlState(row,false,'2026-11-10T01:59:40Z',now+100000).paused,false);
});
test('resposta atrasada não sobrescreve revisão nova nem confirmação e recusa outra empresa',async()=>{
 const {mergeAvailability}=await load();
 const key='queue/extension';
 let state=mergeAvailability({},[row],org);
 state=mergeAvailability(state,[{...row,status:'pending',last_checked_at:null}],org);
 assert.equal(state[key].status,'applied');
 state=mergeAvailability(state,[{...row,organization_id:'other',revision:'foreign',updated_at:'2026-11-10T02:00:01Z'}],org);
 assert.equal(state[key].revision,'new');
});
test('ações de pausa usam RPC por empresa, atualização em tempo real e controles do CRM',()=>{
 const path='src/features/telephony/presentation/UnionPbxMemberAvailability.tsx';
 assert.ok(existsSync(path)); const ui=readFileSync(path,'utf8');
 for(const item of ['AdminButton','queueControlState','isQueueSnapshotCurrent','ready','pending'])assert.ok(ui.includes(item),item);
 const page=readFileSync('src/features/telephony/presentation/UnionPbxQueuesPage.tsx','utf8');
 assert.ok(page.includes('.rpc("pbx_set_queue_member_paused"'));
 assert.ok(page.includes('p_organization_id:activeOrganizationId'));
 const live=readFileSync('src/features/telephony/presentation/UnionPbxQueueLiveStatus.tsx','utf8');
 assert.ok(live.includes('pbx_queue_member_controls'));
 assert.ok(live.includes('pbx_queue_controls_ready'));
 assert.equal((live.match(/supabase\.channel\(/g)||[]).length,1);
});
test('nova geração prevalece mesmo com horários iguais ou confirmação antiga posterior',async()=>{
 const {mergeAvailability}=await load(); const key='queue/extension';
 const current=mergeAvailability({},[row],org);
 const newer={...row,revision:'latest',request_generation:2,status:'pending',last_checked_at:null};
 const result=mergeAvailability(current,[newer],org);
 assert.equal(result[key].revision,'latest');
 assert.equal(mergeAvailability(result,[row],org)[key].revision,'latest');
});
test('snapshot realtime atrasado não substitui leitura mais recente',async()=>{
 const {newestQueueSnapshot}=await load();
 assert.equal(typeof newestQueueSnapshot,'function');
 const current={sampled_at:'2026-11-10T01:59:50Z',members:['paused']};
 const stale={sampled_at:'2026-11-10T01:59:40Z',members:['available']};
 assert.equal(newestQueueSnapshot(current,stale),current);
 assert.equal(newestQueueSnapshot(stale,current),current);
});
