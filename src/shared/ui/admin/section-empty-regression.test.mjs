import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");

test("Section oferece estado vazio centralizado reutilizável, preservando conteúdo normal",()=>{
 const ui=read("src/shared/ui/admin/AdminLayout.tsx");
 assert.match(ui,/export function AdminSectionEmpty/);
 assert.match(ui,/items-center justify-center/);
 assert.match(ui,/emptyMessage\?: React\.ReactNode/);
 assert.match(ui,/emptyMessage \? <AdminSectionEmpty>\{emptyMessage\}<\/AdminSectionEmpty> : children/);
});
test("mensagens de endereços vazios reutilizam Section no cadastro e nos dois formulários",()=>{
 for(const path of [
  "src/features/registrations/presentation/RegistrationDetails.tsx",
  "src/features/registrations/presentation/RegistrationAddressesEditor.tsx",
  "src/features/orders/presentation/QuickCustomerAddressesEditor.tsx",
 ]) {
  const code=read(path);
  assert.match(code,/emptyMessage=\{/);
  assert.match(code,/Não há endereço cadastrado\./);
  assert.doesNotMatch(code,/<p className="[^"]*">Não há endereço cadastrado\.<\/p>/);
 }
});
test("telas legadas e resumos de OS também usam estado vazio padronizado",()=>{
 const detail=read("src/features/customers/presentation/CustomerDetailsPage.tsx");
 const completion=read("src/features/orders/presentation/OrderCompletionModal.tsx");
 const services=read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
 assert.match(detail,/<AdminSectionEmpty>Nenhum endereço cadastrado\.<\/AdminSectionEmpty>/);
 assert.match(completion,/<AdminSectionEmpty compact>Nenhum endereço cadastrado para este cliente\.<\/AdminSectionEmpty>/);
 assert.match(services,/<AdminSectionEmpty compact>Ainda não informado\.<\/AdminSectionEmpty>/);
});
