import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

// Execute the production route; only external DB/provider boundaries are replaced.
const source = await readFile(process.env.SAC_API_SOURCE || new URL('../sac-digital-api/index.ts', import.meta.url), 'utf8');
const start = source.indexOf("if(action === 'reconcile_outbound')");
const end = source.indexOf("if(action === 'process_jobs')", start);
assert.ok(start > 0 && end > start);
const { code } = await transform(`export default async function(deps) {
 const {admin,requirePermission,organizationId,apiRequest,loadCredentials,syncProtocolHistory,json}=deps;
 const action='reconcile_outbound';
 ${source.slice(start, end)}
}`, { loader: 'ts', format: 'esm' });
const { default: reconcile } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

function fixture(attempts, { allowed = true, rejectedNotifications = [] } = {}) {
 const history = [], status = [], writes = [];
 let reads = 0;
 const admin = { from(table) {
  const query = {
   select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; },
   limit(size) { assert.equal(size, 5); reads++; return Promise.resolve({ data: attempts, error: null }); },
   update(patch) { writes.push({ table, patch }); return query; },
   then(resolve) { resolve({ error: null }); },
  };
  return query;
 } };
 return {
  history, status, writes, reads: () => reads,
  run: () => reconcile({
   admin, organizationId: 'org-a', requirePermission: async permission => {
    assert.equal(permission, 'sac_digital.messages.view'); return allowed;
   },
   loadCredentials: async organizationId => { assert.equal(organizationId, 'org-a'); return {}; },
   apiRequest: async (organizationId, credentials, path) => {
    assert.equal(organizationId, 'org-a'); status.push(path);
    const rejected = rejectedNotifications.some(id => path.endsWith(`id=${id}`));
    return { response: new Response('{}', { status: rejected ? 503 : 200 }), body: { status: !rejected, info: { delivered_at: '2026-10-30' } } };
   },
   syncProtocolHistory: async (organizationId, protocol) => {
    assert.equal(organizationId, 'org-a'); history.push(protocol);
   },
   json: (body, status = 200) => ({ body, status }),
  }),
 };
}

test('five attempts for one protocol retain every delivery check but sync history once', async () => {
 const env = fixture(Array.from({ length: 5 }, (_, i) => ({ id: `attempt-${i}`, notification_id: `notification-${i}`, protocol: 'protocol-a', state: 'sent' })));
 const response = await env.run();
 assert.equal(response.body.data.reconciled, 5);
 assert.equal(response.body.has_more, true);
 assert.equal(env.status.length, 5);
 assert.equal(env.writes.filter(write => write.patch.state === 'delivered').length, 5);
 assert.equal(env.writes.filter(write => write.patch.delivery_state === 'delivered').length, 5);
 assert.deepEqual(env.history, ['protocol-a']);
});

test('distinct protocols each sync and a later request still gets fresh history', async () => {
 const env = fixture([
  { id: '1', protocol: 'protocol-a', state: 'sent' },
  { id: '2', protocol: 'protocol-b', state: 'sent' },
  { id: '3', protocol: 'protocol-a', state: 'sent' },
 ]);
 await env.run(); await env.run();
 assert.deepEqual(env.history, ['protocol-a', 'protocol-b', 'protocol-a', 'protocol-b']);
});

test('denied permission performs no reads, provider checks or history sync', async () => {
 const env = fixture([{ id: '1', protocol: 'protocol-a' }], { allowed: false });
 assert.equal((await env.run()).status, 403);
 assert.equal(env.reads(), 0);
 assert.deepEqual(env.status, []);
 assert.deepEqual(env.history, []);
});

test('provider status failure keeps reconciliation skipped and does not claim history was synced', async () => {
 const env = fixture([
  { id: '1', notification_id: 'bad', protocol: 'protocol-a', state: 'sent' },
  { id: '2', notification_id: 'good', protocol: 'protocol-a', state: 'sent' },
 ], { rejectedNotifications: ['bad'] });
 assert.equal((await env.run()).body.data.reconciled, 1);
 assert.equal(env.status.length, 2);
 assert.deepEqual(env.history, ['protocol-a']);
});
