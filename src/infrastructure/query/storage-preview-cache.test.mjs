import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { getStoragePreviewUrl } from './storage-preview-cache.ts';

test('simultaneous previews and reopened galleries share one Storage signing request', async t => {
  const client = new QueryClient();
  t.after(() => client.clear());
  let calls = 0;
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const sign = () => { calls++; return pending; };
  const requests = Array.from({ length: 100 }, () =>
    getStoragePreviewUrl(client, 'technician-task-photos', 'org/task/photo.jpg', sign));
  assert.equal(calls, 1);
  resolve('signed-preview');
  assert.deepEqual((await Promise.all(requests)).map(preview => preview.url), Array(100).fill('signed-preview'));
  assert.equal((await getStoragePreviewUrl(client, 'technician-task-photos', 'org/task/photo.jpg', sign)).url, 'signed-preview');
  assert.equal(calls, 1);
});

test('same path never shares URLs across tenant clients or buckets; logout clear forces reauthorization', async t => {
  const a = new QueryClient(), b = new QueryClient();
  t.after(() => { a.clear(); b.clear(); });
  let calls = 0;
  const sign = async () => 'url-' + ++calls;
  assert.equal((await getStoragePreviewUrl(a, 'service-images', 'photo', sign)).url, 'url-1');
  assert.equal((await getStoragePreviewUrl(b, 'service-images', 'photo', sign)).url, 'url-2');
  assert.equal((await getStoragePreviewUrl(a, 'technician-task-photos', 'photo', sign)).url, 'url-3');
  a.clear();
  assert.equal((await getStoragePreviewUrl(a, 'service-images', 'photo', sign)).url, 'url-4');
});

test('Storage outage is not retried on every render, but recovers after two minutes', async t => {
  const client = new QueryClient();
  t.after(() => client.clear());
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let calls = 0;
  const outage = new Error('Storage timeout');
  const sign = async () => { if (++calls === 1) throw outage; return 'recovered'; };
  await assert.rejects(getStoragePreviewUrl(client, 'bucket', 'photo', sign), outage);
  for (let i = 0; i < 20; i++)
    await assert.rejects(getStoragePreviewUrl(client, 'bucket', 'photo', sign), outage);
  assert.equal(calls, 1);
  t.mock.timers.tick(120_001);
  assert.equal((await getStoragePreviewUrl(client, 'bucket', 'photo', sign)).url, 'recovered');
  assert.equal(calls, 2);
});

test('URLs are renewed before their ten-minute server expiration', async t => {
  const client = new QueryClient();
  t.after(() => client.clear());
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let calls = 0;
  const sign = async () => 'url-' + ++calls;
  assert.equal((await getStoragePreviewUrl(client, 'bucket', 'photo', sign)).url, 'url-1');
  t.mock.timers.tick(300_000);
  const reused = await getStoragePreviewUrl(client, 'bucket', 'photo', sign);
  assert.equal(reused.url, 'url-1');
  assert.equal(reused.expiresAt, 1_480_000, 'reusing a preview must not extend the original expiry');
  t.mock.timers.tick(180_001);
  assert.equal((await getStoragePreviewUrl(client, 'bucket', 'photo', sign)).url, 'url-2');
});

test('OS and technician secondary caches preserve the original preview deadline', () => {
  const orders = readFileSync('src/features/orders/presentation/OrderProductsServicesSection.tsx', 'utf8');
  const technician = readFileSync('src/features/technician-panel/presentation/TechnicianPanel.tsx', 'utf8');
  assert.match(orders, /expires: result.value.expiresAt/);
  assert.match(orders, /expires: entry.preview.expiresAt/);
  assert.match(technician, /cached.expiresAt > Date.now\(\)/);
  assert.match(technician, /cached.expiresAt - Date.now\(\)/);
  assert.match(technician, /cached.urlsExpireAt <= Date.now\(\)/);
  assert.match(technician, /previews.map\(photo => photo.expiresAt\)/);
});

test('one-hour image previews do not shorten ten-minute task URLs or extend their deadline', async t => {
  const client = new QueryClient(); t.after(() => client.clear());
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let calls = 0;
  const sign = async () => 'url-' + ++calls;
  const short = await getStoragePreviewUrl(client, 'bucket', 'photo', sign);
  const long = await getStoragePreviewUrl(client, 'bucket', 'photo', sign, 3600);
  assert.notEqual(short.url, long.url);
  assert.equal(long.expiresAt, 4_480_000);
  t.mock.timers.tick(480_001);
  assert.deepEqual(await getStoragePreviewUrl(client, 'bucket', 'photo', sign, 3600), long);
  assert.notEqual((await getStoragePreviewUrl(client, 'bucket', 'photo', sign)).url, short.url);
  assert.equal(calls, 3);
});
