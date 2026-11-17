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
  assert.ok(ui.includes("h-[580px]"));
  assert.match(ui,/fixedHeight/);
  assert.ok(panel.includes("const CHART_HEIGHT = 438;"));
  assert.ok(panel.includes("fixedHeight={CHART_HEIGHT}"));
  assert.ok(tab.includes("lg:grid-cols-2"));
  assert.ok(!tab.includes("2xl:grid-cols-3"));
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
  assert.ok(panel.includes("data.slice(0, MAX_CATEGORIES)"));
  assert.ok(!panel.includes("Buscar modelo"));
  assert.ok(!panel.includes("Ver nomes"));
  assert.ok(!panel.includes("PAGE_SIZE"));
  assert.ok(!ui.includes("overflow-auto [scrollbar-width:thin]"));
  assert.ok(ui.includes("angle={-38}"));
  assert.ok(ui.includes("centered />"));
});

test("aprovados em verde, reprovados em vermelho e centralização dos painéis", () => {
  const tab = read("src/features/dashboard/presentation/TabDashboard.tsx");
  const panel = read("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  assert.ok(panel.includes('quote_approved: "#059669"'));
  assert.ok(panel.includes('quote_rejected: "#dc2626"'));
  assert.ok(panel.includes("Verde: quantidade de orçamentos aprovados."));
  assert.ok(panel.includes("CHART_PALETTES.green"));
  assert.ok(panel.includes("CHART_PALETTES.red"));
  assert.ok(tab.includes("grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2"));
  assert.ok(tab.includes("mx-auto"));
});

test("gráficos de orçamentos omitem datas sem ocorrências, mantendo total e período", async()=>{
  const panel=read("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  const tab=read("src/features/dashboard/presentation/TabDashboard.tsx");
  await compile("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  assert.match(panel,/chartKey === "quote_approved" \|\| chartKey === "quote_rejected"/);
  assert.match(panel,/data\.filter\(point => Number\(point\.value\) > 0\)/);
  assert.match(panel,/Exibe somente datas com reprovações/);
  assert.match(tab,/Reprovações atuais no período/);
  assert.match(tab,/chartTrend\(analytics\?\.quote_rejected\|\|\[\],periodDays\)/);
});

test("gráfico temporal utiliza o valor de cada dia real, sem agrupar datas distintas",async()=>{
  const dashboard=read("src/features/dashboard/presentation/TabDashboard.tsx");
  const begin=dashboard.indexOf("function chartTrend(");
  const end=dashboard.indexOf("\nfunction buildTrend<",begin);
  assert.ok(begin>=0&&end>begin,"helper chartTrend encontrado");
  const helper=dashboard.slice(begin,end).replace("function chartTrend(","export function chartTrend(");
  const compiled=(await transformWithEsbuild(helper,"chartTrend.ts",{loader:"ts"})).code;
  const {chartTrend}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
  const result=chartTrend([
    {name:"2026-11-08",value:0},
    {name:"2026-11-09",value:31},
    {name:"2026-11-10",value:37},
    {name:"2026-11-11",value:0},
  ],30);
  assert.deepEqual(result,[
    {name:"09/11",value:31},
    {name:"10/11",value:37},
  ]);
  assert.equal(result.reduce((sum,item)=>sum+item.value,0),68);
  assert.equal(result.some(item=>item.name==="08/11"),false);
  assert.match(dashboard,/chartTrend\(analytics\?\.opened\|\|\[\],periodDays\)/);
  assert.match(dashboard,/chartTrend\(analytics\?\.quote_rejected\|\|\[\],periodDays\)/);
});

test("pizza temporal tem altura reduzida e legenda rolável sem invadir o rodapé", async () => {
  const panel = read("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  const ui = read("src/features/dashboard/presentation/DashboardUi.tsx");
  await compile("src/features/dashboard/presentation/DashboardOrderChartPanel.tsx");
  await compile("src/features/dashboard/presentation/DashboardUi.tsx");
  assert.match(panel,/chartKey === "opened" \|\| chartKey === "quote_approved" \|\| chartKey === "quote_rejected"/);
  assert.match(panel,/fixedHeight=\{timeSeries \? 360 : CHART_HEIGHT\}/);
  assert.match(panel,/innerRadius=\{0\} scrollLegend=\{timeSeries\}/);
  assert.match(ui,/scrollLegend = false/);
  assert.match(ui,/overflow-y-auto overscroll-contain/);
  assert.match(ui,/justify-start overflow-y-auto/);
  assert.match(ui,/cy=\{scrollLegend \? "44%" : "50%"\}/);
  assert.match(ui,/outerRadius=\{scrollLegend \? "75%" : "84%"\}/);
  assert.match(ui,/tabIndex=\{scrollLegend \? 0 : undefined\}/);
});
