import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read=path=>readFileSync(path,"utf8");

test("novos módulos comerciais possuem telas TSX válidas e navegação própria",async()=>{
  const files=[
    "src/features/sales/presentation/SalesManagementPage.tsx",
    "src/features/sales/presentation/SalesCommissionsSection.tsx",
    "src/features/sales/presentation/SalesReturnsDialog.tsx",
    "src/features/sales/presentation/SalesDeliveryDialog.tsx",
    "src/features/sales/presentation/SalesExchangeDialog.tsx",
    "src/features/sales/presentation/SalesQuickCustomerDialog.tsx",
    "src/features/sales/presentation/SalesPaymentTermsDialog.tsx",
    "src/features/sales/presentation/PublicSalesProposalApprovalPage.tsx",
  ];
  for(const file of files){
    const code=read(file);
    const transformed=await transformWithEsbuild(code,file,{loader:"tsx"});
    assert.ok(transformed.code.length>300,"TSX inválido/vazio: "+file);
  }
  const sales=read("src/features/sales/presentation/TabSales.tsx");
  assert.match(sales,/SalesManagementPage/);
  assert.match(sales,/sales\/management/);
  assert.match(sales,/SalesProposalsPage/);
  assert.match(sales,/SalesOrdersPage/);
  const detail=read("src/features/sales/presentation/SalesOrderDetailDialog.tsx");
  assert.match(detail,/SalesReturnsDialog/);
  assert.match(detail,/SalesDeliveryDialog/);
  assert.match(detail,/return_credit_amount/);
});

test("reserva não altera estoque físico até conversão e também protege PDV",()=>{
  const base=read("supabase/migrations/20261108203000_sales_operations_foundation.sql");
  const api=read("supabase/migrations/20261108204500_sales_reservations_delivery_rpcs.sql");
  const conversion=read("supabase/migrations/20261108205000_sales_reserved_conversion_and_delivery_guard.sql");
  const search=read("supabase/migrations/20261108223000_sales_reserved_stock_available_search.sql");
  assert.match(base,/guard_sales_reserved_inventory_v1/);
  assert.match(base,/new.quantity < v_reserved/);
  assert.match(api,/reserve_sales_proposal_v1/);
  assert.match(api,/for update/);
  assert.doesNotMatch(api,/update public\.inventory_items set quantity/);
  assert.match(conversion,/status='converted'/);
  assert.match(conversion,/public\.create_sales_order_v2/);
  assert.match(search,/sales_stock_reservations/);
  assert.match(search,/search_pdv_products_v1/);
  assert.match(search,/search_sales_products_v1/);
});

test("troca e devolução são auditáveis; reembolso não inventa dinheiro",()=>{
  const sql=read("supabase/migrations/20261108210000_sales_return_workflow.sql");
  assert.match(sql,/request_sales_return_v1/);
  assert.match(sql,/review_sales_return_v1/);
  assert.match(sql,/receive_sales_return_v1/);
  assert.match(sql,/v_previous\+v_qty>v_item.quantity/);
  assert.match(sql,/movement_origin/);
  assert.match(sql,/awaiting_finance/);
  assert.match(sql,/refund_payable_id/);
  assert.doesNotMatch(sql,/insert into public\.financial_movements/);
  const reconciliation=read("supabase/migrations/20261108225000_sales_return_receivable_credit_reconciliation.sql");
  assert.match(reconciliation,/private\.can_access_finance\(p_organization_id,'finance\.receivables\.edit'\)/);
  assert.match(reconciliation,/financial_installments/);
  assert.match(reconciliation,/financial_allocations/);
  assert.match(reconciliation,/finance_reconciled_at/);
  assert.match(reconciliation,/refund_payable_id/);
  assert.doesNotMatch(reconciliation,/insert into public\.financial_settlements/);
  assert.doesNotMatch(reconciliation,/insert into public\.financial_movements/);
  const list=read("supabase/migrations/20261108225500_sales_order_net_due_after_returns.sql");
  assert.match(list,/net_total_amount/);
  assert.match(list,/return_credit_amount/);
  const ui=read("src/features/sales/presentation/SalesReturnsDialog.tsx");
  assert.match(ui,/Conciliar crédito no Financeiro/);
  assert.match(ui,/refund_payable_id/);
});

