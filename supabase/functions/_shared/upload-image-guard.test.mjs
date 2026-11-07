import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPreparedUploadImage, inspectUploadImage } from './upload-image-guard.mjs';

function png(width, height, size = 32) {
  const bytes = new Uint8Array(size);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const view = new DataView(bytes.buffer); view.setUint32(16,width); view.setUint32(20,height);
  return new File([bytes], 'camera.png', { type: 'image/png' });
}
function webp(kind, width, height) {
  const bytes = new Uint8Array(32); const view = new DataView(bytes.buffer);
  const str = (offset, value) => bytes.set([...value].map(c=>c.charCodeAt(0)), offset);
  str(0,'RIFF'); str(8,'WEBP'); str(12, kind);
  if (kind === 'VP8X') {
    for (let i=0;i<3;i++) { bytes[24+i]=((width-1) >>> (8*i)) & 255; bytes[27+i]=((height-1) >>> (8*i)) & 255; }
  } else if (kind === 'VP8 ') {
    bytes.set([0x9d,1,0x2a],23); view.setUint16(26,width,true); view.setUint16(28,height,true);
  } else { bytes[20]=0x2f; view.setUint32(21,(width-1)|((height-1)<<14),true); }
  return new File([bytes], 'photo.webp', { type: 'image/webp' });
}
test('accepts actual resized PNG and all WebP header variants', async () => {
  assert.deepEqual(await inspectUploadImage(png(1600,1200)),{type:'image/png',width:1600,height:1200});
  for (const kind of ['VP8X','VP8 ','VP8L']) assert.deepEqual(await inspectUploadImage(webp(kind,1600,1200)),{type:'image/webp',width:1600,height:1200});
});
test('reads JPEG dimensions after metadata', async () => {
  const bytes = new Uint8Array([255,216,255,225,0,4,0,0,255,192,0,7,8,4,176,6,64]);
  assert.deepEqual(await inspectUploadImage(new File([bytes],'photo.jpg',{type:'image/jpeg'})),{type:'image/jpeg',width:1600,height:1200});
});
test('accepts efficient originals without trusting client optimization markers', async () => {
  const original = png(4000,3000,1024*1024);
  original.optimized = true;
  assert.equal((await assertPreparedUploadImage(original)).width,4000);
});
test('document profile accepts readable 2200px output and hard resource limit rejects huge containers', async () => {
  await assertPreparedUploadImage(png(2200,1600,512*1024),'payment-proof');
  await assertPreparedUploadImage(png(4000,3000,200*1024));
  await assert.rejects(assertPreparedUploadImage(png(30000,30000),'payment-proof'),/limite/);
});
test('rejects spoofed MIME, unsupported, malformed and zero dimension images', async () => {
  const valid = png(1200,900);
  await assert.rejects(assertPreparedUploadImage(new File([valid],'fake.jpg',{type:'image/jpeg'})),/formato/);
  await assert.rejects(inspectUploadImage(new File(['fake'],'fake.heic',{type:'image/heic'})),/validar/);
  await assert.rejects(assertPreparedUploadImage(png(0,900)),/formato/);
});

test('every QR multipart image storage path validates actual image bytes before writing', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const [endpoint, minimum] of [['device-capture',1],['device-checklist',1],['order-mobile-edit',1],['order-mobile-checklist',2]]) {
    const source = await readFile(new URL(`../${endpoint}/index.ts`, import.meta.url),'utf8');
    assert.ok((source.match(/await assertPreparedUploadImage\(file,/g) || []).length >= minimum, endpoint);
    assert.ok(source.indexOf('await assertPreparedUploadImage(file,') < source.indexOf('.upload('), endpoint);
  }
});

test('JPEG dimensions remain readable after more than 256 KB of metadata', async () => {
  const pieces = [new Uint8Array([255,216])];
  for (let i=0;i<5;i++) {
    const app = new Uint8Array(65537); app.set([255,225,255,255]); pieces.push(app);
  }
  pieces.push(new Uint8Array([255,192,0,7,8,4,176,6,64]));
  assert.deepEqual(await inspectUploadImage(new File(pieces,'metadata.jpg',{type:'image/jpeg'})),{type:'image/jpeg',width:1600,height:1200});
});
