import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const sourceRoot = new URL('../../', import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/supabase') return { url: 'data:text/javascript,export const supabase=globalThis.__auditUploadSupabase;', shortCircuit: true };
  if (specifier.startsWith('@/')) return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
  return nextResolve(specifier, context);
} });
const calls = [];
globalThis.__auditUploadSupabase = {
  storage: { from: bucket => ({ upload: async (path, file, options) => { calls.push({ kind: 'upload', bucket, path, file, options }); return { error: null }; }, remove: async () => ({ error: null }) }) },
  from: table => ({ insert(payload) { calls.push({ kind: 'insert', table, payload }); return { error: null, select: () => ({ single: async () => ({ data: { id: 'record' }, error: null }) }) }; } }),
  rpc: async (name, args) => { calls.push({ kind: 'rpc', name, args }); return { error: null }; },
};
const { addProviderAttachment } = await import('../../features/platform-providers/infrastructure/platform-providers.repository.ts');
const { uploadManagementFiles, uploadManagementFileVersion } = await import('../../features/management/infrastructure/management.repository.ts');
const originalDocument = globalThis.document;
const originalBitmap = globalThis.createImageBitmap;
afterEach(() => { calls.length = 0; globalThis.document = originalDocument; globalThis.createImageBitmap = originalBitmap; });
function browser() {
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) }),
    toBlob(callback, type) { callback(new Blob([new Uint8Array(1000)], { type })); },
  }) };
}
test('provider camera image uploads optimized bytes and records matching MIME/name/size', async () => {
  browser();
  await addProviderAttachment('org', 'provider', new File([new Uint8Array(2_000_000)], 'scan.jpg', { type: 'image/jpeg' }));
  const upload = calls.find(call => call.kind === 'upload');
  const record = calls.find(call => call.kind === 'insert').payload;
  assert.equal(upload.file.size, 1000);
  assert.equal(upload.options.contentType, upload.file.type);
  assert.equal(record.mime_type, upload.file.type);
  assert.equal(record.file_name, upload.file.name);
  assert.equal(record.file_size, 1000);
  assert.equal(record.storage_path, upload.path);
  assert.match(upload.path, /\.webp$/);
});
test('provider camera image with no browser MIME still uses document optimizer', async () => {
  browser();
  await addProviderAttachment('org', 'provider', new File([new Uint8Array(2_000_000)], 'scan.JPG'));
  assert.equal(calls.find(call => call.kind === 'upload').file.size, 1000);
});
test('provider PDF preserves original signed document bytes', async () => {
  const pdf = new File(['%PDF-original'], 'signed.pdf', { type: 'application/pdf' });
  await addProviderAttachment('org', 'provider', pdf);
  assert.equal(calls.find(call => call.kind === 'upload').file, pdf);
});
test('versioned management archive preserves image originals including permitted 25 MB files', async () => {
  const source = new File([new Uint8Array(24 * 1024 * 1024)], 'artwork.png', { type: 'image/png' });
  await uploadManagementFiles('space', 'folder', [source]);
  const upload = calls.find(call => call.kind === 'upload');
  assert.equal(upload.file, source);
  assert.equal(calls.find(call => call.kind === 'rpc').args.p_size, source.size);
  calls.length = 0;
  await uploadManagementFileVersion({ kind: 'file', storage_path: 'old', id: 'record', space_id: 'space', folder_id: 'folder' }, source);
  assert.equal(calls.find(call => call.kind === 'upload').file, source);
  assert.equal(calls.find(call => call.kind === 'rpc').args.p_size, source.size);
});
test('provider decode failure prevents original image from reaching Storage', async () => {
  globalThis.createImageBitmap = async () => { throw new Error('decode'); };
  await assert.rejects(addProviderAttachment('org', 'provider', new File([new Uint8Array(2_000_000)], 'bad.jpg', { type: 'image/jpeg' })));
  assert.equal(calls.length, 0);
});
