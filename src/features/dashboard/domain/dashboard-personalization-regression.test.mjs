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
  assert.match(ui,/h-\\[370px\\]/);
  assert.match(ui,/fixedHeight/);
  assert.match(panel,/const height=238/);
  assert.match(panel,/fixedHeight=\\{height\\}/);
  assert.match(tab,/max-w-\\[1420px\\]/);
  assert.match(tab,/max-w-\\[1000px\\]/);
});

test("agregação protege a empresa, agrupa as decisões e não baixa lista de OS", async () => {
  const rpc=read("supabase/migrations/20261117160000_dashboard_orders_charts_aggregates.sql");
  const prefs=read("supabase/migrations/20261117160500_dashboard_widget_preferences_per_user.sql");
  const repository=read("src/features/dashboard/infrastructure/dashboard.repository.ts");
  await compile("src/features/dashboard/infrastructure/dashboard.repository.ts","ts");
  assert.match(rpc,/SECURITY INVOKER/);
  assert.match(rpc,/private\\.has_tenant_module_permission/);
  assert.match(rpc,/service_order_quote_proposals/);
  assert.match(rpc,/equipment_models/);
  assert.match(repository,/load_dashboard_orders_charts_v1/);
  assert.match(prefs,/ENABLE ROW LEVEL SECURITY/);
  assert.match(prefs,/user_id=\\(select auth\\.uid\\(\\)\\)/);
});