test("entrega exige PIN ou comprovante e imagem passa pelo compressor",()=>{
  const sql=read("supabase/migrations/20261108204500_sales_reservations_delivery_rpcs.sql");
  assert.match(sql,/extensions\.crypt/);
  assert.match(sql,/pickup_code_hash/);
  assert.match(sql,/complete_sales_order_delivery_v1/);
  assert.match(sql,/proof_media_id/);
  const ui=read("src/features/sales/presentation/SalesDeliveryDialog.tsx");
  assert.match(ui,/uploadMediaFile\("service-images"/);
  assert.match(ui,/Confirmar recebimento/);
  assert.match(ui,/confirm/);
});

test("aprovação do cliente por link expira, limita tentativas e não dá acesso a dados internos",()=>{
  const sql=read("supabase/migrations/20261108220000_sales_proposal_public_approval.sql");
  assert.match(sql,/token_hash/);
  assert.match(sql,/extensions\.gen_random_bytes\(32\)/);
  assert.match(sql,/expires_at/);
  assert.match(sql,/used_at/);
  assert.match(sql,/revoke_proposal_links_on_status_v1/);
  const guard=read("supabase/migrations/20261108230000_sales_approval_link_attempt_limit.sql");
  assert.match(guard,/failed_identity_attempts/);
  assert.match(guard,/verification_failed/);
  assert.match(guard,/status','locked/);
  assert.doesNotMatch(sql,/service_role|send_whatsapp_message|artvideo_store_orders/);
  const ui=read("src/features/sales/presentation/PublicSalesProposalApprovalPage.tsx");
  assert.match(ui,/value.status!=="approved"/);
});

test("gestão comercial e comissões respeitam permissão de margem e geram contas a pagar somente após aprovação",()=>{
  const base=read("supabase/migrations/20261108214000_sales_management_metrics_and_goals.sql");
  assert.match(base,/sales\.reports\.view/);
  assert.match(base,/sales\.reports\.margin\.view/);
  assert.match(base,/save_sales_seller_goal_v1/);
  assert.match(base,/get_sales_management_v1/);
  const commissions=read("supabase/migrations/20261108224000_sales_commission_approvals_finance.sql");
  assert.match(commissions,/p_month >= date_trunc\('month',current_date\)/);
  assert.match(commissions,/insert into public\.financial_entries/);
  assert.match(commissions,/already_approved/);
  assert.doesNotMatch(commissions,/insert into public\.financial_movements/);
});

test("troca equivalente baixa substitutos sem criar segunda venda nem recebimento",()=>{
  const sql=read("supabase/migrations/20261108232000_sales_exchange_inventory_fulfillment.sql");
  assert.match(sql,/issue_sales_exchange_v1/);
  assert.match(sql,/v_return\.request_type<>'exchange'/);
  assert.match(sql,/v_total-v_return\.gross_credit_amount/);
  assert.match(sql,/status='closed'/);
  assert.match(sql,/insert into public\.inventory_movements/);
  assert.match(sql,/update public\.inventory_items set quantity=quantity-v_base/);
  assert.match(sql,/exchange_issued/);
  assert.doesNotMatch(sql,/insert into public\.financial_settlements/);
  assert.doesNotMatch(sql,/insert into public\.sales_orders/);
  const returns=read("src/features/sales/presentation/SalesReturnsDialog.tsx");
  assert.match(returns,/SalesExchangeDialog/);
  assert.match(returns,/entry\.exchange_items/);
  assert.doesNotMatch(returns,/<option value="store_credit">/);
  const guard=read("supabase/migrations/20261108233000_sales_return_credit_deferred_until_ledger.sql");
  assert.match(guard,/p_request_type not in \('refund','exchange'\)/);
});

test("troca equivalente preserva receita, comissões e captura custo de substituição",()=>{
  const exchange=read("supabase/migrations/20261108233500_sales_exchange_unit_cost_normalization.sql");
  assert.match(exchange,/unit_cost_snapshot/);
  assert.match(exchange,/v_stock\.average_cost/);
  assert.match(exchange,/then 'cx' else 'un' end,v_qty,v_factor/);
  const metrics=read("supabase/migrations/20261108234000_sales_margin_returns_exchanges_accurate.sql");
  assert.match(metrics,/sales_order_exchange_items/);
  assert.match(metrics,/sr\.disposition='restock'/);
  assert.match(metrics,/r\.request_type='refund'/);
  assert.match(metrics,/invoiced_amount-paid_amount/);
  const commissions=read("supabase/migrations/20261108234500_sales_commission_refund_only_adjustments.sql");
  assert.match(commissions,/r\.request_type='refund'/);
});
