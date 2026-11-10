import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { transformWithEsbuild } from 'vite';

async function load() {
  const path = 'src/features/telephony/application/pbx-prompt-audio.ts';
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function browser(t, options = {}) {
  const state = { decoded: 0, closed: 0, revoked: [], disconnected: 0, played: 0, listeners: 0 };
  const duration = options.duration ?? 1;
  class Media extends EventTarget {
    duration = duration;
    addEventListener(...args) { state.listeners++; super.addEventListener(...args); }
    removeEventListener(...args) { state.listeners--; super.removeEventListener(...args); }
    set src(value) { this.url = value; if (value && !options.hangMetadata) queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))); }
    removeAttribute() { this.url = ''; }
    load() {}
    pause() {}
    play() { state.played++; }
  }
  class AudioContext {
    async decodeAudioData() {
      state.decoded++;
      if (options.hangDecode) return new Promise(() => {});
      if (options.decodeError) throw new Error('codec');
      return { duration: options.decodedDuration ?? duration, length: 48000, sampleRate: 48000, numberOfChannels: 2 };
    }
    async close() { state.closed++; }
  }
  class OfflineAudioContext {
    constructor(channels, length, sampleRate) { assert.equal(channels, 1); assert.equal(sampleRate, 8000); this.length = length; this.destination = {}; }
    createBufferSource() { return { connect() {}, disconnect() { state.disconnected++; }, start() {}, stop() {} }; }
    async startRendering() {
      if (options.hangRender) return new Promise(() => {});
      if (options.renderError) throw new Error('Falha no áudio renderizado.');
      return { getChannelData: () => options.samples ?? new Float32Array(this.length) };
    }
  }
  t.mock.method(URL, 'createObjectURL', () => 'blob:prompt-test');
  t.mock.method(URL, 'revokeObjectURL', (url) => state.revoked.push(url));
  for (const [name, value] of Object.entries({ document: { createElement: () => new Media() }, AudioContext, OfflineAudioContext })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  return state;
}

test('encoder produz RIFF PCM mono 8kHz com clipping e bytes little endian', async () => {
  const { encodePbxWav } = await load();
  const bytes = encodePbxWav(new Float32Array([-2, -1, 0, 0.5, 1, 2]));
  const view = new DataView(bytes);
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), 'RIFF');
  assert.equal(Buffer.from(bytes).subarray(8, 16).toString(), 'WAVEfmt ');
  assert.equal(view.getUint32(4, true), 48);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 8000);
  assert.equal(view.getUint32(28, true), 16000);
  assert.equal(view.getUint16(32, true), 2);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, -32768, 0, 16384, 32767, 32767]);
  for (const samples of [new Float32Array(), new Float32Array([NaN]), new Float32Array([Infinity]), new Float32Array(480001)]) {
    assert.throws(() => encodePbxWav(samples), /áudio|duração|60/i);
  }
  assert.equal(encodePbxWav(new Float32Array(480000)).byteLength, 960044, '60s permanece abaixo de 1MB');
});

test('converte localmente, informa duração e SHA256 dos bytes finais e libera recursos', async (t) => {
  const state = browser(t);
  const { preparePbxPrompt } = await load();
  const result = await preparePbxPrompt(new Blob(['compressed'], { type: 'audio/mpeg' }));
  assert.equal(result.blob.type, 'audio/wav');
  assert.equal(result.blob.size, 16044);
  assert.equal(result.durationSeconds, 1);
  assert.equal(result.sha256, createHash('sha256').update(Buffer.from(await result.blob.arrayBuffer())).digest('hex'));
  assert.equal(state.decoded, 1);
  assert.equal(state.closed, 1);
  assert.equal(state.disconnected, 1);
  assert.equal(state.played, 0);
  assert.equal(state.listeners, 0);
  assert.deepEqual(state.revoked, ['blob:prompt-test']);
});

