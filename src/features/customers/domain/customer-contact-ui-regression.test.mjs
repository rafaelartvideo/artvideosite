import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("formata e valida fixos e celulares brasileiros sem adicionar dígitos", async () => {
  const path = "src/shared/domain/formatters.ts";
  const { code } = await transformWithEsbuild(read(path), path, { loader: "ts" });
  const { formatPhone, isValidBrazilianPhone, isValidBrazilianMobile } = await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
  assert.equal(formatPhone("7933334444"), "(79) 3333-4444");
  assert.equal(formatPhone("79988887777"), "(79) 9 8888-7777");
  assert.equal(isValidBrazilianPhone("7933334444"), true);
  assert.equal(isValidBrazilianPhone("79988887777"), true);
  assert.equal(isValidBrazilianMobile("7933334444"), false);
});

test("campos compartilhados permitem copiar números brasileiros nos dois sentidos sem remascarar", () => {
  const controls = read("src/shared/ui/admin/AdminFormControls.tsx");
  assert.match(controls, /const canCopy = isValidBrazilianPhone\(normalized\)/);
  assert.match(controls, /copy\(formatPhone\(normalized\)\)/);
  assert.match(controls, /copyFromPhone/);
  assert.match(controls, /copyFromWhatsapp/);
  assert.match(controls, /onCopyPhone/);
  assert.match(controls, /onCopyWhatsapp/);
  assert.match(controls, /alreadyCopied/);
  assert.match(controls, /rightAction=\{action\}/);
  assert.match(controls, /rightAction && "pr-12"/);
});

test("validações de cadastro e modal aceitam telefone fixo válido como WhatsApp", () => {
  const customer = read("src/features/customers/domain/customer-form.ts");
  const registration = read("src/features/registrations/domain/registration-form.ts");
  assert.match(customer, /whatsapp && !isValidBrazilianPhone\(whatsapp\)/);
  assert.match(registration, /form\.whatsapp && !isValidBrazilianPhone\(form\.whatsapp\)/);
  assert.doesNotMatch(customer, /whatsapp && !isValidBrazilianMobile/);
  assert.doesNotMatch(registration, /form\.whatsapp && !isValidBrazilianMobile/);
});

test("botão consultar do cadastro rápido não muda de posição quando CPF tem erro", () => {
  const quick = read("src/features/orders/presentation/QuickCustomerModal.tsx");
  assert.match(quick, /<AdminFieldLabel label="CPF" required \/>/);
  assert.match(quick, /grid-cols-\[minmax\(0,1fr\)_auto\] items-start gap-2/);
  assert.doesNotMatch(quick, /grid-cols-\[minmax\(0,1fr\)_auto\] items-end/);
});

test("editores de endereço no modal e cadastro exibem mapa pela mesma função compartilhada", () => {
  const map = read("src/shared/ui/address/AddressMapLink.tsx");
  const quick = read("src/features/orders/presentation/QuickCustomerAddressesEditor.tsx");
  const registration = read("src/features/registrations/presentation/RegistrationAddressesEditor.tsx");
  assert.match(map, /getAddressMapUrl\(address\)/);
  assert.match(map, /target="_blank"/);
  assert.match(quick, /<AddressMapLink address=\{address\} \/>/);
  assert.match(registration, /<AddressMapLink address=\{address\} \/>/);
});


test("edição do link de localização deixa campo, Cancelar e Salvar na mesma linha", () => {
  const registrations = read("src/features/registrations/presentation/RegistrationDetails.tsx");
  const orderCustomer = read("src/features/orders/presentation/OrderCustomerSection.tsx");
  for (const source of [registrations, orderCustomer]) {
    assert.match(source, /className="flex min-w-0 items-center gap-2"/);
    assert.match(source, /<BtnSecondary className="shrink-0"/);
    assert.match(source, /<BtnPrimary className="shrink-0"/);
    assert.match(source, />Cancelar<\/BtnSecondary>/);
    assert.match(source, />Salvar<\/BtnPrimary>/);
  }
  assert.match(registrations, /className="admin-input h-9 min-w-0 flex-1/);
  assert.match(orderCustomer, /className=\{INPUT \+ " h-9 min-w-0 flex-1"\}/);
});


test("OS, cadastros e criação direta distinguem conflitos de WhatsApp de CPF", () => {
  const quick = read("src/features/orders/presentation/QuickCustomerModal.tsx");
  const regular = read("src/features/customers/application/useCreateCustomer.ts");
  const registrations = read("src/features/registrations/infrastructure/registrations.repository.ts");
  const cpf = read("src/features/customers/infrastructure/cpf.gateway.ts");
  const whatsapp = read("src/shared/infrastructure/customer-whatsapp.repository.ts");

  assert.match(quick, /findCustomerWhatsappConflict\(activeOrganizationId, form\.whatsapp, createdCustomer\?\.id \|\| null\)/);
  assert.match(quick, /if \(isDuplicateCustomerWhatsappError\(error\)\)/);
  assert.match(quick, /setFieldError\("whatsapp", quickCustomerErrorMessage/);
  assert.match(regular, /findCustomerWhatsappConflict\(organizationId, whatsapp\)/);
  assert.match(registrations, /findCustomerWhatsappConflict\(input\.organizationId, input\.entity\.whatsapp\)/);
  assert.match(cpf, /\.eq\("organization_id", organizationId\)/);
  assert.match(whatsapp, /p_organization_id: organizationId/);
});
