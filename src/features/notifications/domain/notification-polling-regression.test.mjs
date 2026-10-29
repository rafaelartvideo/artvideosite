import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("notificações administrativas preservam Realtime e evitam requisições repetidas em foco", () => {
  const source = readFileSync("src/features/notifications/application/useAdminNotifications.ts", "utf8");
  assert.match(source, /subscribeToAdminNotifications/);
  assert.match(source, /refetchInterval: 60_000/);
  assert.match(source, /staleTime: 60_000/);
  assert.match(source, /refetchOnWindowFocus: false/);
  assert.match(source, /retry: false/);
});
