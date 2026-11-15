import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

async function load(file) {
  const path = 'src/features/telephony/application/' + file;
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64') + '#' + Math.random());
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(overrides = {}) {
  const callbacks = {};
  const track = { kind: 'audio', enabled: true, readyState: 'live' };
  const actions = [];
  const peer = {
    signalingState: 'stable', iceConnectionState: 'connected',
    getSenders: () => [{ track }],
  };
  const session = {
    isEstablished: () => true,
    isReadyToReOffer: () => true,
    isOnHold: () => ({ local: false, remote: false }),
    isMuted: () => ({ audio: false }),
    renegotiate: (options, done) => { actions.push(options); done(); return true; },
    connection: peer,
    on: (event, callback) => { callbacks[event] = callback; },
    ...overrides,
  };
  return { session, callbacks, actions, peer, track };
}

test('only one bounded reINVITE after confirmed, without hold or changing microphone', async () => {
  const { bindExternalAudioStabilization } = await load('outgoing-audio-stabilizer.ts');
  const f = fixture();
  bindExternalAudioStabilization(f.session, { isCurrent: () => true, delayMs: 1 });
  f.callbacks.confirmed();
  await pause(15);
  assert.deepEqual(f.actions, [{ useUpdate: false }]);
  f.callbacks.confirmed();
  await pause(15);
  assert.equal(f.actions.length, 1);
  assert.equal(f.track.enabled, true);
});

test('ended and rejected calls never refresh media after termination', async () => {
  const { bindExternalAudioStabilization } = await load('outgoing-audio-stabilizer.ts');
  for (const event of ['failed', 'ended']) {
    const f = fixture();
    bindExternalAudioStabilization(f.session, { isCurrent: () => true, delayMs: 1 });
    f.callbacks.confirmed();
    f.callbacks[event]();
    await pause(12);
    assert.deepEqual(f.actions, []);
  }
});

test('no renegotiation during hold, mute, wrong call or pending SDP', async () => {
  const { bindExternalAudioStabilization } = await load('outgoing-audio-stabilizer.ts');
  for (const change of [
    { isOnHold: () => ({ local: true, remote: false }) },
    { isMuted: () => ({ audio: true }) },
    { isReadyToReOffer: () => false },
    { isEstablished: () => false },
    { connection: null },
  ]) {
    const f = fixture(change);
    bindExternalAudioStabilization(f.session, { isCurrent: () => true, delayMs: 1 });
    f.callbacks.confirmed();
    await pause(10);
    f.callbacks.ended();
    assert.deepEqual(f.actions, []);
  }
  const other = fixture();
  bindExternalAudioStabilization(other.session, { isCurrent: () => false, delayMs: 1 });
  other.callbacks.confirmed(); await pause(5);
  assert.deepEqual(other.actions, []);
});

test('SIP failure reasons distinguish rejection, busy, cancellation and unavailable', async () => {
  const { outgoingCallFailureMessage } = await load('call-end-reason.ts');
  assert.match(outgoingCallFailureMessage({ message: { status_code: 603 } }), /recusou/);
  assert.match(outgoingCallFailureMessage({ message: { status_code: 486 } }), /ocupado/);
  assert.match(outgoingCallFailureMessage({ cause: 'Canceled' }), /cancelada/);
  assert.match(outgoingCallFailureMessage({ message: { status_code: 480 } }), /indisponível/);
  assert.match(outgoingCallFailureMessage(undefined), /não foi possível/i);
});

test('outgoing stabilization is restricted to external calls in the dialer', () => {
  const file = readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx', 'utf8');
  assert.match(file, /bindExternalAudioStabilization\(session/);
  assert.match(file, /session\.direction === 'outgoing' && originatedExternalRef\.current/);
  assert.match(file, /originatedExternalRef\.current = true/);
  assert.match(file, /outgoingCallFailureMessage/);
});
