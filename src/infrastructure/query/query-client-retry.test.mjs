import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';

const { code } = await transform(readFileSync(new URL('./query-client.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', code)(createRequire(import.meta.url), compiled, compiled.exports);
const { createAppQueryClient } = compiled.exports;

async function failingQuery(error) {
  const client = createAppQueryClient();
  let attempts = 0;
  try {
    await assert.rejects(client.fetchQuery({
      queryKey: ['organization-a', 'orders'],
      retryDelay: 0,
      queryFn: async () => { attempts++; throw error; },
    }), received => received === error);
    return attempts;
  } finally {
    client.clear();
  }
}

test('database cancellation, overloaded gateways and request deadlines do not repeat expensive reads', async () => {
  for (const error of [
    { code: '57014', message: 'canceling statement due to statement timeout' },
    { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' },
    { status: 408, message: 'Request timeout' },
    { status: 429, message: 'Too many requests' },
    { status: 500, message: 'Internal server error' },
    { status: 502, message: 'Bad gateway' },
    { status: 503, message: 'Service unavailable' },
    { status: 504, message: 'Gateway timeout' },
    new DOMException('signal timed out', 'TimeoutError'),
    new DOMException('request aborted', 'AbortError'),
    { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' },
    { message: 'AbortError: signal is aborted without reason', details: '', hint: '', code: '' },
  ]) {
    assert.equal(await failingQuery(error), 1, JSON.stringify(error));
  }
});

test('authorization and application failures are returned without a second request', async () => {
  for (const error of [
    { status: 401, message: 'Unauthorized' },
    { status: 403, message: 'Forbidden' },
    { code: '42501', message: 'permission denied' },
    new Error('Invalid filter'),
    new TypeError('Cannot read properties of undefined'),
  ]) {
    assert.equal(await failingQuery(error), 1, JSON.stringify(error));
  }
});

test('an isolated transport failure can recover once, with a strict retry limit', async () => {
  for (const error of [
    new TypeError('Failed to fetch'),
    { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
    { code: 'ECONNRESET', message: 'connection reset' },
  ]) {
    assert.equal(await failingQuery(error), 2);
    const client = createAppQueryClient();
    let attempts = 0;
    try {
      assert.equal(await client.fetchQuery({
        queryKey: ['organization-a', 'orders'], retryDelay: 0,
        queryFn: async () => { if (++attempts === 1) throw error; return 'recovered'; },
      }), 'recovered');
      assert.equal(attempts, 2);
    } finally {
      client.clear();
    }
  }
});

test('an explicit retry after a timeout can recover and keeps organization caches separate', async () => {
  const firstOrganization = createAppQueryClient();
  const secondOrganization = createAppQueryClient();
  let attempts = 0;
  const queryKey = ['orders'];
  const queryFn = async () => {
    if (++attempts === 1) throw { code: '57014', message: 'statement timeout' };
    return ['organization-a-order'];
  };
  try {
    await assert.rejects(firstOrganization.fetchQuery({ queryKey, queryFn, retryDelay: 0 }));
    assert.equal(attempts, 1);
    assert.deepEqual(await firstOrganization.fetchQuery({ queryKey, queryFn }), ['organization-a-order']);
    assert.equal(secondOrganization.getQueryData(queryKey), undefined);
    firstOrganization.clear();
    assert.equal(firstOrganization.getQueryData(queryKey), undefined);
  } finally {
    firstOrganization.clear();
    secondOrganization.clear();
  }
});
