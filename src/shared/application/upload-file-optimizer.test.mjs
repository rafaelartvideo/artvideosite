import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prepareImageForUpload, prepareFileForUpload } from './upload-file-optimizer.ts';

// Canvas is a browser API. The adapter models its observable encoding contract,
// including browsers returning PNG when the requested encoder is unavailable.
const originals = { bitmap: globalThis.createImageBitmap, document: globalThis.document, Image: globalThis.Image };
afterEach(() => {
  globalThis.createImageBitmap = originals.bitmap;
  globalThis.document = originals.document;
  globalThis.Image = originals.Image;
});
function browser({ actualType = 'image/webp', bytes = 1000, failDraw = false, transparent = false } = {}) {
  const state = { closed: 0, decoded: 0, canvas: null, drawnSize: null };
  globalThis.createImageBitmap = async () => { state.decoded++; return { width: 4000, height: 3000, close() { state.closed++; } }; };
  globalThis.document = { createElement() {
    state.canvas = { width: 0, height: 0, getContext() { return {
      drawImage(_image, _x, _y, width, height) { if (failDraw) throw Error('draw failed'); state.drawnSize = [width, height]; },
      getImageData() { return { data: new Uint8ClampedArray([0, 0, 0, transparent ? 100 : 255]) }; },
    }; }, toBlob(callback, type) { callback(new Blob([new Uint8Array(bytes)], { type: actualType === 'requested' ? type : actualType })); } };
    return state.canvas;
  } };
  return state;
}
const photo = () => new File([new Uint8Array(500_000)], 'camera.jpg', { type: 'image/jpeg' });

test('unsupported WebP encoder keeps actual PNG MIME and extension', async () => {
  browser({ actualType: 'image/png' });
  const result = await prepareImageForUpload(photo());
  assert.equal(result.type, 'image/png');
  assert.equal(result.name, 'camera.png');
});
test('releases decoded image and canvas backing buffer after encoding', async () => {
  const state = browser();
  await prepareImageForUpload(photo());
  assert.equal(state.closed, 1);
  assert.equal(state.canvas.width, 0);
  assert.equal(state.canvas.height, 0);
});
test('same source and prepared result are not recompressed for the same preset', async () => {
  const state = browser();
  const source = photo();
  const [first, second] = await Promise.all([prepareImageForUpload(source), prepareImageForUpload(source)]);
  assert.equal(first, second);
  assert.equal(await prepareImageForUpload(first), first);
  assert.equal(state.decoded, 1);
});
test('falls back to HTML image decoder and revokes its temporary URL', async () => {
  const state = browser();
  globalThis.createImageBitmap = undefined;
  globalThis.Image = class {
    width = 4000; height = 3000; naturalWidth = 4000; naturalHeight = 3000;
    set src(value) { this.url = value; if (value) queueMicrotask(() => this.onload()); }
  };
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  URL.revokeObjectURL = url => { revoked.push(url); originalRevoke(url); };
  try {
    const source = photo();
    const result = await prepareImageForUpload(source);
    assert.notEqual(result, source);
    assert.equal(revoked.length, 1);
    assert.match(revoked[0], /^blob:/);
    assert.equal(state.canvas.width, 0);
  } finally { URL.revokeObjectURL = originalRevoke; }
});
test('upload caps validate final encoded bytes and decoder fallback bytes', async () => {
  browser({ bytes: 600_000 });
  await assert.rejects(prepareImageForUpload(photo(), 'service-photo', 200_000), /limite/i);
  globalThis.createImageBitmap = async () => { throw Error('unreadable'); };
  globalThis.Image = undefined;
  const originalWarn = console.warn;
  console.warn = () => {};
  try { await assert.rejects(prepareImageForUpload(photo(), 'service-photo', 200_000), /limite/i); }
  finally { console.warn = originalWarn; }
});
test('generic documents including scanned PNG are preserved byte for byte', async () => {
  browser();
  for (const type of ['image/png', 'application/pdf', 'image/svg+xml', 'image/gif']) {
    const source = new File([new Uint8Array(500_000)], 'document', { type });
    assert.equal(await prepareFileForUpload(source, 'document-image'), source);
  }
});
test('animated PNG and WebP skip canvas to preserve all frames', async () => {
  const state = browser();
  const png = new Uint8Array(500_000);
  png.set([137,80,78,71,13,10,26,10]);
  new DataView(png.buffer).setUint32(8, 8);
  png.set(new TextEncoder().encode('acTL'), 12);
  const webp = new Uint8Array(500_000);
  webp.set(new TextEncoder().encode('RIFF'), 0);
  webp.set(new TextEncoder().encode('WEBPANIM'), 8);
  for (const [bytes, type] of [[png, 'image/png'], [webp, 'image/webp']]) {
    const source = new File([bytes], 'animated', { type });
    assert.equal(await prepareImageForUpload(source), source);
  }
  assert.equal(state.decoded, 0);
});
test('decode failure preserves original and oversized source is rejected', async () => {
  globalThis.createImageBitmap = async () => { throw Error('unreadable'); };
  globalThis.Image = undefined;
  const source = photo();
  assert.equal(await prepareImageForUpload(source), source);
  await assert.rejects(prepareImageForUpload(new File([new Uint8Array(26 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })), /25 MB/);
});

test('labels retain more readable pixels than normal service photos', async () => {
  const state = browser();
  await prepareImageForUpload(photo(), 'service-photo');
  assert.deepEqual(state.drawnSize, [1600, 1200]);
  await prepareImageForUpload(photo(), 'service-label');
  assert.deepEqual(state.drawnSize, [2200, 1650]);
});
test('SAC transparent image remains PNG with its alpha channel', async () => {
  browser({ actualType: 'requested', transparent: true });
  const source = new File([new Uint8Array(500_000)], 'logo.png', { type: 'image/png' });
  const result = await prepareImageForUpload(source, 'sac-image');
  assert.equal(result.type, 'image/png');
  assert.equal(result.name, 'logo.png');
});
test('encoding failure releases image resources and preserves original bytes', async () => {
  const state = browser({ failDraw: true });
  const source = photo();
  const originalWarn = console.warn;
  console.warn = () => {};
  try { assert.equal(await prepareImageForUpload(source), source); }
  finally { console.warn = originalWarn; }
  assert.equal(state.closed, 1);
  assert.equal(state.canvas.width, 0);
  assert.equal(state.canvas.height, 0);
});
test('encoder can reach the allowed minimum quality when needed to meet upload target', async () => {
  browser();
  const createCanvas = globalThis.document.createElement;
  globalThis.document.createElement = () => {
    const canvas = createCanvas();
    canvas.toBlob = (callback, type, quality) => callback(new Blob([new Uint8Array(quality <= 0.68 ? 800_000 : Math.round(1_000_000 + quality * 100_000))], { type }));
    return canvas;
  };
  for (const preset of ['service-photo', 'sac-image']) {
    const result = await prepareImageForUpload(photo(), preset);
    assert.equal(result.size, 800_000);
  }
});
