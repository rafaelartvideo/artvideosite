import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const read = path => readFileSync(new URL("../../../../" + path, import.meta.url), "utf8");
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

test("Skeleton de Pedidos Avulsos só existe na carga inicial sem dados; atualizações não remontam filtros/tabela", async () => {
  const source = read("src/features/customer-requests/presentation/TabCustomerRequests.tsx");
  assert.match(source, /const listQuery = useQuery\(\{/);
  assert.match(source, /placeholderData: \(previousData, previousQuery\) =>/);
  assert.match(source, /previousQuery\?\.queryKey\[2\] === activeOrganizationId/);
  assert.match(source, /\(!activeOrganizationId && authLoading\)/);
  assert.match(source, /listQuery\.isPending && !listQuery\.data/);
  assert.doesNotMatch(source, /setLoading\(true\)|setItems\(result\.items\)|\[loading, setLoading\]/);
  assert.match(source, /initialPageSize\(DEFAULT_ADMIN_PAGE_SIZE_OPTIONS, ADMIN_PAGE_SIZE_STORAGE_KEY, DEFAULT_ADMIN_PAGE_SIZE\)/);
  assert.match(source, /queryClient\.setQueriesData/);
  assert.match(source, /listQuery\.isError && !listQuery\.data/);
  const compiled = await transformWithEsbuild(source, "TabCustomerRequests.tsx", { loader: "tsx" });
  assert.ok(compiled.code.length > 0);
});
