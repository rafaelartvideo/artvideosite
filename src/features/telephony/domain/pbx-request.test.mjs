import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
async function load() {
  const path = 'src/features/telephony/application/pbx-request.ts';
  assert.ok(existsSync(path), 'limite de consultas do PABX deve existir');
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
test('consulta que nunca responde termina com etapa e aborta a requisição', async () => {
  const { pbxRequest } = await load(); let signal;
  const pending = pbxRequest(s => { signal = s; return new Promise(() => {}); }, 'Consulta de ramais', { timeoutMs: 10 });
  await assert.rejects(pending, /Consulta de ramais.*tempo/i); assert.equal(signal.aborted, true);
});
test('cancelamento impede consulta ou cancela uma consulta em andamento', async () => {
  const { pbxRequest } = await load(); const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(pbxRequest(() => { calls++; return Promise.resolve(1); }, 'Etapa', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  const live = new AbortController(); let signal;
  const pending = pbxRequest(s => { signal = s; return new Promise(() => {}); }, 'Etapa', { signal: live.signal });
  live.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(signal.aborted, true);
});
test('sucesso mantém o resultado e erros não deixam o temporizador pendente', async () => {
  const { pbxRequest } = await load();
  assert.deepEqual(await pbxRequest(() => Promise.resolve({ value: 4 }), 'Etapa'), { value: 4 });
  const error = new Error('offline');
  await assert.rejects(pbxRequest(() => Promise.reject(error), 'Etapa'), e => e === error);
  await assert.rejects(pbxRequest(() => { throw error; }, 'Etapa'), e => e === error);
});
test('resposta tardia após timeout não é entregue ao consumidor', async () => {
  const { pbxRequest } = await load(); let deliver;
  const pending = pbxRequest(() => new Promise(resolve => { deliver = resolve; }), 'Credencial', { timeoutMs: 10 });
  await assert.rejects(pending, /Credencial/); deliver('late'); await Promise.resolve();
});
