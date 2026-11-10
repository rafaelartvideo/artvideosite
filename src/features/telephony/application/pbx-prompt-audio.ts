const SAMPLE_RATE = 8000;
const MAX_SECONDS = 60;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;

function checkDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) {
    throw new Error('O áudio deve ter duração válida de até 60 segundos.');
  }
}

/** Encodes already mixed/resampled mono samples as signed PCM16 WAV. */
export function encodePbxWav(samples: Float32Array): ArrayBuffer {
  checkDuration(samples.length / SAMPLE_RATE);
  const size = 44 + samples.length * 2;
  if (size > MAX_OUTPUT_BYTES) throw new Error('O áudio convertido deve ter até 1 MB.');
  const bytes = new ArrayBuffer(size);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, 'RIFF'); view.setUint32(4, size - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    if (!Number.isFinite(samples[index])) throw new Error('O áudio contém dados inválidos.');
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

/** Local conversion only: never plays the input or requests microphone access. */
export async function preparePbxPrompt(input: File | Blob, signal?: AbortSignal): Promise<{
  blob: Blob;
  sha256: string;
  durationSeconds: number;
}> {
  if (signal?.aborted) throw new DOMException('Conversão cancelada.', 'AbortError');
  if (!(input instanceof Blob) || input.size <= 0 || input.size > MAX_INPUT_BYTES) {
    throw new Error('Selecione um arquivo de áudio de até 20 MB.');
  }
  let stopped: Error | undefined;
  let rejectStop!: (error: Error) => void;
  const interruption = new Promise<never>((_, reject) => { rejectStop = reject; });
  const stop = (error: Error) => { if (!stopped) { stopped = error; rejectStop(error); } };
  const abort = () => stop(new DOMException('Conversão cancelada.', 'AbortError'));
  const timer = setTimeout(() => stop(new Error('O tempo para converter o áudio terminou. Tente um arquivo menor.')), 15000);
  signal?.addEventListener('abort', abort, { once: true });
  // Every asynchronous browser operation races the same deadline/cancellation.
  const wait = async <T>(operation: Promise<T>): Promise<T> => {
    const result = await Promise.race([operation, interruption]);
    if (stopped) throw stopped;
    return result;
  };
  let url: string | undefined;
  let media: HTMLAudioElement | undefined;
  let context: AudioContext | undefined;
  let source: AudioBufferSourceNode | undefined;
  let loaded: (() => void) | undefined;
  let failed: (() => void) | undefined;
  try {
    media = document.createElement('audio');
    media.preload = 'metadata';
    url = URL.createObjectURL(input);
    const metadata = new Promise<number>((resolve, reject) => {
      loaded = () => resolve(media!.duration);
      failed = () => reject(new Error('Não foi possível ler este arquivo de áudio.'));
      media!.addEventListener('loadedmetadata', loaded);
      media!.addEventListener('error', failed);
      media!.src = url!;
    });
    const duration = await wait(metadata);
    // Check compressed media metadata before allocating a decoded audio buffer.
    checkDuration(duration);
    if (typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined') {
      throw new Error('Este navegador não permite converter o áudio.');
    }
    const inputBytes = await wait(input.arrayBuffer());
    context = new AudioContext();
    let decoded: AudioBuffer;
    try {
      decoded = await wait(context.decodeAudioData(inputBytes));
    } catch (error) {
      if (stopped) throw stopped;
      throw new Error('Não foi possível decodificar este áudio. Use outro arquivo.');
    }
    checkDuration(decoded.duration);
    const length = Math.ceil(decoded.duration * SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await wait(offline.startRendering());
    const bytes = encodePbxWav(rendered.getChannelData(0));
    const hash = await wait(crypto.subtle.digest('SHA-256', bytes));
    return {
      blob: new Blob([bytes], { type: 'audio/wav' }),
      sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''),
      durationSeconds: (bytes.byteLength - 44) / (SAMPLE_RATE * 2),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (media) {
      if (loaded) media.removeEventListener('loadedmetadata', loaded);
      if (failed) media.removeEventListener('error', failed);
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
    if (url) URL.revokeObjectURL(url);
    if (source) {
      try { source.stop(); } catch { /* Rendering may already have ended. */ }
      source.disconnect();
    }
    // Do not let a browser's pending close promise defeat the conversion deadline.
    if (context) void context.close().catch(() => undefined);
  }
}
