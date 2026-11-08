import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";

const read=path=>readFileSync(path,"utf8");

test("Vitrine, listas, checkout, propostas e gestão mantêm TSX válido",async()=>{
  const files=[
    "src/features/sales/presentation/TabSales.tsx",
    "src/features/sales/presentation/SalesOrdersPage.tsx",
    "src/features/sales/presentation/SalesProposalsPage.tsx",
    "src/features/sales/presentation/SalesCheckoutDialog.tsx",
    "src/features/sales/presentation/SalesProposalEditorDialog.tsx",
    "src/features/sales/presentation/SalesManagementPage.tsx",
  ];
  for(const file of files){
    const code=read(file);
    assert.ok((await transformWithEsbuild(code,file,{loader:"tsx"})).code.length>250,file);
  }
});

test("Carrinho e favoritos são isolados por empresa e usuário, inclusive durante troca de empresa",()=>{
  const tab=read("src/features/sales/presentation/TabSales.tsx");
  assert.match(tab,/union-sales-cart:v1:/);
  assert.match(tab,/union-sales-favorites:v1:/);
  assert.match(tab,/cartState\.key===cartStorageKey/);
  assert.match(tab,/if \(!cartStorageKey \|\| cartState\.key!==cartStorageKey\) return/);
  assert.match(tab,/favoritesState\.key===favoritesStorageKey/);
  assert.match(tab,/selected = selection\?\.organizationId===organizationId/);
  assert.match(tab,/checkoutFor===organizationId/);
  assert.match(tab,/proposalFor===organizationId/);
});

test("No celular, carrinho funciona em modal próprio e tabelas largas viram listas",()=>{
  const tab=read("src/features/sales/presentation/TabSales.tsx");
  assert.match(tab,/mobileCartOpen&&<AdminDialog/);
  assert.match(tab,/setMobileCartOpen\(true\)/);
  assert.match(tab,/setCheckoutIntent\(true\)/);
  assert.match(tab,/setProposalIntent\(true\)/);
  const orders=read("src/features/sales/presentation/SalesOrdersPage.tsx");
  const proposals=read("src/features/sales/presentation/SalesProposalsPage.tsx");
  assert.match(orders,/divide-y divide-border md:hidden/);
  assert.match(proposals,/divide-y divide-border md:hidden/);
  assert.match(orders,/hidden overflow-x-auto md:block/);
  assert.match(proposals,/hidden overflow-x-auto md:block/);
});

test("Busca uniforme e criação direta de proposta preservam ação em uma tela",()=>{
  const orders=read("src/features/sales/presentation/SalesOrdersPage.tsx");
  const proposals=read("src/features/sales/presentation/SalesProposalsPage.tsx");
  const tab=read("src/features/sales/presentation/TabSales.tsx");
  for(const code of [orders,proposals,tab]){
    assert.match(code,/AdminSearchPanel/);
    assert.match(code,/AdminSearchClearButton/);
  }
  assert.match(proposals,/setCreating\(true\)/);
  assert.match(proposals,/creating&&<SalesProposalEditorDialog/);
  assert.match(tab,/<SalesProposalsPage \/>/);
});

test("Checkout e gestão apresentam informações importantes sem rolagem horizontal no celular",()=>{
  const checkout=read("src/features/sales/presentation/SalesCheckoutDialog.tsx");
  assert.match(checkout,/Total da venda/);
  assert.match(checkout,/Registre apenas pagamentos realmente recebidos/);
  assert.match(checkout,/w-full justify-center sm:w-auto/);
  const editor=read("src/features/sales/presentation/SalesProposalEditorDialog.tsx");
  assert.match(editor,/grid-cols-\[minmax\(0,1fr\)_96px_100px_36px\]/);
  const management=read("src/features/sales/presentation/SalesManagementPage.tsx");
  assert.match(management,/divide-y divide-border lg:hidden/);
  assert.match(management,/hidden overflow-x-auto lg:block/);
});