test('rejeita duração de metadados inválida antes de decodificar', async (t) => {
  const { preparePbxPrompt } = await load();
  for (const duration of [0, -1, NaN, Infinity, 60.01]) {
    const state = browser(t, { duration });
    await assert.rejects(preparePbxPrompt(new Blob(['x'])), /duração|60/i);
    assert.equal(state.decoded, 0);
    assert.equal(state.listeners, 0);
    assert.deepEqual(state.revoked, ['blob:prompt-test']);
  }
});

test('rejeita arquivo vazio ou acima de 20MB sem ler metadados', async (t) => {
  const state = browser(t); const { preparePbxPrompt } = await load();
  for (const blob of [new Blob(), new Blob([new Uint8Array(20 * 1024 * 1024 + 1)])]) {
    await assert.rejects(preparePbxPrompt(blob), /arquivo|20/i);
  }
  assert.deepEqual(state.revoked, []);
});

test('não confia em duração decodificada inválida e fecha contexto mesmo em erro do codec', async (t) => {
  const { preparePbxPrompt } = await load();
  for (const options of [{ decodedDuration: NaN }, { decodedDuration: 0 }, { decodedDuration: Infinity }, { decodedDuration: 61 }, { decodeError: true }, { renderError: true }, { samples: new Float32Array([NaN]) }]) {
    const state = browser(t, options);
    await assert.rejects(preparePbxPrompt(new Blob(['x'])), /áudio|duração|60/i);
    assert.equal(state.closed, 1); assert.equal(state.listeners, 0);
    assert.deepEqual(state.revoked, ['blob:prompt-test']);
  }
});

test('cancelamento durante metadados ou decode libera URL, listeners e contexto', async (t) => {
  const { preparePbxPrompt } = await load();
  for (const options of [{ hangMetadata: true }, { hangDecode: true }, { hangRender: true }]) {
    const state = browser(t, options); const abort = new AbortController();
    let abortListeners = 0;
    const add = abort.signal.addEventListener.bind(abort.signal);
    const remove = abort.signal.removeEventListener.bind(abort.signal);
    t.mock.method(abort.signal, 'addEventListener', (...args) => { abortListeners++; return add(...args); });
    t.mock.method(abort.signal, 'removeEventListener', (...args) => { abortListeners--; return remove(...args); });
    const pending = preparePbxPrompt(new Blob(['x']), abort.signal);
    await new Promise(resolve => setImmediate(resolve)); abort.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(state.closed, options.hangMetadata ? 0 : 1);
    assert.equal(abortListeners, 0);
    assert.equal(state.disconnected, options.hangRender ? 1 : 0);
    assert.equal(state.listeners, 0); assert.deepEqual(state.revoked, ['blob:prompt-test']);
  }
});

test('prazo durante decode fecha o contexto mesmo sem conclusão do navegador', async (t) => {
  const state = browser(t, { hangDecode: true }); const { preparePbxPrompt } = await load();
  const originalTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, milliseconds) => { assert.equal(milliseconds, 15000); return originalTimeout(callback, 20); });
  await assert.rejects(preparePbxPrompt(new Blob(['x'])), /tempo|prazo/i);
  assert.equal(state.decoded, 1); assert.equal(state.closed, 1);
  assert.equal(state.listeners, 0); assert.deepEqual(state.revoked, ['blob:prompt-test']);
});

test('cancelamento prévio não cria URL e prazo de 15s encerra metadados pendentes', async (t) => {
  const state = browser(t, { hangMetadata: true }); const { preparePbxPrompt } = await load();
  const abort = new AbortController(); abort.abort();
  await assert.rejects(preparePbxPrompt(new Blob(['x']), abort.signal), { name: 'AbortError' });
  assert.deepEqual(state.revoked, []);
  const originalTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, milliseconds) => { assert.equal(milliseconds, 15000); return originalTimeout(callback, 5); });
  await assert.rejects(preparePbxPrompt(new Blob(['x'])), /tempo|prazo/i);
  assert.equal(state.listeners, 0); assert.deepEqual(state.revoked, ['blob:prompt-test']);
});
