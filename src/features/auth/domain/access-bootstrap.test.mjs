import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/features/auth/domain/access-bootstrap.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { resolveBootstrapAccessWindow, shouldBlockAccessLoad } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`
);
const window = {
  allowed: true, restricted: true, timezone: 'America/Sao_Paulo',
  server_now: '2026-11-11T12:00:00Z', next_end_at: '2026-11-11T15:00:00Z',
};

test('expediente já validado pelo bootstrap não faz outra requisição', async () => {
  let calls = 0;
  const result = await resolveBootstrapAccessWindow({ accessWindow: window }, async () => {
    calls++; throw Error('requisição redundante');
  });
  assert.deepEqual(result, window);
  assert.equal(calls, 0);
});

test('backend anterior exige uma única validação de expediente antes de liberar acesso', async () => {
  let calls = 0;
  const result = await resolveBootstrapAccessWindow({}, async () => { calls++; return window; });
  assert.deepEqual(result, window);
  assert.equal(calls, 1);
});

test('expediente negado continua negado sem tentar outra fonte de autorização', async () => {
  const denied = { ...window, allowed: false, next_end_at: null };
  assert.deepEqual(await resolveBootstrapAccessWindow({ accessWindow: denied }, async () => {
    throw Error('não pode substituir uma negativa');
  }), denied);
});

test('respostas de expediente inválidas não liberam o usuário nem usam fallback', async () => {
  for (const accessWindow of [null, {}, {allowed: 'true', restricted: false}, {allowed: true}]) {
    await assert.rejects(resolveBootstrapAccessWindow({ accessWindow }, async () => window), /Resposta inválida/);
  }
});

test('acesso restrito permitido exige limites de tempo válidos fornecidos pelo servidor', async () => {
  for (const invalid of [
    { ...window, server_now: null },
    { ...window, next_end_at: null },
    { ...window, server_now: 'inválido' },
    { ...window, next_end_at: 'inválido' },
    { ...window, next_end_at: '2026-11-11T12:00:00Z' },
    { ...window, next_end_at: '2026-11-11T11:00:00Z' },
  ]) {
    await assert.rejects(resolveBootstrapAccessWindow({ accessWindow: invalid }, async () => window), /Resposta inválida/);
  }
});

test('acesso irrestrito dispensa limite de término e falha do backend legado não libera acesso', async () => {
  const unrestricted = { allowed: true, restricted: false, timezone: 'America/Sao_Paulo', server_now: null, next_end_at: null };
  assert.deepEqual(await resolveBootstrapAccessWindow({accessWindow: unrestricted}, async () => window), unrestricted);
  await assert.rejects(resolveBootstrapAccessWindow({}, async () => {throw Error('serviço indisponível');}), /serviço indisponível/);
});

test('refresh da mesma empresa mantém a tela, mas login e troca de empresa continuam bloqueantes', () => {
  assert.equal(shouldBlockAccessLoad('empresa-a', 'empresa-a', true), false);
  assert.equal(shouldBlockAccessLoad('empresa-a', 'empresa-b', true), true);
  assert.equal(shouldBlockAccessLoad(null, 'empresa-a', true), true);
  assert.equal(shouldBlockAccessLoad('empresa-a', null, true), true);
  assert.equal(shouldBlockAccessLoad('empresa-a', 'empresa-a', false), true);
});
