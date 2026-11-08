import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read=path=>readFileSync(path,"utf8");

test("Vendas expõe Vitrine, Propostas e Pedidos sem usar checkout PDV",async()=>{
  const tab=read("src/features/sales/presentation/TabSales.tsx");
  const list=read("src/features/sales/presentation/SalesProposalsPage.tsx");
  const editor=read("src/features/sales/presentation/SalesProposalEditorDialog.tsx");
  const details=read("src/features/sales/presentation/SalesProposalDetailDialog.tsx");
  for(const [path,src] of [
    ["src/features/sales/presentation/TabSales.tsx",tab],
    ["src/features/sales/presentation/SalesProposalsPage.tsx",list],
    ["src/features/sales/presentation/SalesProposalEditorDialog.tsx",editor],
    ["src/features/sales/presentation/SalesProposalDetailDialog.tsx",details],
  ]){
    assert.ok((await transformWithEsbuild(src,path,{loader:"tsx"})).code.length>500,path);
  }
  assert.match(tab,/\/admin\/sales\/proposals/);
  assert.match(tab,/<SalesProposalsPage/);
  assert.match(tab,/<SalesProposalEditorDialog/);
  assert.match(tab,/Criar proposta/);
  assert.match(list,/listSalesProposals\(org/);
  assert.match(list,/<SalesProposalDetailDialog/);
  assert.match(list,/<SalesCheckoutDialog/);
  assert.match(editor,/saveSalesProposal\(organizationId/);
  assert.match(editor,/validUntil/);
  assert.match(editor,/Adicionar produto por nome/);
  assert.match(details,/Registrar aprovação/);
  assert.match(details,/Converter em pedido/);
  assert.doesNotMatch(list,/finalizePdvSale|PdvSaleWorkspace/);
});

test("proposta não altera estoque nem financeiro antes da conversão",()=>{
  const sql=read("supabase/migrations/20261108190000_union_sales_proposals_core.sql");
  for(const phrase of [
    "public.sales_proposals","public.sales_proposal_items","public.sales_proposal_events",
    "enable row level security","revoke all on public.sales_proposals",
    "private.has_tenant_module_permission(p_organization_id,'sales','sales.proposals.manage')",
    "private.has_tenant_module_permission(p_organization_id,'sales','sales.view')",
    "public.save_sales_proposal_v1","public.change_sales_proposal_status_v1",
    "'sales.proposals.approve'","idempotency_key","pg_advisory_xact_lock",
  ])assert.ok(sql.includes(phrase),phrase);
  assert.doesNotMatch(sql,/insert into public\.inventory_movements|update public\.inventory_items|insert into public\.financial_entries/);
});

test("conversão é atômica, somente aprovada e recusa preço alterado",()=>{
  const sql=read("supabase/migrations/20261108192000_sales_proposal_conversion.sql");
  assert.match(sql,/for update/);
  assert.match(sql,/status<>'approved'/);
  assert.match(sql,/valid_until<current_date/);
  assert.match(sql,/round\(v_product\.price,2\)<>v_item\.unit_price/);
  assert.match(sql,/public\.create_sales_order_v2\(p_organization_id,p_idempotency_key,v_checkout\)/);
  assert.match(sql,/coalesce\(\(v_result->>'idempotent_replay'\)::boolean,false\)/);
  assert.match(sql,/converted_order_id=\(v_result->>'id'\)::uuid/);
  assert.doesNotMatch(sql,/insert into public\.inventory_movements|insert into public\.financial_entries/);
  const checkout=read("src/features/sales/presentation/SalesCheckoutDialog.tsx");
  assert.match(checkout,/convertSalesProposal\(organizationId,proposal\.id/);
  assert.match(checkout,/proposal\?\.customer/);
  assert.match(checkout,/Boolean\(proposal\)/);
});

test("PDF usa snapshot salvo, dados da empresa e nomes com espaços",async()=>{
  const path="src/features/sales/application/sales-proposal-pdf.ts";
  const content=read(path);
  assert.ok((await transformWithEsbuild(content,path,{loader:"ts"})).code.length>200);
  assert.match(content,/getCompanyPrintContext/);
  assert.match(content,/proposal\.items/);
  assert.match(content,/proposal\.discount_amount/);
  assert.match(content,/proposal\.total_amount/);
  assert.match(content,/Proposta Comercial /);
  assert.match(content,/\.pdf/);
  assert.match(content,/html2pdf\.js/);
  assert.match(content,/const esc =/);
});

test("validades vencidas admitem reabertura autorizada sem modificar uma venda",()=>{
  const sql=read("supabase/migrations/20261108193000_sales_proposal_expired_renegotiation.sql");
  assert.match(sql,/v_p\.status in \('sent','approved'\) and v_p\.valid_until<current_date and p_next_status='draft'/);
  assert.doesNotMatch(sql,/update public\.sales_orders/);
});
