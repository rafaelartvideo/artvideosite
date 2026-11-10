import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

async function load() {
  const path = 'src/features/telephony/application/call-controls.ts';
  assert.ok(existsSync(path), 'adaptador de controles deve existir');
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
function session() {
  const state = { operations: [], events: null, done: null, terminated: 0 };
  return { state,
    isEstablished: () => true, isReadyToReOffer: () => true,
    hold: (_, done) => { state.operations.push('hold'); state.done = done; return true; },
    unhold: (_, done) => { state.operations.push('unhold'); state.done = done; return true; },
    refer: (target, options) => { state.operations.push(target); state.events = options.eventHandlers; return {}; },
    terminate: () => { state.terminated++; },
  };
}

test('espera e retomada só concluem após confirmação de renegociação', async () => {
  const { holdCall } = await load(); const sip = session(); let completed = false;
  const waiting = holdCall(sip, true).then(() => { completed = true; });
  await Promise.resolve(); assert.equal(completed, false);
  assert.deepEqual(sip.state.operations, ['hold']); sip.state.done(); await waiting;
  const resume = holdCall(sip, false); assert.deepEqual(sip.state.operations, ['hold', 'unhold']);
  sip.state.done(); await resume;
});

test('recusa espera se a sessão não permite renegociação, sem enviar SIP', async () => {
  const { holdCall } = await load(); const sip = session(); sip.isReadyToReOffer = () => false;
  await assert.rejects(holdCall(sip, true), /negocia|aguarde/i); assert.equal(sip.state.operations.length, 0);
  sip.isReadyToReOffer = () => true; sip.hold = () => false;
  await assert.rejects(holdCall(sip, true), /negocia|aguarde/i);
});

test('aceitação do REFER não equivale a transferência concluída', async () => {
  const { transferCall } = await load(); const sip = session(); let completed = false;
  const pending = transferCall(sip, '302', new Set(['302'])).then(() => { completed = true; });
  sip.state.events.requestSucceeded(); await Promise.resolve(); assert.equal(completed, false);
  sip.state.events.progress(); await Promise.resolve(); assert.equal(completed, false);
  sip.state.events.accepted(); await pending; assert.equal(completed, true);
  assert.deepEqual(sip.state.operations, ['sip:302@pbx.unionworld.com.br']);
  assert.equal(sip.state.terminated, 0, 'o adaptador nunca encerra a sessão original por conta própria');
});

test('destino externo, não autorizado ou injetado nunca envia REFER', async () => {
  const { transferCall } = await load();
  for (const target of ['5579988037605', '302@evil.example', '900', '302\r\nRefer-To: sip:evil', '0302', '302 ']) {
    const sip = session(); await assert.rejects(transferCall(sip, target, new Set(['302'])), /ramal|destino/i);
    assert.equal(sip.state.operations.length, 0);
  }
});

test('falha final de transferência rejeita sem encerrar a chamada', async () => {
  const { transferCall } = await load(); const sip = session();
  const pending = transferCall(sip, '302', new Set(['302']));
  sip.state.events.failed(); await assert.rejects(pending, /transfer/i); assert.equal(sip.state.terminated, 0);
});

test('cancelamento e prazo liberam a operação e ignoram confirmação tardia', async () => {
  const { transferCall, holdCall } = await load(); const sip = session(); const abort = new AbortController();
  const pending = transferCall(sip, '302', new Set(['302']), { signal: abort.signal });
  abort.abort(); await assert.rejects(pending, { name: 'AbortError' });
  sip.state.events.accepted(); assert.equal(sip.state.terminated, 0);
  await assert.rejects(holdCall(session(), true, { timeoutMs: 10 }), { name: 'CallControlTimeoutError' });
});

test('sessões encerradas ou cancelamento prévio não iniciam controles', async () => {
  const { transferCall, holdCall } = await load(); const sip = session(); sip.isEstablished = () => false;
  await assert.rejects(transferCall(sip, '302', new Set(['302'])), /chamada/i);
  await assert.rejects(holdCall(sip, true), /chamada/i);
  const live = session(); const abort = new AbortController(); abort.abort();
  await assert.rejects(holdCall(live, true, { signal: abort.signal }), { name: 'AbortError' });
  assert.equal(live.state.operations.length, 0);
});

test('controles compartilham sessão e cancelam operações ao encerrar a ligação', async () => {
  const page = readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx', 'utf8');
  assert.match(page, /controlAbortRef\.current\?\.abort\(\)/);
  assert.match(page, /await transferCall\(/);
  assert.match(page, /await holdCall\(/);
  assert.equal((page.match(/<UnionPbxCallActions/g) || []).length, 2, 'telefone completo e flutuante precisam dos mesmos controles');
  assert.match(page, /sessionRef\.current === session/);
  assert.match(page, /controlLockRef\.current/);
  assert.match(page, /kind === 'transfer' && transferUncertainRef\.current/);
  assert.match(page, /item\.endpoint_name !== sipUser/, 'a identidade SIP conectada deve excluir o próprio ramal mesmo quando a consulta de vínculo falhar');
  assert.ok((await transformWithEsbuild(page, 'UnionPbxToolPage.tsx', { loader: 'tsx' })).code);
});
