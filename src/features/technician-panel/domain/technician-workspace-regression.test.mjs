import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const panel = read("src/features/technician-panel/presentation/TechnicianPanel.tsx");
const rpc = read("supabase/migrations/20261014180500_technician_order_address_problem_scope.sql");

test("painel técnico utiliza padrão de página, seção e toolbar do CRM", () => {
  assert.match(panel, /<PageHeader/);
  assert.match(panel, /<Section title="Dados da OS"/);
  assert.match(panel, /<Section title="Serviços atribuídos nesta OS"/);
  assert.match(panel, /<AdminStickyToolbar/);
  assert.match(panel, /<BtnPrimary/);
  assert.match(panel, /<BtnSecondary/);
  assert.match(panel, /<FTextarea/);
});

test("painel abre uma OS existente sem acesso direto à OS comercial", () => {
  assert.match(panel, /useMatch\("\/admin\/technician-panel\/os\/:orderId"\)/);
  assert.match(panel, /service_order_id === routeOrderId/);
  assert.match(panel, /orderServices\.find\(/);
  assert.doesNotMatch(panel, /\.from\("service_orders"\)/);
  assert.doesNotMatch(panel, /unit_price|final_total|discount_amount/);
});

test("imagem do serviço oferece câmera e seleção separadas", () => {
  assert.match(panel, />Abrir câmera<\/BtnSecondary>/);
  assert.match(panel, />Selecionar imagem<\/BtnSecondary>/);
  assert.match(panel, /capture="environment"/);
  assert.match(panel, /multiple className="sr-only"/);
  assert.match(panel, /uploadTechnicianPhoto\(/);
  assert.match(panel, /onChange=\{event => void onUpload\(event\)\}/);
});

test("a RPC da OS técnica protege endereço/problema e filtra serviços por atribuição", () => {
  assert.match(rpc, /technician_panel\.data\.address/);
  assert.match(rpc, /technician_panel\.data\.problem/);
  assert.match(rpc, /private\.has_effective_organization_permission/);
  assert.match(rpc, /service_order_item_task_assignees/);
  assert.match(rpc, /employee\.profile_id=v_user/);
  assert.doesNotMatch(rpc, /'unit_price'|'final_total'|'discount_amount'/);
});


const secureMigration = read("supabase/migrations/20261014190000_technician_order_secure_details_actions.sql");
const regularOrder = read("src/features/orders/presentation/OrderDetailsPage.tsx");
const sharedTabs = read("src/features/orders/presentation/OrderDetailSectionTabs.tsx");
const repository = read("src/features/technician-panel/infrastructure/technician-tasks.repository.ts");

test("OS técnica e OS regular reutilizam o mesmo componente de abas", () => {
  assert.match(panel, /<OrderDetailSectionTabs/);
  assert.match(regularOrder, /<OrderDetailSectionTabs/);
  assert.match(sharedTabs, /Detalhes da OS/);
  assert.match(sharedTabs, /Produtos e Serviços/);
});

test("permissões específicas controlam situação e diagnóstico na interface e na RPC", () => {
  assert.match(panel, /orderDetails\?\.can_change_situation/);
  assert.match(panel, /orderDetails\.can_edit_diagnosis/);
  assert.match(panel, /getMyTechnicianOrderDetails\(routeOrderId\)/);
  assert.match(panel, /changeMyTechnicianOrderSituation\(routeOrderId, nextId\)/);
  assert.match(panel, /updateMyTechnicianOrderDiagnosis\(routeOrderId, diagnosisDraft\)/);
  assert.match(repository, /get_my_technician_order_details_v1/);
  assert.match(repository, /change_my_technician_order_situation_v1/);
  assert.match(repository, /update_my_technician_order_diagnosis_v1/);
  assert.match(secureMigration, /private\.can_access_technician_order_v1/);
  assert.match(secureMigration, /service_order_item_task_assignees/);
  assert.match(secureMigration, /employee\.profile_id=\(select auth\.uid\(\)\)/);
  assert.match(secureMigration, /completed_at is not null or v_order\.cancelled_at is not null/);
  assert.match(secureMigration, /service_type_situations/);
});

test("dados comerciais não são expostos nas novas consultas do técnico", () => {
  const readFunction = secureMigration.split("create or replace function public.get_my_technician_order_details_v1")[1]
    .split("create or replace function private.guard_service_order_sensitive_update")[0];
  assert.doesNotMatch(readFunction, /'unit_price'|'final_total'|'service_price'|'subtotal'|'purchase_price'/);
  assert.match(readFunction, /technician_panel\.data\.internal_notes/);
  assert.match(readFunction, /technician_panel\.data\.order_items/);
  assert.match(readFunction, /technician_panel\.data\.situation/);
  assert.match(readFunction, /'available_situations'/);
  assert.match(readFunction, /jsonb_build_object/);
});

test("nenhuma permissão nova concede orders.edit ou visão geral de OS", () => {
  assert.doesNotMatch(secureMigration, /'orders\.edit'|'orders\.view_all'/);
  assert.match(secureMigration, /revoke all on function public\.get_my_technician_order_details_v1/);
  assert.match(secureMigration, /from public,anon,authenticated/);
  assert.match(secureMigration, /grant execute on function public\.get_my_technician_order_details_v1\(uuid\) to authenticated/);
});
