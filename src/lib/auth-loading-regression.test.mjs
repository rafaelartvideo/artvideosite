import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("login nunca aguarda indefinidamente a consulta de permissões", () => {
  const auth = readFileSync("src/lib/auth.tsx", "utf8");
  assert.match(auth, /supabase\.rpc\("load_auth_access_v1",[\s\S]*?\.abortSignal\(AbortSignal\.timeout\(18_000\)\)/);
  assert.match(auth, /catch \(error\) \{[\s\S]*?setAccessError\("O Supabase não respondeu ao carregar seu acesso\. Tente novamente\."\);[\s\S]*?setLoading\(false\)/);
  const app = readFileSync("src/app/App.tsx", "utf8");
  assert.match(app, /if \(accessError\)/);
  assert.match(app, /onRetry=\{refreshAccess\}/);
});

test("validação de horários preserva bloqueio de acesso, mas com timeout", () => {
  const hours = readFileSync("src/features/registrations/infrastructure/employee-access-hours.repository.ts", "utf8");
  assert.match(hours, /check_my_employee_crm_access_hours_v2/);
  assert.match(hours, /\.abortSignal\(AbortSignal\.timeout\(12_000\)\)/);
});
