import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
test('sinal da VPS expira na tela e não aceita horário inválido, futuro ou agente revogado',async()=>{
 const path='src/features/telephony/domain/agent-health.ts';assert.ok(existsSync(path));
 const {code}=await transformWithEsbuild(readFileSync(path,'utf8'),path,{loader:'ts'});
 const {isAgentHeartbeatFresh}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
 const seen='2026-11-10T03:00:00Z',now=Date.parse(seen);
 assert.equal(isAgentHeartbeatFresh(true,seen,now+1000),true);
 assert.equal(isAgentHeartbeatFresh(true,seen,now+120000),false);
 assert.equal(isAgentHeartbeatFresh(false,seen,now),false);
 assert.equal(isAgentHeartbeatFresh(true,'invalid',now),false);
 assert.equal(isAgentHeartbeatFresh(true,seen,now-6000),false);
 const panel=readFileSync('src/features/telephony/presentation/UnionPbxAgentPanel.tsx','utf8');
 assert.ok(panel.includes('window.setInterval'));
 assert.ok(panel.includes('window.clearInterval'));
});
