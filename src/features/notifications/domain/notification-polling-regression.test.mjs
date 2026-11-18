import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

function notificationRuntime() {
  let now = 180_000;
  let nextTimer = 0;
  let queue = [];
  let handlers;
  let cached;
  let invalidations = 0;
  const effects = [];
  const timers = new Map();
  const requests = [];
  const setTimeout = (callback, delay) => {
    timers.set(++nextTimer, { at: now + delay, callback });
    return nextTimer;
  };
  const clearTimeout = id => timers.delete(id);
  class Clock extends Date { static now() { return now; } }
  const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const load = (path, dependencies) => {
    const source = transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs" }).code;
    const module = { exports: {} };
    new Function("require", "module", "exports", "setTimeout", "clearTimeout", "Date", "console", source)(
      name => {
        assert.ok(name in dependencies, `Unexpected dependency ${name}`);
        return dependencies[name];
      }, module, module.exports, setTimeout, clearTimeout, Clock, { warn() {}, error() {} },
    );
    return module.exports;
  };
  const repository = load("src/features/notifications/infrastructure/notifications.repository.ts", {
    "@/lib/supabase": { supabase: { rpc(name, args) {
      assert.equal(name, "load_admin_notifications_v1");
      assert.equal(args.p_organization_id, "org-a");
      return { abortSignal(signal) {
        return new Promise(resolve => requests.push({
          signal,
          resolve: data => resolve({ data, error: null }),
          fail: error => resolve({ data: null, error }),
        }));
      } };
    } } },
  });
  const client = {
    setQueryData(key, value) { cached = typeof value === "function" ? value(cached) : value; },
    invalidateQueries() { invalidations++; return repository.loadAdminNotifications("org-a", 50, "user-a"); },
  };
  const hook = load("src/features/notifications/application/useAdminNotifications.ts", {
    react: {
      useState: initial => [initial, update => { queue = typeof update === "function" ? update(queue) : update; }],
      useEffect: effect => effects.push(effect),
    },
    "@tanstack/react-query": { useQueryClient: () => client, useQuery: () => ({ data: undefined, isPending: false }) },
    "../infrastructure/notifications.repository": {
      ...repository,
      subscribeToAdminNotifications(org, user, callbacks) { handlers = callbacks; return () => {}; },
    },
  });
  hook.useAdminNotifications("org-a", "user-a");
  const cleanup = effects[0]();
  return {
    repository, requests, handlers, cleanup,
    get queue() { return queue; },
    get cached() { return cached; },
    get invalidations() { return invalidations; },
    settle,
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now && timers.delete(id)) timer.callback();
      }
      await settle();
    },
  };
}

const notification = (id, overrides = {}) => ({
  id, organization_id: "org-a", recipient_user_id: null, audit_log_id: null,
  actor_user_id: "other-user", actor_name_snapshot: "Other user", module_key: "orders",
  event_type: "created", entity_type: "service_order", entity_id: String(id),
  title: "Order created", message: "Order created", route: "/orders", metadata: {},
  created_at: "2026-11-18T12:00:00Z", read_at: null, delivery_allowed: true, ...overrides,
});

test("an INSERT arriving during an older shared inbox request receives a fresh authorized snapshot", async () => {
  const runtime = notificationRuntime();
  const original = runtime.repository.loadAdminNotifications("org-a", 50, "user-a");
  runtime.handlers.onNotification(notification(2));
  await runtime.advance(1_000);
  runtime.requests[0].resolve({ items: [notification(1)], unreadCount: 1 });
  await original;
  await runtime.settle();
  assert.equal(runtime.requests.length, 2, "the pre-event RPC cannot authorize or discard the new ID");
  runtime.requests[1].resolve({ items: [notification(2), notification(1)], unreadCount: 2 });
  await runtime.settle();
  assert.deepEqual(runtime.queue.map(item => item.id), [2]);
  runtime.cleanup();
});

test("slow realtime refreshes serialize bursts and state changes without dropping popup IDs", async () => {
  const runtime = notificationRuntime();
  runtime.handlers.onNotification(notification(1));
  await runtime.advance(1_000);
  runtime.handlers.onNotification(notification(2));
  runtime.handlers.onNotification(notification(3));
  runtime.handlers.onStateChange();
  runtime.handlers.onStateChange();
  await runtime.advance(1_000);
  assert.equal(runtime.requests.length, 1);
  runtime.requests[0].resolve({ items: [notification(1)], unreadCount: 1 });
  await runtime.settle();
  await runtime.advance(1_000);
  assert.equal(runtime.requests.length, 2, "a later burst must have one serialized reconciliation");
  runtime.requests[1].resolve({ items: [notification(3, { delivery_allowed: false }), notification(2), notification(1, { read_at: "read" })], unreadCount: 1 });
  await runtime.settle();
  assert.deepEqual(runtime.queue.map(item => item.id), [1, 2], "only server-authorized unread INSERTs become popups");
  assert.equal(runtime.cached.unreadCount, 1);
  assert.equal(runtime.invalidations, 0, "state events use the same coalesced refresh");
  runtime.cleanup();
});

