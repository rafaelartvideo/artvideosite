import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
async function load() {
  const path = 'src/features/telephony/application/remote-audio.ts';
  assert.ok(existsSync(path), 'vinculação segura de áudio deve existir');
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
function fixture() {
  const listeners = new Set(); const events = new Map();
  const peer = { addEventListener: (_, cb) => listeners.add(cb), removeEventListener: (_, cb) => listeners.delete(cb), getReceivers: () => [] };
  const session = { connection: peer, on: (name, cb) => events.set(name, cb) };
  const emit = (stream = {}) => { for (const cb of listeners) cb({ track: { kind: 'audio' }, streams: [stream] }); };
  return { peer, session, listeners, events, emit };
}
test('eventos de uma chamada anterior não substituem o áudio atual', async () => {
  const { bindRemoteAudio } = await load(); const f = fixture(); let current = true; let plays = 0;
  const audio = { srcObject: null, play: () => { plays++; return Promise.resolve(); } };
  bindRemoteAudio(f.session, { isCurrent: () => current, getAudio: () => audio, onBlocked: () => {} });
  current = false;
  f.emit({ old: true }); assert.equal(plays, 0); assert.equal(audio.srcObject, null);
  current = true; const stream = {}; f.emit(stream); assert.equal(plays, 1); assert.equal(audio.srcObject, stream);
});
test('confirmação tardia de reprodução não muda o estado de uma chamada nova', async () => {
  const { bindRemoteAudio } = await load(); const f = fixture(); let current = true; let resolvePlay; const blocked = [];
  const audio = { srcObject: null, play: () => new Promise(resolve => { resolvePlay = resolve; }) };
  bindRemoteAudio(f.session, { isCurrent: () => current, getAudio: () => audio, onBlocked: value => blocked.push(value) });
  f.emit(); current = false; resolvePlay(); await Promise.resolve(); assert.deepEqual(blocked, []);
});
test('cada conexão recebe um ouvinte e encerramento remove os ouvintes', async () => {
  const { bindRemoteAudio } = await load(); const f = fixture();
  bindRemoteAudio(f.session, { isCurrent: () => true, getAudio: () => null, onBlocked: () => {} });
  f.events.get('peerconnection')({ peerconnection: f.peer }); assert.equal(f.listeners.size, 1);
  f.events.get('ended')(); assert.equal(f.listeners.size, 0);
  f.events.get('peerconnection')({ peerconnection: f.peer }); assert.equal(f.listeners.size, 0);
});
