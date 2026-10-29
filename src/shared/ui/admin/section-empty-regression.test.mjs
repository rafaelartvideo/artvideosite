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


test("páginas roteadas do CRM usam transição única sem deslize ou CSS injetado a cada abertura",()=>{
 const ui=read("src/shared/ui/admin/AdminLayout.tsx");
 const css=read("src/styles/index.css");
 const admin=read("src/app/Admin.tsx");
 const editor=read("src/features/orders/presentation/OrderEditorPage.tsx");
 assert.match(ui,/pointer-events-none animate-out fade-out duration-150 ease-out/);
 assert.match(ui,/animate-in fade-in duration-150 ease-out/);
 assert.doesNotMatch(ui,/slide-in-from-right-4|slide-out-to-right-4/);
 assert.doesNotMatch(ui,/<style>\{\x60@media/);
 assert.match(css,/\.admin-page-mobile-safe \.sticky\.bottom-0/);
 assert.match(css,/\.admin-page-mobile-safe:has\(\.sticky\.bottom-0\) > div/);
 assert.match(admin,/useLayoutEffect\(\(\) => \{\s*const root = contentRef\.current/);
 assert.doesNotMatch(admin,/root\.scrollTop = 0/);
 assert.match(admin,/root\.scrollTop = ordersListScrollRef\.current/);
 assert.match(editor,/<AdminPage open onClose=\{closePage\}/);
});

test("Esc fecha o modal prioritário sem fazer a página do CRM desaparecer",()=>{
 const ui=read("src/shared/ui/admin/AdminLayout.tsx");
 assert.match(ui,/event\.defaultPrevented/);
 assert.match(ui,/\[role="dialog"\]\[data-state="open"\]/);
 assert.match(ui,/requestClose\(\)/);
});
