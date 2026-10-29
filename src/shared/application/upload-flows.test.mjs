import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const sourceRoot = new URL('../../', import.meta.url);
const stubUrl = 'data:text/javascript,export const supabase=globalThis.__uploadTestSupabase;export const supabaseUrl="https://example.test";';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/supabase') return { url: stubUrl, shortCircuit: true };
  if (specifier.startsWith('@/')) return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
  return nextResolve(specifier, context);
} });
const calls = [];
globalThis.__uploadTestSupabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  storage: { from: bucket => ({
    upload: async (path, file, options) => { calls.push({ kind: 'upload', bucket, path, file, options }); return { error: null }; },
    remove: async () => ({ error: null }),
  }) },
  rpc: async (name, args) => { calls.push({ kind: 'rpc', name, args }); return { data: { success: true, protocol: 'ORC-1' }, error: null }; },
  functions: { invoke: async (name, { body }) => { calls.push({ kind: 'invoke', name, body }); return { data: { success: true, outcome: 'accepted' }, error: null }; } },
  from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
};
const { uploadTechnicianPhoto } = await import('../../features/technician-panel/infrastructure/technician-tasks.repository.ts');
const { submitServiceBooking } = await import('../../features/public-services/infrastructure/service-booking.repository.ts');
const { uploadManagementLogo } = await import('../../features/management/infrastructure/management.repository.ts');
const { sendSacDigitalMediaMessage } = await import('../../features/sac-digital/infrastructure/sac-digital.repository.ts');
const { uploadMobileOrderDocument } = await import('../../features/checklists/infrastructure/order-mobile-checklist.gateway.ts');
const originalDocument = globalThis.document;
const originalBitmap = globalThis.createImageBitmap;
afterEach(() => { calls.length = 0; globalThis.document = originalDocument; globalThis.createImageBitmap = originalBitmap; });
function browser(bytes = 1000) {
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) }),
    toBlob(callback, type) { callback(new Blob([new Uint8Array(bytes)], { type })); },
  }) };
}
const photo = (megabytes = 8) => new File([new Uint8Array(megabytes * 1024 * 1024)], 'camera.jpg', { type: 'image/jpeg' });

test('technician photo is compressed before enforcing the 5 MB Storage cap', async () => {
  browser();
  await uploadTechnicianPhoto('org', 'item', photo());
  const upload = calls.find(call => call.kind === 'upload');
  assert.equal(upload.file.size, 1000);
  assert.equal(upload.file.type, 'image/webp');
  assert.match(upload.path, /^org\/item\/user-1\/.*\.webp$/);
  assert.equal(upload.options.contentType, 'image/webp');
});
test('technician photo over the final cap does not reach Storage or registration', async () => {
  browser(6 * 1024 * 1024);
  await assert.rejects(uploadTechnicianPhoto('org', 'item', photo()), /limite/i);
  assert.equal(calls.length, 0);
});
test('public quote compresses photos and uses label preset before creating request', async () => {
  browser();
  const source = photo();
  await submitServiceBooking({ customerType: 'PF', nome: 'Cliente' }, {}, { brand_name: '', attendance_mode: 'store' }, 'ORC-1', { equipment: source, label: photo() });
  const body = calls.find(call => call.kind === 'invoke').body;
  assert.equal(body.get('equipment').size, 1000);
  assert.equal(body.get('label').size, 1000);
  assert.equal(body.get('equipment').type, 'image/webp');
  assert.equal(calls[0].kind, 'rpc');
});
test('public quote refuses uncompressible oversized photo before creating a request', async () => {
  browser(7 * 1024 * 1024);
  await assert.rejects(submitServiceBooking({ customerType: 'PF', nome: 'Cliente' }, {}, { brand_name: '', attendance_mode: 'store' }, 'ORC-1', { equipment: photo() }), /limite/i);
  assert.equal(calls.length, 0);
});
test('management logo uses optimized bytes, MIME and extension', async () => {
  browser();
  await uploadManagementLogo('space', photo(4));
  const upload = calls.find(call => call.kind === 'upload');
  assert.equal(upload.file.size, 1000);
  assert.equal(upload.file.type, 'image/webp');
  assert.match(upload.path, /\.webp$/);
  assert.equal(upload.options.contentType, 'image/webp');
});
test('SAC compresses a camera photo to JPEG before its 1 MB provider cap', async () => {
  browser();
  await sendSacDigitalMediaMessage('org', 'protocol', photo(), 'Legenda');
  const body = calls.find(call => call.kind === 'invoke').body;
  assert.equal(body.get('file').size, 1000);
  assert.equal(body.get('file').type, 'image/jpeg');
  assert.equal(body.get('text'), 'Legenda');
});
test('mobile documents preserve original scan bytes while situation photos are optimized', async () => {
  browser();
  const source = photo(2);
  await uploadMobileOrderDocument('session', 'token', 'attachment', 'target', source);
  assert.equal(calls[0].body.get('file').size, source.size);
  assert.equal(calls[0].body.get('file').type, source.type);
  await uploadMobileOrderDocument('session', 'token', 'situation', 'target', photo(2));
  assert.equal(calls[1].body.get('file').size, 1000);
});

test('SAC rejects an image that remains above provider cap before invoking the API', async () => {
  browser(2 * 1024 * 1024);
  await assert.rejects(sendSacDigitalMediaMessage('org', 'protocol', photo()), error => error.outcome === 'rejected' && error.type === 'invalid_media');
  assert.equal(calls.length, 0);
});

test('mobile situation photo over the final 10 MB cap is rejected before invocation', async () => {
  browser(11 * 1024 * 1024);
  await assert.rejects(uploadMobileOrderDocument('session', 'token', 'situation', 'target', photo(12)), /limite/i);
  assert.equal(calls.length, 0);
});
