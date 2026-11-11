import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldRefreshFinishedCount } from "./finished-count-coordinator.mjs";

test("total de protocolos finalizados só reconcilia após 30 segundos", () => {
  const cached = { identity: '["orgA","user1"]', count: 1200, refreshedAt: 100_000 };
  assert.equal(shouldRefreshFinishedCount(null, cached.identity, false, 100_001), true);
  assert.equal(shouldRefreshFinishedCount(cached, cached.identity, false, 110_000), false);
  assert.equal(shouldRefreshFinishedCount(cached, cached.identity, false, 129_999), false);
  assert.equal(shouldRefreshFinishedCount(cached, cached.identity, false, 130_000), true);
  assert.equal(shouldRefreshFinishedCount(cached, cached.identity, true, 110_000), true);
  assert.equal(shouldRefreshFinishedCount(cached, cached.identity, false, 90_000), true);
});

test("contagem da SAC não é reutilizada entre usuários ou empresas", () => {
  const cached = { identity: '["orgA","user1"]', count: 1000, refreshedAt: 100_000 };
  assert.equal(shouldRefreshFinishedCount(cached, '["orgA","user2"]', false, 101_000), true);
  assert.equal(shouldRefreshFinishedCount(cached, '["orgB","user1"]', false, 101_000), true);
});

test("atualização explícita consulta total novamente e mantém RLS do servidor", () => {
  const page = readFileSync("src/features/sac-digital/presentation/SacDigitalToolPage.tsx", "utf8");
  const repository = readFileSync("src/features/sac-digital/infrastructure/sac-digital.repository.ts", "utf8");
  assert.match(page, /shouldRefreshFinishedCount\(countSnapshot, countIdentity, fresh\)/);
  assert.match(page, /getSacDigitalFinishedProtocolCount\(activeOrganizationId, user\?\.id \|\| ""\)/);
  assert.match(repository, /singleFlight\(`\$\{organizationId\}:\$\{userId\}:finished-count`/);
  assert.match(repository, /\.eq\("organization_id", organizationId\)/);
  assert.match(repository, /\.eq\("status", "finished"\)/);
});
