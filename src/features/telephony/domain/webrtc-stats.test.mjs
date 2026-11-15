import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

const path = 'src/features/telephony/domain/webrtc-stats.ts';
async function load() {
  assert.ok(existsSync(path), 'extrator de métricas deve existir');
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('métricas ausentes não viram qualidade perfeita', async () => {
  const { summarizeAudioStats } = await load();
  assert.deepEqual(summarizeAudioStats(new Map()), {
    jitterMs: null, roundTripMs: null, packetsLost: null, packetsReceived: null,
    playbackBufferMs: null, codec: null,
  });
});

test('extrai áudio, preserva zero e usa somente o par ICE selecionado', async () => {
  const { summarizeAudioStats } = await load();
  const report = new Map([
    ['video', { type: 'inbound-rtp', kind: 'video', jitter: 9 }],
    ['in', { type: 'inbound-rtp', kind: 'audio', jitter: 0.012, packetsLost: 0,
      packetsReceived: 100, jitterBufferDelay: 2, jitterBufferEmittedCount: 100, codecId: 'codec' }],
    ['codec', { type: 'codec', mimeType: 'audio/PCMA' }],
    ['wrong', { type: 'candidate-pair', currentRoundTripTime: 99 }],
    ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
    ['pair', { type: 'candidate-pair', currentRoundTripTime: 0.08 }],
  ]);
  assert.deepEqual(summarizeAudioStats(report), {
    jitterMs: 12, roundTripMs: 80, packetsLost: 0, packetsReceived: 100,
    playbackBufferMs: 20, codec: 'PCMA',
  });
});

test('buffer sem amostras e valores não finitos ficam indisponíveis', async () => {
  const { summarizeAudioStats } = await load();
  const result = summarizeAudioStats(new Map([['in', { type: 'inbound-rtp', mediaType: 'audio',
    jitter: NaN, packetsReceived: Infinity, packetsLost: -1, jitterBufferDelay: 4, jitterBufferEmittedCount: 0 }]]));
  assert.equal(result.playbackBufferMs, null);
  assert.equal(result.jitterMs, null);
  assert.equal(result.packetsReceived, null);
  assert.equal(result.packetsLost, -1, 'RTCP pode corrigir perda por pacotes atrasados');
});

test('diagnóstico usa a conexão da chamada ativa e não cria outro telefone', async () => {
  const page = readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx', 'utf8');
  const panel = readFileSync('src/features/telephony/presentation/UnionPbxAudioDiagnostics.tsx', 'utf8');
  assert.match(page, /callState === "active" && <UnionPbxAudioDiagnostics connection=\{sessionRef.current\?\.connection\}/);
  assert.match(panel, /connection\.getStats\(\)/);
  assert.match(panel, /cancelled = true; clearTimeout\(timer\)/);
  assert.doesNotMatch(panel, /new RTCPeerConnection|new .*UA\(|getUserMedia|fetch\(|localStorage/);
  for (const [name, source] of [['UnionPbxToolPage.tsx', page], ['UnionPbxAudioDiagnostics.tsx', panel]]) {
    assert.ok((await transformWithEsbuild(source, name, { loader: 'tsx' })).code);
  }
});
