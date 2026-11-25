import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';

const require = createRequire(import.meta.url);
const { code } = await transform(readFileSync(new URL('../../lib/supabase.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
});

async function withClient(factory, fetch, run) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetch;
  const compiled = { exports: {} };
  const load = name => {
    if (name === '@/infrastructure/query/local-performance-runtime') return { performanceFetch: fetch };
    if (name === '../../utils/supabase/info') return { projectId: 'retry-test', publicAnonKey: 'public-anon-test-key' };
    return require(name);
  };
  let shared, transient;
  try {
    new Function('require', 'module', 'exports', '__APP_TARGET__', code)(load, compiled, compiled.exports, 'crm');
    shared = compiled.exports.supabase;
    transient = factory === 'transient' ? compiled.exports.createTransientSupabaseClient() : null;
    await run(transient || shared);
  } finally {
    await shared?.auth.stopAutoRefresh();
    await transient?.auth.stopAutoRefresh();
    globalThis.fetch = previousFetch;
  }
}

function overload(status) {
  return new Response(JSON.stringify({ message: 'Database overloaded', code: 'PGRST003', details: '', hint: '' }), {
    status, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
  });
}

for (const factory of ['shared', 'transient']) {
  for (const status of [503, 520]) {
    for (const endpoint of ['rest', 'get-rpc']) {
      test(`${factory} SDK ${endpoint} sends one request when the server returns ${status}`, async () => {
        const calls = [];
        await withClient(factory, async (url, init) => {
          calls.push({ url: String(url), method: init.method });
          return overload(status);
        }, async client => {
          const result = endpoint === 'rest'
            ? await client.from('orders').select('id')
            : await client.rpc('orders_list', {}, { get: true });
          assert.equal(result.status, status);
          assert.equal(result.error.code, 'PGRST003');
          assert.equal(calls.length, 1);
          assert.equal(calls[0].method, 'GET');
          assert.match(calls[0].url, endpoint === 'rest' ? /\/rest\/v1\/orders\?/ : /\/rest\/v1\/rpc\/orders_list/);
        });
      });
    }
  }

  test(`${factory} SDK does not replay a failed POST mutation`, async () => {
    const methods = [];
    await withClient(factory, async (_url, init) => {
      methods.push(init.method);
      return overload(503);
    }, async client => {
      const result = await client.from('orders').insert({ id: 'order-test' });
      assert.equal(result.status, 503);
      assert.deepEqual(methods, ['POST']);
    });
  });

  test(`${factory} SDK allows a later manual read to recover after overload`, async () => {
    let calls = 0;
    await withClient(factory, async () => {
      if (++calls === 1) return overload(503);
      return new Response('[{"id":"order-test"}]', { headers: { 'Content-Type': 'application/json' } });
    }, async client => {
      const failed = await client.from('orders').select('id');
      assert.equal(failed.status, 503);
      assert.equal(calls, 1);
      const recovered = await client.from('orders').select('id');
      assert.equal(recovered.error, null);
      assert.deepEqual(recovered.data, [{ id: 'order-test' }]);
      assert.equal(calls, 2);
    });
  });
}
