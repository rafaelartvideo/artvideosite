import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("notificações administrativas preservam Realtime e evitam requisições repetidas em foco", () => {
  const source = readFileSync("src/features/notifications/application/useAdminNotifications.ts", "utf8");
  assert.match(source, /subscribeToAdminNotifications/);
  assert.match(source, /refetchInterval: 120_000/);
  assert.match(source, /refetchIntervalInBackground: false/);
  assert.match(source, /reconcileAfter = Date.now\(\) \+ 30_000/);
  assert.match(source, /if \(stateRefreshTimer !== null\) return/);
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
