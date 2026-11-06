import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as coordinator from './refresh-coordinator.mjs';

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function environment(t, run, initial = 'visible') {
 t.mock.timers.enable({ apis: ['setInterval'] });
 const page = new EventTarget(), connection = new EventTarget();
 page.visibilityState = initial;
 assert.equal(typeof coordinator.createVisiblePolling, 'function');
 const polling = coordinator.createVisiblePolling(run, { page, connection });
 return {
  dispose: () => polling.dispose(),
  visibility(value) { page.visibilityState = value; page.dispatchEvent(new Event('visibilitychange')); },
  reconnect() { connection.dispatchEvent(new Event('online')); },
  async tick(ms) { t.mock.timers.tick(ms); await settle(); },
 };
}

test('hidden operator queue makes no requests and resumes once with normal foreground cadence', async t => {
 let calls = 0;
 const env = environment(t, async () => { calls++; }, 'hidden');
 await env.tick(120_000); assert.equal(calls, 0);
 env.visibility('visible'); await settle(); assert.equal(calls, 1);
 env.visibility('visible'); await settle(); assert.equal(calls, 1);
 await env.tick(29_999); assert.equal(calls, 1);
 await env.tick(1); assert.equal(calls, 2);
 env.visibility('hidden'); await env.tick(300_000); assert.equal(calls, 2);
 env.dispose();
});

test('initial visible polling preserves the already loaded queue then refreshes every 30 seconds', async t => {
 let calls = 0;
 const env = environment(t, async () => { calls++; });
 await settle(); assert.equal(calls, 0);
 await env.tick(30_000); assert.equal(calls, 1);
 await env.tick(30_000); assert.equal(calls, 2);
 env.dispose();
});

test('disposal removes timers and visibility/reconnect listeners', async t => {
 let calls = 0;
 const env = environment(t, async () => { calls++; });
 env.dispose(); env.visibility('hidden'); env.visibility('visible'); env.reconnect();
 await env.tick(120_000); assert.equal(calls, 0);
});

test('rejected queue reads recover on the next foreground tick and reconnect is immediate', async t => {
 let calls = 0;
 const env = environment(t, async () => { calls++; if (calls === 1) throw Error('offline'); });
 await env.tick(30_000); assert.equal(calls, 1);
 env.reconnect(); await settle(); assert.equal(calls, 2);
 await env.tick(30_000); assert.equal(calls, 3);
 env.dispose();
});

test('slow requests never overlap and visibility resume gets one fresh read after the old request', async t => {
 let calls = 0, release;
 const env = environment(t, () => { calls++; return calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(); });
 await env.tick(30_000); await env.tick(90_000); assert.equal(calls, 1);
 env.visibility('hidden'); env.visibility('visible'); env.visibility('visible'); await settle();
 assert.equal(calls, 1);
 release(); await settle(); assert.equal(calls, 2);
 env.dispose();
});

test('unmount or hiding while a read finishes cannot launch a trailing request', async t => {
 let calls = 0, release;
 const env = environment(t, () => { calls++; return new Promise(resolve => { release = resolve; }); });
 await env.tick(30_000);
 env.visibility('hidden'); env.visibility('visible'); env.dispose();
 release(); await settle(); assert.equal(calls, 1);
});