test("read-state refresh waits for an older inbox RPC before loading the updated state", async () => {
  const runtime = notificationRuntime();
  const original = runtime.repository.loadAdminNotifications("org-a", 50, "user-a");
  runtime.handlers.onStateChange();
  await runtime.advance(1_000);
  runtime.requests[0].resolve({ items: [notification(1)], unreadCount: 1 });
  await original;
  await runtime.settle();
  assert.equal(runtime.requests.length, 2);
  runtime.requests[1].resolve({ items: [notification(1, { read_at: "read" })], unreadCount: 0 });
  await runtime.settle();
  assert.equal(runtime.cached.unreadCount, 0);
  assert.deepEqual(runtime.queue, []);
  runtime.cleanup();
});

test("concurrent fresh refreshes share a single follow-up RPC", async () => {
  const runtime = notificationRuntime();
  const original = runtime.repository.loadAdminNotifications("org-a", 50, "user-a");
  const first = runtime.repository.loadAdminNotifications("org-a", 50, "user-a", true);
  const second = runtime.repository.loadAdminNotifications("org-a", 50, "user-a", true);
  assert.equal(runtime.requests.length, 1);
  runtime.requests[0].resolve({ items: [], unreadCount: 0 });
  await original;
  await runtime.settle();
  assert.equal(runtime.requests.length, 2);
  runtime.requests[1].resolve({ items: [notification(2)], unreadCount: 1 });
  assert.deepEqual((await first).items.map(item => item.id), [2]);
  assert.deepEqual((await second).items.map(item => item.id), [2]);
  runtime.cleanup();
});

test("failed realtime refreshes retain INSERT and state events through cooldown", async () => {
  const runtime = notificationRuntime();
  runtime.handlers.onNotification(notification(1));
  runtime.handlers.onStateChange();
  await runtime.advance(1_000);
  runtime.requests[0].fail(new Error("Inbox unavailable"));
  await runtime.settle();
  runtime.handlers.onNotification(notification(2));
  runtime.handlers.onStateChange();
  await runtime.advance(1_000);
  assert.equal(runtime.requests.length, 1);
  await runtime.advance(29_000);
  assert.equal(runtime.requests.length, 2);
  runtime.requests[1].resolve({ items: [notification(2), notification(1)], unreadCount: 2 });
  await runtime.settle();
  assert.deepEqual(runtime.queue.map(item => item.id), [1, 2]);
  assert.equal(runtime.cached.unreadCount, 2);
  runtime.cleanup();
});

test("disposing an organization subscription discards its in-flight popup and cache update", async () => {
  const runtime = notificationRuntime();
  runtime.handlers.onNotification(notification(1));
  await runtime.advance(1_000);
  runtime.cleanup();
  assert.equal(runtime.requests[0].signal.aborted, false, "cleanup must not abort a shared RPC");
  runtime.requests[0].resolve({ items: [notification(1)], unreadCount: 1 });
  await runtime.settle();
  assert.equal(runtime.cached, undefined);
  assert.deepEqual(runtime.queue, []);
  await runtime.advance(30_000);
  assert.equal(runtime.requests.length, 1);
});

test("disposing while waiting for another consumer's RPC prevents the deferred refresh", async () => {
  const runtime = notificationRuntime();
  const original = runtime.repository.loadAdminNotifications("org-a", 50, "user-a");
  runtime.handlers.onNotification(notification(2));
  await runtime.advance(1_000);
  runtime.cleanup();
  runtime.requests[0].resolve({ items: [notification(1)], unreadCount: 1 });
  assert.equal((await original).unreadCount, 1, "cleanup must preserve the other consumer's shared request");
  await runtime.settle();
  assert.equal(runtime.requests.length, 1, "a disposed subscription must not start a follow-up RPC");
  assert.equal(runtime.cached, undefined);
  assert.deepEqual(runtime.queue, []);
});

test("notificações administrativas preservam Realtime e evitam requisições repetidas em foco", () => {
  const source = readFileSync("src/features/notifications/application/useAdminNotifications.ts", "utf8");
  assert.match(source, /subscribeToAdminNotifications/);
  assert.match(source, /refetchInterval: 120_000/);
  assert.match(source, /refetchIntervalInBackground: false/);
  assert.match(source, /reconcileAfter = Date.now\(\) \+ 30_000/);
  assert.match(source, /stateRefreshPending = true/);
  assert.match(source, /if \(pendingIds.size < 200\) pendingIds.add\(notification.id\)/);
  const realtimeStart = source.indexOf("onNotification: notification => {");
  const realtimeEnd = source.indexOf("    });", realtimeStart);
  assert.ok(realtimeStart >= 0 && realtimeEnd > realtimeStart);
  const realtimeCallbacks = source.slice(realtimeStart, realtimeEnd);
  assert.ok(!realtimeCallbacks.includes('invalidateQueries({ queryKey: ["admin-home", "activity"'), "Realtime must not invalidate Home on each INSERT");
  assert.match(source, /staleTime: 60_000/);
  assert.match(source, /refetchOnWindowFocus: false/);
  assert.match(source, /retry: false/);
});
