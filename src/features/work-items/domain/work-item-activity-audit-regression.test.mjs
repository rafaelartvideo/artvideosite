import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("historico mostra quem alterou com data e valores anteriores/novos", async () => {
  const dialog = read("src/features/work-items/presentation/WorkItemDialog.tsx");
  const repository = read("src/features/work-items/infrastructure/work-items.repository.ts");
  assert.ok((await transformWithEsbuild(dialog, "WorkItemDialog.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(repository, "work-items.repository.ts", { loader: "ts" })).code);
  assert.match(dialog, /actor_name_snapshot/);
  assert.match(dialog, /activityTitle\(activity\.action\)/);
  assert.match(dialog, /HISTORY_FIELD_LABELS\[change\.field\]/);
  assert.match(dialog, /historyValue\(change\.field, change\.old\)/);
  assert.match(dialog, /historyValue\(change\.field, change\.new\)/);
  assert.match(dialog, /Por <span/);
  assert.match(repository, /actor_user_id,actor_name_snapshot,action,note,changes,created_at/);
});

test("banco captura autor e todas alteracoes sem registrar falso update", () => {
  const sql = read("supabase/migrations/20261117114500_work_item_activity_actor_and_field_changes.sql");
  assert.match(sql, /work_item_activity_actor_snapshot/);
  assert.match(sql, /new\.actor_name_snapshot/);
  assert.match(sql, /'kind','title','description','status','outcome','priority','category'/);
  assert.match(sql, /'starts_at','due_at','reminder_minutes','assigned_employee_ids'/);
  assert.match(sql, /'customer_id','service_order_id'/);
  assert.match(sql, /v_old is distinct from v_new/);
  assert.match(sql, /jsonb_array_length\(v_changes\)>0/);
  assert.match(sql, /private\.work_item_audit_value/);
  assert.doesNotMatch(sql, /'updated_at','completed_at','completed_by'/);
  assert.match(sql, /work_item_reminders/);
  assert.match(sql, /organization_notifications/);
});
