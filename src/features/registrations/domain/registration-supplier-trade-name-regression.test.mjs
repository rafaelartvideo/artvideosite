import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const read = path => readFileSync(path, "utf8");

test("fornecedor PJ pode usar apenas razão social sem nome fantasia", async () => {
  const form = read("src/features/registrations/domain/registration-form.ts");
  const editor = read("src/features/registrations/presentation/RegistrationEditor.tsx");
  assert.ok((await transformWithEsbuild(form,"registration-form.ts",{loader:"ts"})).code);
  assert.ok((await transformWithEsbuild(editor,"RegistrationEditor.tsx",{loader:"tsx"})).code);
  assert.ok(form.includes('form.roles.includes("supplier")'));
  assert.ok(form.includes('!form.trade_name.trim() && !form.legal_name.trim()'));
  assert.ok(form.includes('errors.legal_name = "Informe a razão social quando não houver nome fantasia."'));
  assert.ok(form.includes('form.trade_name.trim() || form.legal_name.trim()'));
  assert.ok(editor.includes('label="Nome fantasia" required={!form.roles.includes("supplier")}'));
  assert.ok(editor.includes('required={form.roles.includes("supplier") && !form.trade_name.trim()}'));
  assert.ok(editor.includes('error={fieldErrors.legal_name}'));
  assert.ok(form.includes('registration.person_type === "PJ" ? registration.trade_name || ""'));
});
