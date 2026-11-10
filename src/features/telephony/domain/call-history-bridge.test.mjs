import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

const path = 'supabase/functions/union-pbx-agent/index.ts';
const agentId = '86aa884f-02c0-4ddd-af77-99391b177287';
const organizationId = 'ffec0c6c-c18e-4f01-83e8-88dcdac82a8b';

async function bridge({ fail = false, enabled = true, admitted = true, platform = true, admissionError = false } = {}) {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64');
  let handler;
  const calls = [];
  const updates = [];
  const admissions = [];
  const filters = [];
  const admin = {
    from(table) {
      const query = {
        select() { return query; }, eq(...args) { filters.push([table, ...args]); return query; }, lt() { return query; },
        gt() { return query; }, order() { return query; }, limit() { return query; },
        abortSignal() { return query; }, delete() { return query; },
        update(value) { if (table === 'pbx_agents') updates.push(value); return query; },
        then(resolve) { return Promise.resolve(resolve({ data: [] })); },
        async maybeSingle() { return { data: { id: agentId, organization_id: organizationId, enabled, public_key: publicKey, last_sequence: 0 } }; },
      };
      assert.ok(table.startsWith('pbx_'));
      return query;
    },
    async rpc(name, args) {
      if (name === 'pbx_admit_agent_request') {
        admissions.push(args);
        return admissionError ? { error: { code: 'XX000' } } : { data: { allowed: admitted, is_platform: platform } };
      }
      calls.push({ name, args }); return fail ? { error: { code: '23514' } } :
      name === 'pbx_poll_queue_availability' ? { data: [] } : { data: { accepted: true, acknowledged: (args.p_records || args.p_results).length } }; },
  };
  globalThis.__historyCreateClient = () => admin;
  globalThis.Deno = { env: { get: () => 'configured' }, serve: value => { handler = value; } };
  const source = readFileSync(path, 'utf8').replace(/^import .*createClient.*;$/m, 'const createClient = globalThis.__historyCreateClient;');
  const { code } = await transformWithEsbuild(source, path, { loader: 'ts' });
  await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${crypto.randomUUID()}`);
  return {
    calls,
    updates,
    admissions,
    filters,
    async send(body, tamper = false) {
      const time = String(Date.now()), sequence = '1', raw = JSON.stringify(body);
      const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(`${time}\n${sequence}\n${raw}`));
      return handler(new Request('https://example.test', { method: 'POST', body: tamper ? raw + ' ' : raw,
        headers: { 'Content-Type': 'application/json', 'X-Pbx-Agent': agentId, 'X-Pbx-Time': time,
          'X-Pbx-Sequence': sequence, 'X-Pbx-Signature': Buffer.from(signature).toString('base64') } }));
    },
  };
}

test('flow commands are opt-in and reports remain signed and bound to organization/version', async () => {
  const legacy=await bridge();
  assert.equal((await legacy.send({action:'poll',protocol_version:2})).status,200);
  assert.equal(legacy.filters.some(item=>item[0]==='pbx_call_flows'),false);
  const current=await bridge();
  const response=await current.send({action:'poll',protocol_version:2,features:['flows-v1']});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).flow_jobs,[]);
  assert.ok(current.filters.some(item=>item[0]==='pbx_call_flows'&&item[1]==='organization_id'&&item[2]===organizationId));
  const report=await bridge();
  const flowId=crypto.randomUUID(),version='2026-11-10T20:00:00Z';
  assert.equal((await report.send({action:'report_flow',id:flowId,version,status:'applied'})).status,200);
  for(const [field,value] of [['id',flowId],['organization_id',organizationId],['updated_at',version],['provisioning_status','pending']]){
    assert.ok(report.filters.some(item=>item[0]==='pbx_call_flows'&&item[1]===field&&item[2]===value));
  }
  const forged=await bridge();
  assert.equal((await forged.send({action:'report_flow',id:flowId,version,status:'applied'},true)).status,401);
  assert.equal(forged.filters.some(item=>item[0]==='pbx_call_flows'),false);
});

test('histórico passa pela assinatura e usa apenas o agente verificado, ignorando empresa forjada', async () => {
  const b = await bridge();
  const records = [{ event_id: 'sample:1' }];
  const response = await b.send({ action: 'report_calls', records, organization_id: 'forged', agent_id: 'forged' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, acknowledged: 1 });
  assert.deepEqual(b.calls, [{ name: 'pbx_ingest_call_records', args: { p_agent_id: agentId, p_records: records } }]);
});

test('every runtime action requires database admission after signature verification', async () => {
  for (const body of [
    { action: 'poll', protocol_version: 2 },
    { action: 'report_calls', records: [{}] },
    { action: 'report_availability', results: [{}] },
    { action: 'report_login', id: agentId, ciphertext: 'A'.repeat(342) + '==' },
    { action: 'report', id: agentId, version: '2026-11-10T14:00:00Z', status: 'applied' },
    { action: 'report_queue', id: agentId, version: '2026-11-10T14:00:00Z', status: 'applied' },
  ]) {
    const b = await bridge({ admitted: false, platform: false });
    assert.equal((await b.send(body)).status, 403, body.action);
    assert.equal(b.admissions.length, 1);
    assert.equal(b.calls.length, 0, 'no runtime RPC after rejected admission');
    assert.equal(b.updates.length, 1, 'only replay/heartbeat advanced');
  }
});

test('signed poll submits profile identity to service-only admission using the verified agent', async () => {
  const b = await bridge({ platform: false });
  const context = 'uwi-' + organizationId.replaceAll('-', '');
  assert.equal((await b.send({ action: 'poll', protocol_version: 3, profile_id: organizationId,
    profile_context: context, agent_id: 'forged', organization_id: 'forged' })).status, 200);
  assert.deepEqual(b.admissions[0], { p_agent_id: agentId, p_sequence: 1, p_action: 'poll',
    p_protocol_version: 3, p_profile_id: organizationId, p_profile_context: context });
  assert.ok(b.calls.some(call => call.name === 'pbx_poll_queue_availability'));
  assert.ok(b.filters.some(filter => filter[0] === 'pbx_browser_login_requests' && filter[1] === 'agent_id' && filter[2] === agentId));
  assert.equal(b.updates[0].capability_seen_at, undefined, 'generic heartbeat must not forge capability');
});

test('invalid signature never reaches capability admission and denied poll cannot publish telemetry', async () => {
  const invalid = await bridge();
  assert.equal((await invalid.send({ action: 'poll', protocol_version: 3 }, true)).status, 401);
  assert.equal(invalid.admissions.length, 0);
  const denied = await bridge({ admitted: false, platform: false });
  assert.equal((await denied.send({ action: 'poll', protocol_version: 2, profile_id: 'forged' })).status, 403);
  assert.equal(denied.filters.filter(filter => filter[0] === 'pbx_queues').length, 0);
});

test('login delivery is bound to the verified agent rather than organization alone', async () => {
  const b = await bridge();
  assert.equal((await b.send({ action: 'report_login', id: agentId, ciphertext: 'A'.repeat(342) + '==' })).status, 200);
  assert.ok(b.filters.some(filter => filter[0] === 'pbx_browser_login_requests' && filter[1] === 'agent_id' && filter[2] === agentId));
});

test('admission failure closes provisioning and partner polls never query external trunks', async () => {
  const unavailable = await bridge({ admissionError: true });
  assert.equal((await unavailable.send({ action: 'poll', protocol_version: 3 })).status, 503);
  assert.equal(unavailable.calls.length, 0);
  assert.equal(unavailable.filters.some(filter => filter[0] === 'pbx_extensions'), false);
  const partner = await bridge({ platform: false });
  assert.equal((await partner.send({ action: 'poll', protocol_version: 3,
    profile_id: organizationId, profile_context: `uwi-${organizationId.replaceAll('-', '')}` })).status, 200);
  assert.equal(partner.filters.some(filter => filter[0] === 'pbx_trunks'), false);
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

test('confirmações de pausa usam somente agente assinado e lote limitado', async () => {
  const b = await bridge();
  const results = [{ queue_id: 'sample', status: 'applied' }];
  const response = await b.send({ action: 'report_availability', results, agent_id: 'forged' });
  assert.equal(response.status, 200);
  assert.deepEqual(b.calls, [{ name: 'pbx_report_queue_availability', args: { p_agent_id: agentId, p_results: results } }]);
  assert.equal((await b.send({ action: 'report_availability', results: Array(11).fill({}) })).status, 400);
});

test('somente protocolo compatível recebe pausas e rollback do agente restaura protocolo antigo', async () => {
  const b = await bridge();
  const current = await b.send({ action: 'poll', protocol_version: 2 });
  assert.equal(current.status, 200);
  assert.deepEqual((await current.json()).availability_jobs, []);
  assert.ok(b.admissions.some(row => row.p_protocol_version === 2));
  assert.ok(b.calls.some(call => call.name === 'pbx_poll_queue_availability'));
  const old = await bridge();
  assert.equal((await old.send({ action: 'poll' })).status, 200);
  assert.ok(old.admissions.some(row => row.p_protocol_version === null));
  assert.equal(old.calls.filter(call => call.name === 'pbx_poll_queue_availability').length, 0);
});
