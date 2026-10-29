import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");
const addressSource = read("src/lib/address.ts");
const compiled = await transformWithEsbuild(addressSource, "src/lib/address.ts", { loader: "ts", format: "esm" });
const { validateCustomerAddress } = await import("data:text/javascript;base64," + Buffer.from(compiled.code).toString("base64"));

test("endereço vazio exige CEP, rua, número, bairro, cidade e UF", () => {
  assert.deepEqual(Object.keys(validateCustomerAddress({})).sort(), [
    "city", "neighborhood", "number", "state", "street", "zip_code",
  ]);
});

test("complemento e link de localização continuam opcionais", () => {
  const address = {zip_code:"49000-000",street:"Rua Teste",number:"25",
    neighborhood:"Centro",city:"Aracaju",state:"SE",complement:"",shared_map_url:""};
  assert.deepEqual(validateCustomerAddress(address), {});
});

test("CEP e UF inválidos são rejeitados", () => {
  const address = {zip_code:"490",street:"Rua Teste",number:"25",
    neighborhood:"Centro",city:"Aracaju",state:"S"};
  const errors = validateCustomerAddress(address);
  assert.ok(errors.zip_code);
  assert.ok(errors.state);
});

test("telefone é requerido apenas na criação de clientes", () => {
  const customer = read("src/features/customers/domain/customer-form.ts");
  const registration = read("src/features/registrations/domain/registration-form.ts");
  const create = read("src/features/customers/application/useCreateCustomer.ts");
  const quick = read("src/features/orders/presentation/QuickCustomerModal.tsx");
  const general = read("src/features/registrations/presentation/TabRegistrations.tsx");
  assert.match(customer, /requirePhone && !phone/);
  assert.match(registration, /requireCustomerPhone && form\.roles\.includes\("customer"\)/);
  assert.match(create, /validateCustomerFormFields\(form, \{ requirePhone: true \}\)/);
  assert.match(quick, /validateCustomerFormFields\(form, \{ requirePhone: true \}\)/);
  assert.match(general, /validateRegistrationFormFields\(form, \{ requireCustomerPhone: creating \}\)/);
});

test("endereço obrigatório bloqueia gravação incompleta nos três formulários", () => {
  const create = read("src/features/customers/application/useCreateCustomer.ts");
  const quick = read("src/features/orders/presentation/QuickCustomerModal.tsx");
  const general = read("src/features/registrations/presentation/TabRegistrations.tsx");
  assert.ok(create.includes("validateCustomerAddress(address)"));
  assert.ok(quick.includes("addresses.every(address => Object.keys(validateCustomerAddress(address)).length === 0)"));
  assert.ok(general.includes("validateCustomerAddress(address)"));
});

test("botões dentro dos inputs copiam telefone e WhatsApp nos dois sentidos", () => {
  const inputs = read("src/shared/ui/admin/AdminFormControls.tsx");
  const quick = read("src/features/orders/presentation/QuickCustomerModal.tsx");
  assert.ok(inputs.includes("onCopyWhatsapp"));
  assert.ok(inputs.includes("copyFromWhatsapp"));
  assert.ok(inputs.includes("onCopyPhone"));
  assert.ok(quick.includes("copyFromWhatsapp={form.whatsapp}"));
  assert.ok(quick.includes("copyFromPhone={form.phone}"));
});


test("abrir Cadastros reaproveita a linha da tabela sem tela de carregamento nem animação", () => {
  const tab = read("src/features/registrations/presentation/TabRegistrations.tsx");
  const details = read("src/features/registrations/presentation/RegistrationDetails.tsx");
  assert.match(tab, /placeholderData: \(\) => registrationsQuery\.data\?\.items\.find/);
  assert.match(tab, /item\.id === routeRegistrationId && item\.organization_id === activeOrganizationId/);
  assert.match(tab, /preview=\{detailPreview\}/);
  assert.match(details, /smoothMotion=\{false\}/);
  assert.match(details, /\{!preview && <Section title="Endereços"/);
  assert.match(details, /canEdit && !preview && <BtnPrimary onClick=\{onEdit\}>Editar/);
});

test("CRM não aplica scroll para o topo automaticamente ao navegar", () => {
  const app = read("src/app/App.tsx");
  const admin = read("src/app/Admin.tsx");
  const pages = read("src/shared/ui/admin/AdminLayout.tsx");
  assert.match(app, /if \(!pathname\.startsWith\("\/admin"\)\)/);
  assert.doesNotMatch(admin, /root\.scrollTop = 0/);
  assert.match(admin, /root\.scrollTop = ordersListScrollRef\.current/);
  assert.match(pages, /smoothMotion = false/);
});

test("lista de Cadastros mantém cache e volta à posição anterior", () => {
  const tab = read("src/features/registrations/presentation/TabRegistrations.tsx");
  const admin = read("src/app/Admin.tsx");
  assert.match(tab, /registrationsQuery\.isPending && !registrationsQuery\.data/);
  assert.match(admin, /customersListScrollRef\.current = contentRef\.current\?\.scrollTop/);
  assert.match(admin, /root\.scrollTop = customersListScrollRef\.current/);
});
