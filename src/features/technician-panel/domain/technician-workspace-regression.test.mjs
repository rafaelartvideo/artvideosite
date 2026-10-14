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
