import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

// Execute the real subscription effects with deterministic realtime/timer boundaries.
async function directoryHarness({ open = true, registered = true } = {}) {
  const channels = [], pending = new Map(), cleanups = [];
  let revision = 0, nextTimer = 0;
  const setTimeout = callback => { pending.set(++nextTimer, callback); return nextTimer; };
  const clearTimeout = id => pending.delete(id);
  const supabase = {
    channel(name) {
      const channel = { name, handlers: [], removed: false,
        on(_kind, filter, callback) { this.handlers.push({ filter, callback }); return this; },
        subscribe() { return this; },
      };
      channels.push(channel); return channel;
    },
    removeChannel(channel) { channel.removed = true; },
  };
  const bindings = {
    useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    supabase, activeOrganizationId: 'company-a', isPageOpen: open,
    registration: registered ? 'registered' : 'offline', isActive: open,
    setDirectoryRevision: update => { revision = update(revision); },
    setRevision: () => {}, directoryCallback: { current: () => { revision++; } },
    queryClient: { getQueryState: () => ({ dataUpdatedAt: Date.now() }) },
    historyQueryKey: [], user: { id: 'operator-a' }, historyToday: '2026-11-18',
    window: { addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout, clearTimeout,
  };
  for (const [file, start, end] of [
    ['UnionPbxToolPage.tsx', '  // A lista de ramais', '  const [callState'],
    ['UnionPbxOperatorWorkspace.tsx', '  // Uma assinatura filtrada', '  // Seleciona apenas'],
  ]) {
    const source = readFileSync(`src/features/telephony/presentation/${file}`, 'utf8');
    assert.ok(source.includes(start) && source.includes(end));
    const snippet = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const { code } = await transformWithEsbuild(snippet, file, { loader: 'tsx' });
    new Function(...Object.keys(bindings), code)(...Object.values(bindings));
  }
  return {
    channels,
    emit(table, organizationId = 'company-a') {
      for (const channel of channels) for (const { filter, callback } of channel.handlers) {
        if (!channel.removed && filter.table === table && filter.filter === `organization_id=eq.${organizationId}`) callback();
      }
    },
    flush() { const tasks = [...pending.values()]; pending.clear(); tasks.forEach(callback => callback()); },
    cleanup() { cleanups.forEach(cleanup => cleanup()); },
    get revision() { return revision; },
    get timers() { return pending.size; },
  };
}

test('one tenant directory event has one owner and one coalesced refresh', async () => {
  const harness = await directoryHarness();
  harness.emit('pbx_extensions');
  harness.flush();
  assert.equal(harness.revision, 1);
  assert.equal(harness.channels.flatMap(channel => channel.handlers)
    .filter(({ filter }) => filter.table === 'pbx_extensions').length, 1);
});

test('a burst of extension, queue and flow events refreshes the directory once', async () => {
  const harness = await directoryHarness();
  for (let i = 0; i < 10; i++) {
    harness.emit('pbx_extensions'); harness.emit('pbx_queues'); harness.emit('pbx_call_flows');
  }
  assert.equal(harness.revision, 0, 'wait for the batch before starting requests');
  harness.flush();
  assert.equal(harness.revision, 1);
  harness.emit('pbx_queues'); harness.flush();
  assert.equal(harness.revision, 2, 'subsequent updates remain observable');
});

test('directory subscription retains registered background reception and cancels pending work', async () => {
  const harness = await directoryHarness({ open: false });
  harness.emit('pbx_extensions', 'other-company'); harness.flush();
  assert.equal(harness.revision, 0);
  harness.emit('pbx_extensions'); harness.flush();
  assert.equal(harness.revision, 1);
  harness.emit('pbx_call_flows');
  harness.cleanup(); harness.flush();
  assert.equal(harness.timers, 0);
  assert.equal(harness.revision, 1);
  assert.ok(harness.channels.every(channel => channel.removed));
  const offline = await directoryHarness({ open: false, registered: false });
  assert.equal(offline.channels.length, 0);
});
