import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
async function load() {
  const path = 'src/features/telephony/application/call-history.ts';
  assert.ok(existsSync(path), 'consulta de histórico deve existir');
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const org = 'ffec0c6c-c18e-4f01-83e8-88dcdac82a8b';
const filters = { from: '2026-11-01', to: '2026-11-09', direction: '', disposition: '', number: '' };

test('datas inválidas, períodos excessivos, empresa ausente e pesquisa injetada bloqueiam consulta', async () => {
  const { queryCallHistory } = await load();
  let calls = 0;
  const client = { from() { calls++; throw new Error('unexpected query'); } };
  for (const [organization, input] of [[null, filters], [org, { ...filters, from: '2026-02-30' }],
    [org, { ...filters, from: '2026-01-01' }], [org, { ...filters, number: '1),organization_id.eq.other' }],
    [org, { ...filters, direction: 'forged' }], [org, { ...filters, number: '*' }], [org, { ...filters, from: '2026-11-10' }]]) {
    assert.throws(() => queryCallHistory(client, organization, input, 1, 25, new AbortController().signal));
  }
  assert.equal(calls, 0, 'entradas inválidas devem ser recusadas antes da consulta');
});

test('consulta exige tenant, intervalo fechado/aberto, filtros seguros, ordenação estável e cancelamento', async () => {
  const { queryCallHistory } = await load();
  const calls = [];
  const query = new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); return query; } });
  const signal = new AbortController().signal;
  queryCallHistory({ from: table => { calls.push(['from', table]); return query; } }, org,
    { ...filters, direction: 'inbound', disposition: 'NO ANSWER', number: '7998803' }, 2, 25, signal);
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'organization_id' && c[2] === org));
  assert.ok(calls.some(c => c[0] === 'gte' && c[1] === 'started_at'));
  assert.ok(calls.some(c => c[0] === 'lt' && c[1] === 'started_at'));
  assert.ok(calls.some(c => c[0] === 'or' && c[1] === 'source.ilike.%7998803%,destination.ilike.%7998803%'));
  assert.deepEqual(calls.filter(c => c[0] === 'range'), [['range', 25, 49]]);
  assert.deepEqual(calls.filter(c => c[0] === 'order').map(c => c[1]), ['started_at', 'id']);
  assert.ok(calls.some(c => c[0] === 'abortSignal' && c[1] === signal));
});

test('histórico usa componentes do CRM, identifica pernas, dados vazios e nenhuma gravação fictícia', () => {
  const path = 'src/features/telephony/presentation/UnionPbxHistoryPage.tsx';
  assert.ok(existsSync(path), 'tela de histórico deve existir');
  const page = readFileSync(path, 'utf8');
  for (const contract of ['PageHeader', 'AdminButton', 'FInput', 'AdminSelect', 'PaginationBar', 'pbxRequest',
    'AbortController', 'loadCallHistory', 'Nenhum registro', 'pernas de chamadas', 'não são gravações']) assert.ok(page.includes(contract), contract);
  const admin = readFileSync('src/app/Admin.tsx', 'utf8');
  assert.match(admin, /route\.subpage === "historico"/);
  assert.ok(admin.includes('onHistory='));
  assert.ok(readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx', 'utf8').includes('onHistory'));
});

test('pesquisa por ramal inclui as duas associações mesmo quando destino técnico está vazio', async () => {
  const { queryCallHistory } = await load();
  const id = 'c7983c3e-56cb-424f-bc8c-7bb8ff9ec952';
  const clauses = [];
  const query = new Proxy({}, { get: (_, method) => (...args) => { if (method === 'or') clauses.push(args[0]); return query; } });
  queryCallHistory({ from: () => query }, org, { ...filters, number: '302' }, 1, 25, new AbortController().signal, [id]);
  assert.ok(clauses[0].includes(`source_extension_id.eq.${id}`));
  assert.ok(clauses[0].includes(`destination_extension_id.eq.${id}`));
});

test('ramal pesquisado é resolvido na empresa atual antes da consulta paginada', async () => {
  const { loadCallHistory } = await load();
  const calls = [], id = 'c7983c3e-56cb-424f-bc8c-7bb8ff9ec952';
  const client = { from(table) {
    const query = {};
    for (const method of ['select', 'eq', 'gte', 'lt', 'or', 'order', 'limit', 'range', 'abortSignal']) {
      query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
    }
    query.then = resolve => resolve(table === 'pbx_extensions' ? { data: [{ id }] } : { data: [], count: 0 });
    return query;
  } };
  await loadCallHistory(client, org, { ...filters, number: '302' }, 1, 25, new AbortController().signal);
  assert.ok(calls.some(c => c[0] === 'pbx_extensions' && c[1] === 'eq' && c[2] === 'organization_id' && c[3] === org));
  assert.ok(calls.some(c => c[0] === 'pbx_extensions' && c[1] === 'eq' && c[2] === 'number' && c[3] === 302));
  assert.ok(calls.some(c => c[0] === 'pbx_call_logs' && c[1] === 'or' && c[2].includes(`destination_extension_id.eq.${id}`)));
});
