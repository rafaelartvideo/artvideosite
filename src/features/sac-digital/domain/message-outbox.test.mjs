import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SacMessageOutbox } from './message-outbox.mjs';
const context = { organizationId: 'org-a', userId: 'operator', protocolId: 'p-a', externalProtocolId: '100' };
const tick = () => new Promise(resolve => setImmediate(resolve));
function makeOutbox() {
  let id = 0;
  return new SacMessageOutbox({ createId: () => String(++id), now: () => '2026-10-09T10:00:00Z' });
}

test('composer remains enabled while an individual message is pending', async () => {
  const page = await readFile(new URL('../presentation/SacDigitalToolPage.tsx', import.meta.url), 'utf8');
  const composer = page.slice(page.indexOf('<textarea'));
  assert.doesNotMatch(composer, /disabled=\{sending|loading=\{sending\}/, 'A pending send must not disable the next draft');
});

test('consume draft synchronously, preserve the next draft, serialize sends per operator', async () => {
  const outbox = makeOutbox(); let release; const calls = [];
  outbox.compose(context, { text: 'primeira' });
  const first = outbox.send(context, async entry => { calls.push(entry.message.body_text); return new Promise(resolve => { release = resolve; }); });
  assert.equal(outbox.composer(context).text, '');
  assert.equal(outbox.send(context, async () => { throw Error('duplicate'); }), null);
  outbox.compose(context, { text: 'segunda' });
  const second = outbox.send(context, async entry => { calls.push(entry.message.body_text); return { outcome: 'accepted', local_message_id: 'server-2' }; });
  outbox.compose(context, { text: 'terceira ainda no campo' });
  await tick(); assert.deepEqual(calls, ['primeira']);
  assert.deepEqual(outbox.visible(context, []).map(row => row.raw_metadata.local_submission), ['sending', 'queued']);
  release({ outcome: 'accepted', local_message_id: 'server-1' });
  await Promise.all([first.done, second.done]);
  assert.deepEqual(calls, ['primeira', 'segunda']);
  assert.equal(outbox.composer(context).text, 'terceira ainda no campo');
});

test('failures retain text and file without overwriting a newer draft or automatically retrying an unknown send', async () => {
  const outbox = makeOutbox(); const file = { name: 'foto.jpg', type: 'image/jpeg', size: 5 };
  outbox.compose(context, { text: 'legenda', file });
  const send = outbox.send(context, async () => { throw Object.assign(Error('timeout'), { outcome: 'unknown' }); });
  outbox.compose(context, { text: 'novo texto' });
  await send.done;
  assert.equal(outbox.visible(context, [])[0].raw_metadata.local_submission, 'unknown');
  assert.equal(outbox.composer(context).text, 'novo texto');
  assert.equal(outbox.restore(context, send.id), false);
  outbox.compose(context, { text: '' });
  assert.equal(outbox.restore(context, send.id), false, 'Uncertain sends cannot be retried');
  outbox.compose(context, { text: 'falha', file });
  const failed = outbox.send(context, async () => { throw Object.assign(Error('rejected'), { outcome: 'rejected' }); });
  await failed.done;
  assert.equal(outbox.restore(context, failed.id), true);
  assert.deepEqual(outbox.composer(context), { text: 'falha', file });
});

test('realtime before RPC reconciles by client id and preserves intentionally identical messages', async () => {
  const outbox = makeOutbox(); let release;
  outbox.compose(context, { text: 'Olá' });
  const first = outbox.send(context, () => new Promise(resolve => { release = resolve; }));
  outbox.compose(context, { text: 'Olá' });
  const second = outbox.send(context, async () => ({ outcome: 'accepted', local_message_id: 'server-2' }));
  await tick();
  const server = { ...outbox.visible(context, [])[0], id: 'server-1', raw_metadata: { client_request_id: first.id, delivery_status: 'sent' } };
  assert.equal(outbox.visible(context, [server]).length, 2);
  release({ outcome: 'accepted', local_message_id: 'server-1' });
  await Promise.all([first.done, second.done]);
  assert.equal(outbox.visible(context, [server]).length, 2);
  assert.equal(outbox.visible(context, [])[0].id, 'server-1', 'A stale read cannot erase observed server evidence');
  assert.equal(outbox.visible({ ...context, organizationId: 'org-b' }, []).length, 0);
  assert.equal(outbox.composer({ ...context, protocolId: 'p-b' }).text, '');
});

test('local server id reconciles when older rows lack client id; identical body alone never reconciles', async () => {
  const outbox = makeOutbox();
  outbox.compose(context, { text: 'Olá' });
  const send = outbox.send(context, async () => ({ outcome: 'accepted', local_message_id: 'server' }));
  await send.done;
  const row = { ...outbox.visible(context, [])[0], id: 'different', raw_metadata: { delivery_status: 'sent' } };
  assert.equal(outbox.visible(context, [row]).length, 2);
  assert.equal(outbox.visible(context, [{ ...row, id: 'server' }]).length, 1);
});

test('a stale hydrated snapshot cannot regress read evidence', async () => {
  const outbox = makeOutbox();
  outbox.compose(context, { text: 'Olá' });
  const send = outbox.send(context, async () => ({ outcome: 'accepted', local_message_id: 'server' }));
  await send.done;
  const base = outbox.visible(context, [])[0];
  const read = { ...base, id: 'server', raw_metadata: { client_request_id: send.id, delivery_status: 'read' } };
  assert.equal(outbox.visible(context, [read])[0].raw_metadata.delivery_status, 'read');
  const accepted = { ...read, raw_metadata: { client_request_id: send.id, delivery_status: 'accepted' } };
  assert.equal(outbox.visible(context, [accepted])[0].raw_metadata.delivery_status, 'read');

});

test('conversations share an operator queue while another organization has an independent lane and draft', async () => {
  const outbox = makeOutbox(); let release; const calls = [];
  outbox.compose(context, { text: 'org-a/p-a' });
  const first = outbox.send(context, () => { calls.push('a'); return new Promise(resolve => { release = resolve; }); });
  const otherProtocol = { ...context, protocolId: 'p-b' };
  outbox.compose(otherProtocol, { text: 'org-a/p-b' });
  const second = outbox.send(otherProtocol, async () => { calls.push('b'); return { outcome: 'accepted' }; });
  const otherOrganization = { ...context, organizationId: 'org-b' };
  outbox.compose(otherOrganization, { text: 'org-b' });
  const third = outbox.send(otherOrganization, async () => { calls.push('c'); return { outcome: 'accepted' }; });
  await third.done;
  assert.deepEqual(calls, ['a', 'c']);
  assert.equal(outbox.visible(otherProtocol, []).length, 1);
  assert.equal(outbox.visible({ ...context, userId: 'someone-else' }, []).length, 0);
  release({ outcome: 'accepted' }); await Promise.all([first.done, second.done]);
  assert.deepEqual(calls, ['a', 'c', 'b']);
});

test('duplicate server ids with the same client id display one bubble', async () => {
  const outbox = makeOutbox();
  outbox.compose(context, { text: 'Olá' });
  const send = outbox.send(context, async () => ({ outcome: 'accepted', local_message_id: 'server' }));
  await send.done;
  const base = outbox.visible(context, [])[0];
  const row = { ...base, id: 'server', raw_metadata: { client_request_id: send.id, delivery_status: 'read' } };
  assert.equal(outbox.visible(context, [row, { ...row, id: 'duplicate-server' }]).length, 1);
});

test('server acceptance time cannot move an earlier queued submission behind the next local message', async () => {
  let id = 0; let instant = 0;
  const outbox = new SacMessageOutbox({ createId: () => String(++id), now: () => `2026-10-09T10:00:0${instant++}Z` });
  outbox.compose(context, { text: 'primeira' });
  const first = outbox.send(context, async () => ({ outcome: 'accepted', local_message_id: 'server-1' }));
  outbox.compose(context, { text: 'segunda' });
  const second = outbox.send(context, async () => ({ outcome: 'accepted' }));
  await Promise.all([first.done, second.done]);
  const original = outbox.visible(context, [])[0];
  const server = { ...original, id: 'server-1', sent_at: '2026-10-09T10:01:00Z', raw_metadata: { client_request_id: first.id, delivery_status: 'accepted' } };
  assert.deepEqual(outbox.visible(context, [server]).map(row => row.body_text), ['primeira', 'segunda']);
});

test('an uncertain response retains server correlation ids for later realtime reconciliation', async () => {
  const outbox = makeOutbox();
  outbox.compose(context, { text: 'Olá' });
  const send = outbox.send(context, async () => { throw Object.assign(Error('timeout'), { outcome: 'unknown', local_message_id: 'server' }); });
  await send.done;
  const row = { ...outbox.visible(context, [])[0], id: 'server', raw_metadata: { delivery_status: 'sent' } };
  assert.equal(outbox.visible(context, [row]).length, 1);
});

test('a durable preparing row keeps the individual in-flight spinner until RPC settles', async () => {
  const outbox = makeOutbox(); let release;
  outbox.compose(context, { text: 'Olá' });
  const send = outbox.send(context, () => new Promise(resolve => { release = resolve; }));
  await tick();
  const preliminary = { ...outbox.visible(context, [])[0], id: 'server', raw_metadata: { client_request_id: send.id, delivery_status: 'preparing' } };
  const pendingState = outbox.visible(context, [preliminary])[0].raw_metadata.local_submission;
  release({ outcome: 'accepted', local_message_id: 'server', delivery_status: 'accepted' }); await send.done;
  assert.equal(pendingState, 'sending');
  assert.equal(outbox.visible(context, [preliminary])[0].raw_metadata.delivery_status, 'accepted');
});

test('a durably rejected record permits restoring its failed draft but accepted or delivered evidence does not', async () => {
  const outbox = makeOutbox(); const file = { name: 'foto.jpg', type: 'image/jpeg', size: 5 };
  outbox.compose(context, { text: 'Olá', file });
  const send = outbox.send(context, async () => { throw Object.assign(Error('rejected'), { outcome: 'rejected', local_message_id: 'server' }); });
  await send.done;
  const base = outbox.visible(context, [])[0];
  const rejected = { ...base, id: 'server', raw_metadata: { client_request_id: send.id, delivery_status: 'rejected' } };
  assert.equal(outbox.visible(context, [rejected])[0].raw_metadata.local_submission, 'failed');
  assert.equal(outbox.restore(context, send.id), true);
  assert.deepEqual(outbox.composer(context), { text: 'Olá', file });
  for (const state of ['accepted', 'sent', 'delivered', 'read']) {
    const guarded = makeOutbox(); guarded.compose(context, { text: 'Olá' });
    const attempted = guarded.send(context, async () => { throw Object.assign(Error('rejected'), { outcome: 'rejected', local_message_id: 'server' }); });
    await attempted.done;
    const server = { ...guarded.visible(context, [])[0], id: 'server', raw_metadata: { client_request_id: attempted.id, delivery_status: state } };
    guarded.visible(context, [server]);
    assert.equal(guarded.restore(context, attempted.id), false, state);
  }
});
