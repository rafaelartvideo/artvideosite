import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = file => readFileSync(file, "utf8");
const migration = read("supabase/migrations/20261110164500_fix_return_diagnosis_manager_permissions.sql");

test("o diagnóstico de retorno usa autorização própria e não exige solucionar a OS", async () => {
  const gate = read("src/features/orders/presentation/OrderReturnDiagnosisGate.tsx");
  assert.ok((await transformWithEsbuild(gate, "OrderReturnDiagnosisGate.tsx", { loader: "tsx" })).code);
  assert.match(gate, /classify_service_order_return_v2/);
  assert.match(migration, /app\.classify_service_order_return/);
  assert.match(migration, /v_return_diagnosis/);
  assert.match(migration, /not v_return_diagnosis/);
  assert.match(migration, /old\.return_classification='analysis'/);
  assert.match(migration, /old\.is_solved is not true/);
  assert.match(migration, /new\.return_classification in \('covered','unrelated'\)/);
  assert.match(migration, /has_effective_organization_permission\(old\.organization_id,'orders\.edit'\)/);
  assert.match(migration, /to_jsonb\(new\)-'diagnosis'-'solution'-'return_classification'-'updated_at'/);
});

test("papel Gestor do Sistema herda apenas permissões elegíveis à própria empresa", () => {
  assert.match(migration, /'gestor','gestor do sistema'/);
  assert.match(migration, /permission_belongs_to_organization\(role_row\.organization_id, permission_row\.key\)/);
  assert.match(migration, /organization\.status = 'active'/);
  assert.match(migration, /on conflict \(role_id, permission_id\) do nothing/);
  assert.match(migration, /select private\.provision_gestor_role_permissions\(null,null\)/);
  assert.doesNotMatch(migration, /disable row level security|bypassrls/i);
});

test("recuperação pontual preserva histórico e exige ausência de peças e financeiro", () => {
  assert.match(migration, /so\.os_number='28R1'/);
  assert.match(migration, /not exists \(select 1 from public\.service_order_used_items/);
  assert.match(migration, /not exists \(select 1 from public\.service_order_part_requests/);
  assert.match(migration, /not exists \(select 1 from public\.financial_receipts/);
  assert.match(migration, /not exists \(select 1 from public\.financial_entries/);
  assert.match(migration, /not exists \(select 1 from public\.fiscal_documents/);
  assert.match(migration, /reverted_at=now\(\)/);
  assert.match(migration, /set is_solved=false/);
  assert.doesNotMatch(migration, /delete from public\.service_order_solution_attempts/i);
});
