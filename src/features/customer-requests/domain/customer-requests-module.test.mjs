import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../../../" + path, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261015193000_customer_requests_independent_module.sql");

test("Pedidos Avulsos tem modulo comercial independente", () => {
  const navigation = read("src/features/admin-shell/navigation-config.ts");
  const partners = read("src/features/partner-companies/presentation/PartnerCompanyPermissionsSection.tsx");
  assert.match(navigation, /customerRequests: "customer_requests"/);
  assert.match(navigation, /customerRequests: "customer_requests\.view"/);
  assert.match(partners, /key: "customer_requests"[\s\S]*moduleKeys: \["customer_requests"\]/);
  assert.match(migration, /insert into public\.system_modules\(key,name,description,category,sort_order,is_active\)/);
  assert.match(migration, /when p_key like 'customer_requests\.%'/);
});
test("Modulo desligado impede leitura/escrita mesmo com permissao legada", () => {
  const repository = read("src/features/customer-requests/presentation/TabCustomerRequests.tsx");
  assert.match(repository, /hasPermission\("customer_requests\.create"\)/);
  assert.match(repository, /hasPermission\("customer_requests\.update"\)/);
  assert.match(migration, /private\.has_tenant_module_permission\(organization_id,'customer_requests','customer_requests\.view'\)/);
  assert.match(migration, /private\.has_tenant_module_permission\(organization_id,'customer_requests','customer_requests\.create'\)/);
  assert.match(migration, /private\.has_tenant_module_permission\(organization_id,'customer_requests','customer_requests\.update'\)/);
  assert.match(migration, /on conflict\(organization_id,module_key\) do nothing;/);
});
test("Cadastro rapido de clientes autorizado pelo modulo especifico", () => {
 const dialog = read("src/features/orders/presentation/QuickCustomerModal.tsx");
 assert.match(dialog,/allowCustomerRequests = false/);
 assert.match(dialog,/hasPermission\("customer_requests\.create"\)/);
 assert.match(migration,/create policy customers_customer_requests_create/);
 assert.match(migration,/create policy customer_addresses_customer_requests_create/);
});
