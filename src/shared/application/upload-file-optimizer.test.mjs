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
function browser({ actualType = 'image/webp', bytes = 1000, failDraw = false, transparent = false, width = 4000, height = 3000 } = {}) {
  const state = { closed: 0, decoded: 0, canvas: null, drawnSize: null };
  globalThis.createImageBitmap = async () => { state.decoded++; return { width, height, close() { state.closed++; } }; };
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
  try { await assert.rejects(prepareImageForUpload(photo(), 'service-photo', 200_000), /limite|otimizar|Decodificador/i); }
  finally { console.warn = originalWarn; }
});
test('PDFs, vector and animated formats preserve original binary bytes', async () => {
  browser();
  for (const type of ['application/pdf', 'image/svg+xml', 'image/gif']) {
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
test('decode failure is explicit and oversized source is rejected', async () => {
  globalThis.createImageBitmap = async () => { throw Error('unreadable'); };
  globalThis.Image = undefined;
  const source = photo();
  await assert.rejects(prepareImageForUpload(source), /otimizar|abrir|Decodificador/);
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
test('encoding failure releases resources and rejects instead of uploading the original', async () => {
  const state = browser({ failDraw: true });
  const source = photo();
  const originalWarn = console.warn;
  console.warn = () => {};
  try { await assert.rejects(prepareImageForUpload(source), /otimizar|draw failed/); }
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
    const result = await prepareImageForUpload(new File([new Uint8Array(2_000_000)], 'large.jpg', { type: 'image/jpeg' }), preset);
    assert.equal(result.size, 800_000);
  }
});


test('photographed documents are optimized by default and explicit integrity exception preserves bytes', async () => {
  browser();
  const source = photo();
  assert.equal((await prepareFileForUpload(source)).size, 1000);
  assert.equal(await prepareFileForUpload(source, 'document-image', { preserveOriginal: true }), source);
});
test('resizing never increases the transferred bytes', async () => {
  browser({ bytes: 600_000 });
  const source = photo();
  assert.equal(await prepareImageForUpload(source), source);
});
test('payment proofs, profiles and logos have their own reusable dimensions', async () => {
  const state = browser();
  await prepareImageForUpload(photo(), 'payment-proof');
  assert.deepEqual(state.drawnSize, [2200, 1650]);
  await prepareImageForUpload(photo(), 'profile-image');
  assert.deepEqual(state.drawnSize, [512, 384]);
  await prepareImageForUpload(photo(), 'logo-image');
  assert.deepEqual(state.drawnSize, [1600, 1200]);
});
test('HEIC capture converts when native decoder supports it', async () => {
  browser();
  const source = new File([new Uint8Array(500_000)], 'iphone.heic', { type: 'image/heic' });
  const result = await prepareImageForUpload(source);
  assert.equal(result.type, 'image/webp');
  assert.notEqual(result, source);
});
test('missing camera MIME is inferred from the filename without changing PDF bytes', async () => {
  browser();
  const source = new File([new Uint8Array(500_000)], 'camera.JPG');
  assert.equal((await prepareFileForUpload(source)).type, 'image/webp');
  const pdf = new File(['%PDF-1.7'], 'receipt.pdf');
  assert.equal(await prepareFileForUpload(pdf), pdf);
});
test('unavailable canvas fails explicitly rather than silently returning a camera original', async () => {
  globalThis.document = undefined;
  await assert.rejects(prepareImageForUpload(photo()), /otimizar|navegador/i);
});
test('invalid decoded dimensions reject instead of creating corrupt output', async () => {
  const state = browser({ width: 0, height: 0 });
  await assert.rejects(prepareImageForUpload(photo()), /dimens|otimizar/i);
  assert.equal(state.closed, 1);
});
test('failed preparation can be retried after a transient decoder failure', async () => {
  const source = photo();
  browser({ failDraw: true });
  await assert.rejects(prepareImageForUpload(source));
  browser();
  assert.equal((await prepareImageForUpload(source)).size, 1000);
});

test('transparent logo keeps lossless PNG pixels rather than lossy encoding', async () => {
  browser({ actualType: 'requested', transparent: true });
  const result = await prepareImageForUpload(new File([new Uint8Array(500_000)], 'logo.png', { type: 'image/png' }), 'logo-image');
  assert.equal(result.type, 'image/png');
});
test('explicit original archive can retain its existing 25 MB limit', async () => {
  const source = new File([new Uint8Array(21 * 1024 * 1024)], 'archive.zip', { type: 'application/zip' });
  assert.equal(await prepareFileForUpload(source, 'document-image', { preserveOriginal: true, maxBytes: 25 * 1024 * 1024 }), source);
});
test('large gallery preparations bound the number of simultaneously decoded images', async () => {
  browser();
  let active = 0;
  let maximum = 0;
  globalThis.createImageBitmap = async (_file, options) => {
    assert.equal(options.imageOrientation, 'from-image');
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve));
    return { width: 4000, height: 3000, close() { active--; } };
  };
  await Promise.all([prepareImageForUpload(photo()), prepareImageForUpload(photo()), prepareImageForUpload(photo())]);
  assert.equal(maximum, 1);
  assert.equal(active, 0);
});

test('small WebP photos are still converted for WhatsApp JPEG/PNG compatibility', async () => {
  browser({ actualType: 'requested', width: 400, height: 300 });
  const source = new File([new Uint8Array(50_000)], 'camera.webp', { type: 'image/webp' });
  const result = await prepareImageForUpload(source, 'whatsapp-image');
  assert.equal(result.type, 'image/jpeg');
});
test('a required WhatsApp conversion that increases bytes is rejected explicitly', async () => {
  browser({ actualType: 'requested', bytes: 600_000 });
  const source = new File([new Uint8Array(500_000)], 'camera.webp', { type: 'image/webp' });
  await assert.rejects(prepareImageForUpload(source, 'whatsapp-image'), /aumentar|otimizar/i);
});

test('transparent AVIF conversion for messaging retains its alpha channel', async () => {
  browser({ actualType: 'requested', transparent: true });
  const source = new File([new Uint8Array(500_000)], 'logo.avif', { type: 'image/avif' });
  assert.equal((await prepareImageForUpload(source, 'sac-image')).type, 'image/png');
});

for (const type of ['', 'application/octet-stream']) {
  test(`small retained JPEG normalizes ${type || 'missing'} MIME and caches identical bytes`, async () => {
    const state = browser({ width: 400, height: 300 });
    const source = new File([new Uint8Array(50_000).fill(23)], 'camera.JPG', { type, lastModified: 123 });
    const prepared = await prepareFileForUpload(source);
    assert.equal(prepared.type, 'image/jpeg');
    assert.equal(prepared.name, source.name);
    assert.equal(prepared.lastModified, source.lastModified);
    assert.deepEqual(await prepared.arrayBuffer(), await source.arrayBuffer());
    assert.equal(await prepareFileForUpload(source), prepared);
    assert.equal(await prepareFileForUpload(prepared), prepared);
    assert.equal(state.decoded, 1);
  });
  test(`larger encoding retains JPEG bytes with normalized ${type || 'missing'} MIME`, async () => {
    browser({ width: 400, height: 300, bytes: 600_000 });
    const source = new File([new Uint8Array(500_000).fill(23)], 'camera.JPG', { type, lastModified: 123 });
    const prepared = await prepareFileForUpload(source);
    assert.equal(prepared.type, 'image/jpeg');
    assert.equal(prepared.name, source.name);
    assert.equal(prepared.lastModified, source.lastModified);
    assert.deepEqual(await prepared.arrayBuffer(), await source.arrayBuffer());
  });
}
