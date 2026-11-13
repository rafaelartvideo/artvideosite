import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';
const read=p=>readFileSync(p,'utf8');
test('controle legado é opt-in do poll plataforma protocol2 e nunca recebe segredos',async()=>{
 const p='supabase/functions/union-pbx-agent/index.ts',s=read(p);
 assert.match(s,/isPlatform\s*&&\s*body\.protocol_version===2[\s\S]*?legacy_trunks_v1/);
 const start=s.indexOf('let legacyTrunks:');const end=s.indexOf('let recordingPolicy:',start);assert.ok(start>0&&end>start);const block=s.slice(start,end);
 assert.ok(block.indexOf('pbx_admit_legacy_trunk_poll')<block.indexOf('pbx_sync_legacy_trunks'));
 assert.match(block,/p_agent_id:agent\.id/);assert.match(block,/p_sequence:seq/);assert.match(block,/organization_id===agent\.organization_id/);
 assert.doesNotMatch(block,/select\([^)]*password|vault|encrypted_secret|\.\.\.report/);
 assert.match(s,/legacy_trunks:legacyTrunks/);
 assert.ok((await transformWithEsbuild(s,p,{loader:'ts'})).code);
});
test('agente preserva prioridade de login e exige preparo explícito antes de receber controles',()=>{
 const s=read('scripts/union-pbx-agent/agent.py');
 assert.match(s,/legacy-trunks-init/);assert.match(s,/legacy_trunk_reports/);assert.match(s,/legacy_trunks_v1/);
 const apply=s.indexOf("payload['legacy_trunks']");assert.ok(apply>s.indexOf('for job in jobs:'));
 assert.match(s,/legacy\.apply_snapshot/);assert.match(s,/except Busy:/);
});
