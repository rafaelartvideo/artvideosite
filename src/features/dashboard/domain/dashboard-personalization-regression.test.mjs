import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");
const compile = async (path, loader="tsx") =>
  assert.ok((await transformWithEsbuild(read(path),path,{loader})).code);

test("dashboard possui seletor por seção para os sete módulos e todas as distribuições de OS", async () => {
  const widgets=read("src/features/dashboard/domain/dashboard-widgets.ts");
  const tab=read("src/features/dashboard/presentation/TabDashboard.tsx");
  const controls=read("src/features/dashboard/presentation/DashboardWidgetSettings.tsx");
  const panel=read("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  await compile("src/features/dashboard/domain/dashboard-widgets.ts","ts");
  await compile("src/features/dashboard/presentation/TabDashboard.tsx");
  await compile("src/features/dashboard/presentation/DashboardWidgetSettings.tsx");
  await compile("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  for(const section of ["overview","orders","registrations","inventory","agenda","quotes","finance"]){
    assert.match(widgets,new RegExp(section+":"));
    assert.match(tab,new RegExp('widgetSettings\\.restore\\("'+section+'"\\)'));
  }
  for(const key of ["situation","status","opened","service_type","equipment_type","equipment_model","quote_approved","quote_rejected"]){
    assert.match(widgets,new RegExp('id: "'+key+'"'));
  }
  assert.match(controls,/dashboard_widget_preferences/);
  assert.match(controls,/organization_id,user_id,section/);
  assert.match(panel,/onModeChange/);
  for(const mode of ['"pie"','"vertical"','"horizontal"','"line"'])
    assert.match(panel,new RegExp(mode));
});

test("cards e gráficos possuem tamanho fixo inclusive pizza e situação SLA", async () => {
  const ui=read("src/features/dashboard/presentation/DashboardUi.tsx");
  const tab=read("src/features/dashboard/presentation/TabDashboard.tsx");
  const panel=read("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  await compile("src/features/dashboard/presentation/DashboardUi.tsx");
  assert.ok(ui.includes("h-[370px]"));
  assert.match(ui,/fixedHeight/);
  assert.ok(panel.includes("const chartHeight = showToolbar ? 203 : 238;"));
  assert.ok(panel.includes("fixedHeight={chartHeight}"));
  assert.ok(tab.includes("max-w-[1420px]"));
  assert.ok(tab.includes("max-w-[1000px]"));
});

test("agregação protege a empresa, agrupa as decisões e não baixa lista de OS", async () => {
  const rpc=read("supabase/migrations/20261117160000_dashboard_orders_charts_aggregates.sql");
  const prefs=read("supabase/migrations/20261117160500_dashboard_widget_preferences_per_user.sql");
  const repository=read("src/features/dashboard/infrastructure/dashboard.repository.ts");
  await compile("src/features/dashboard/infrastructure/dashboard.repository.ts","ts");
  assert.match(rpc,/SECURITY INVOKER/);
  assert.ok(rpc.includes("private.has_tenant_module_permission"));
  assert.match(rpc,/service_order_quote_proposals/);
  assert.match(rpc,/equipment_models/);
  assert.match(repository,/load_dashboard_orders_charts_v1/);
  assert.match(prefs,/ENABLE ROW LEVEL SECURITY/);
  assert.ok(prefs.includes("user_id=(select auth.uid())"));
});

test("visualização permite ler nomes completos e não agrupa modelos em Outros", async () => {
  const tab = read("src/features/dashboard/presentation/TabDashboard.tsx");
  const panel = read("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  const ui = read("src/features/dashboard/presentation/DashboardUi.tsx");
  await compile("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  assert.ok(!tab.includes("summarizeChartCategories"));
  assert.ok(tab.includes("analytics?.equipment_models||[]"));
  assert.ok(panel.includes("categoryData.slice("));
  assert.ok(panel.includes("Buscar modelo"));
  assert.ok(panel.includes("Ver nomes"));
  assert.ok(panel.includes("showNames"));
  assert.ok(ui.includes("overflow-auto [scrollbar-width:thin]"));
  assert.ok(ui.includes("angle={-38}"));
  assert.ok(ui.includes("centered />"));
});

test("aprovados em verde, reprovados em vermelho e centralização dos painéis", () => {
  const tab = read("src/features/dashboard/presentation/TabDashboard.tsx");
  const panel = read("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  assert.ok(panel.includes('quote_approved: "#059669"'));
  assert.ok(panel.includes('quote_rejected: "#dc2626"'));
  assert.ok(panel.includes("não o valor em reais"));
  assert.ok(panel.includes("CHART_PALETTES.green"));
  assert.ok(panel.includes("CHART_PALETTES.red"));
  assert.ok(tab.includes("justify-items-center"));
  assert.ok(tab.includes("mx-auto"));
});
