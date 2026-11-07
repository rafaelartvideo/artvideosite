import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("fornecedores do produto exibem botão azul + ao lado da busca e abrem o cadastro rápido", async () => {
  const list = read("src/shared/ui/admin/AdminListSection.tsx");
  const suppliers = read("src/features/inventory/presentation/InventorySuppliersEditor.tsx");
  const variation = read("src/features/products/presentation/VariantSupplierPicker.tsx");
  for (const [name, code] of [
    ["AdminListSection.tsx", list],
    ["InventorySuppliersEditor.tsx", suppliers],
    ["VariantSupplierPicker.tsx", variation],
  ]) assert.ok((await transformWithEsbuild(code, name, { loader: "tsx" })).code);
  assert.ok(list.includes("searchAction?: ReactNode"));
  assert.ok(list.includes("{searchAction}"));
  assert.ok(suppliers.includes("searchAction={canCreateSupplier && !disabled ? <AdminButton"));
  assert.ok(suppliers.includes('variant="primary"'));
  assert.ok(suppliers.includes('ariaLabel="Adicionar fornecedor"'));
  assert.ok(suppliers.includes("<SupplierQuickCreateDialog"));
  assert.ok(variation.includes('ariaLabel="Adicionar fornecedor da variação"'));
  assert.ok(variation.includes("<SupplierQuickCreateDialog"));
  assert.ok(suppliers.includes("onChange(selectedIds.has(supplier.id) ? value : [...value, supplier])"));
  assert.ok(variation.includes("onChange(ids.has(supplier.id) ? value : [...value, supplier])"));
});

test("modal reutiliza formulário completo dos cadastros sem exibir seleção Fornecedor", async () => {
  const editor = read("src/features/registrations/presentation/RegistrationEditor.tsx");
  const quickCreate = read("src/features/registrations/presentation/SupplierQuickCreateDialog.tsx");
  assert.ok((await transformWithEsbuild(editor, "RegistrationEditor.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(quickCreate, "SupplierQuickCreateDialog.tsx", { loader: "tsx" })).code);
  assert.ok(editor.includes('if (supplierQuickCreate) return <AdminDialog'));
  assert.ok(editor.includes("!supplierQuickCreate && <div"), "Os botões de vínculo só são ocultados no fluxo rápido");
  assert.ok(editor.includes("!employeeOnly"), "O seletor PF/PJ continua disponível");
  assert.ok(editor.includes("lookups.lookupCpfName()"));
  assert.ok(editor.includes("lookups.lookupCnpj()"));
  assert.ok(editor.includes("<RegistrationAddressesEditor"));
  assert.ok(quickCreate.includes('roles: ["supplier"]'));
  assert.ok(quickCreate.includes("validateRegistrationFormFields"));
  assert.ok(quickCreate.includes("registrationEntityPayload"));
  assert.ok(quickCreate.includes("saveRegistration"));
  assert.ok(quickCreate.includes("syncRegistrationAddresses"));
  assert.ok(quickCreate.includes("syncRegistrationSupplierItems"));
  assert.ok(quickCreate.includes("getRegistration"));
  assert.ok(quickCreate.includes("onCreated({"));
});
