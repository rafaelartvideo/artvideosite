import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

const path = 'supabase/functions/union-pbx-agent/index.ts';
const agentId = '86aa884f-02c0-4ddd-af77-99391b177287';
const organizationId = 'ffec0c6c-c18e-4f01-83e8-88dcdac82a8b';

async function bridge({ fail = false, enabled = true } = {}) {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64');
  let handler;
  const calls = [];
  const admin = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, lt() { return query; },
        update() { return query; },
        async maybeSingle() { return { data: { id: agentId, organization_id: organizationId, enabled, public_key: publicKey, last_sequence: 0 } }; },
      };
      assert.equal(table, 'pbx_agents');
      return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return fail ? { error: { code: '23514' } } : { data: { accepted: true, acknowledged: args.p_records.length } }; },
  };
  globalThis.__historyCreateClient = () => admin;
  globalThis.Deno = { env: { get: () => 'configured' }, serve: value => { handler = value; } };
  const source = readFileSync(path, 'utf8').replace(/^import .*createClient.*;$/m, 'const createClient = globalThis.__historyCreateClient;');
  const { code } = await transformWithEsbuild(source, path, { loader: 'ts' });
  await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${crypto.randomUUID()}`);
  return {
    calls,
    async send(body, tamper = false) {
      const time = String(Date.now()), sequence = '1', raw = JSON.stringify(body);
      const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(`${time}\n${sequence}\n${raw}`));
      return handler(new Request('https://example.test', { method: 'POST', body: tamper ? raw + ' ' : raw,
        headers: { 'Content-Type': 'application/json', 'X-Pbx-Agent': agentId, 'X-Pbx-Time': time,
          'X-Pbx-Sequence': sequence, 'X-Pbx-Signature': Buffer.from(signature).toString('base64') } }));
    },
  };
}

test('histórico passa pela assinatura e usa apenas o agente verificado, ignorando empresa forjada', async () => {
  const b = await bridge();
  const records = [{ event_id: 'sample:1' }];
  const response = await b.send({ action: 'report_calls', records, organization_id: 'forged', agent_id: 'forged' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, acknowledged: 1 });
  assert.deepEqual(b.calls, [{ name: 'pbx_ingest_call_records', args: { p_agent_id: agentId, p_records: records } }]);
});

test('assinatura inválida e agente revogado não escrevem histórico', async () => {
  const b = await bridge();
  assert.equal((await b.send({ action: 'report_calls', records: [{}] }, true)).status, 401);
  assert.equal(b.calls.length, 0);
  const revoked = await bridge({ enabled: false });
  assert.equal((await revoked.send({ action: 'report_calls', records: [{}] })).status, 401);
  assert.equal(revoked.calls.length, 0);
});

test('lotes fora do limite não chegam ao banco e rejeição não recebe confirmação', async () => {
  const b = await bridge();
  for (const records of [null, [], Array(11).fill({})]) {
    assert.equal((await b.send({ action: 'report_calls', records })).status, 400);
  }
  assert.equal(b.calls.length, 0);
  const failed = await bridge({ fail: true });
  const response = await failed.send({ action: 'report_calls', records: [{}] });
  assert.equal(response.status, 400);
  assert.notEqual((await response.json()).accepted, true);
});
