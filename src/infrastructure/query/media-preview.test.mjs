import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { QueryClient } from '@tanstack/react-query';

const root = new URL('../../', import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/supabase') return { url: 'data:text/javascript,export const supabase=globalThis.__mediaPreviewSupabase;', shortCircuit: true };
  if (specifier === '@/lib/active-organization') return { url: 'data:text/javascript,export const getActiveOrganizationId=async()=>"org";', shortCircuit: true };
  if (specifier.startsWith('@/')) return nextResolve(new URL(specifier.slice(2) + '.ts', root).href, context);
  return nextResolve(specifier, context);
} });
let metadataCalls = 0, signatures = 0;
const media = { id: 'photo', bucket_id: 'service-images', storage_path: 'org/photo.webp', file_name: 'photo.webp' };
globalThis.__mediaPreviewSupabase = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { metadataCalls++; return { data: media, error: null }; } }) }) }),
  storage: { from: bucket => ({
    createSignedUrl: async (path, seconds) => { signatures++; assert.equal(seconds, 3600); return { data: { signedUrl: `${bucket}/${path}?signature=${signatures}` }, error: null }; },
    getPublicUrl: path => ({ data: { publicUrl: `${bucket}/${path}` } }),
  }) },
};
const repository = await import('../../shared/infrastructure/media.repository.ts');

test('preloaded OS media skips metadata requests and shares signing with print previews', async t => {
  const client = new QueryClient(); t.after(() => client.clear());
  metadataCalls = 0; signatures = 0;
  const previews = await Promise.all(Array.from({ length: 100 }, () => repository.getMediaPreview(client, 'photo', media)));
  assert.equal(metadataCalls, 0);
  assert.equal(signatures, 1);
  assert.equal(new Set(previews.map(p => p.url)).size, 1);
  assert.equal(await repository.resolveMediaStorageUrl(media.bucket_id, media.storage_path, 3600, client), previews[0].url);
  assert.equal(signatures, 1);
});

test('missing or mismatched preloaded metadata is fetched once per client', async t => {
  const client = new QueryClient(); t.after(() => client.clear());
  metadataCalls = 0; signatures = 0;
  await Promise.all(Array.from({ length: 20 }, () => repository.getMediaPreview(client, 'photo', { ...media, id: 'other' })));
  assert.equal(metadataCalls, 1);
  assert.equal(signatures, 1);
});

test('preview reuse preserves expiry and company switch requires another authorization', async t => {
  const a = new QueryClient(), b = new QueryClient(); t.after(() => { a.clear(); b.clear(); });
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  metadataCalls = 0; signatures = 0;
  const first = await repository.getMediaPreview(a, 'photo', media);
  t.mock.timers.tick(300_000);
  assert.deepEqual(await repository.getMediaPreview(a, 'photo', media), first);
  assert.notEqual((await repository.getMediaPreview(b, 'photo', media)).url, first.url);
  t.mock.timers.tick(3_180_001);
  assert.notEqual((await repository.getMediaPreview(a, 'photo', media)).url, first.url);
  assert.equal(signatures, 3);
});

test('public assets retain stable URLs without private signing or expiry', async t => {
  const client = new QueryClient(); t.after(() => client.clear());
  signatures = 0;
  const preview = await repository.getMediaPreview(client, 'logo', { ...media, id: 'logo', bucket_id: 'public-assets' });
  assert.equal(preview.url, 'public-assets/org/photo.webp');
  assert.equal(preview.expiresAt, null);
  assert.equal(signatures, 0);
});

test('incomplete workspace metadata falls back to the authorized media lookup', async t => {
  const client = new QueryClient(); t.after(() => client.clear());
  metadataCalls = 0;
  assert.ok((await repository.getMediaPreview(client, 'photo', { id: 'photo', storage_path: 'org/photo.webp' })).url);
  assert.equal(metadataCalls, 1);
});
