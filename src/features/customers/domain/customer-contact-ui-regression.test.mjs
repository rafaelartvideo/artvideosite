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
