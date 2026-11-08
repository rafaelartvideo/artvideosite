import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("notificações administrativas preservam Realtime e evitam requisições repetidas em foco", () => {
  const source = readFileSync("src/features/notifications/application/useAdminNotifications.ts", "utf8");
  assert.match(source, /subscribeToAdminNotifications/);
  assert.match(source, /refetchInterval: query => query.state.status === "error" \? 120_000 : 60_000/);
  assert.match(source, /reconcileAfter = Date.now\(\) \+ 30_000/);
  assert.match(source, /if \(stateRefreshTimer !== null\) return/);
  assert.match(source, /if \(pendingIds.size < 200\) pendingIds.add\(notification.id\)/);
  const realtimeStart = source.indexOf("onNotification: notification => {");
  const realtimeEnd = source.indexOf("    });", realtimeStart);
  assert.ok(realtimeStart >= 0 && realtimeEnd > realtimeStart);
  const realtimeCallbacks = source.slice(realtimeStart, realtimeEnd);
  assert.doesNotMatch(realtimeCallbacks, /invalidateQueries\\(\\{ queryKey: \\["admin-home", "activity"/);
  assert.match(source, /staleTime: 60_000/);
  assert.match(source, /refetchOnWindowFocus: false/);
  assert.match(source, /retry: false/);
});
