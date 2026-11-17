import { useEffect, useMemo, useState, type ElementType } from "react";
import { AlignLeft, BarChart3, ChevronLeft, ChevronRight, LineChart as LineChartIcon, List, PieChart, Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import {
  DashboardBarChart, DashboardDonutChart, DashboardEmpty, DashboardLineChart, DashboardPanel,
  DashboardSlaDistributionChart,
  type DashboardChartPoint, type DashboardSlaChartPoint, type DashboardSlaState,
} from "./DashboardUi";

export type DashboardOrderChartMode = "pie" | "vertical" | "horizontal" | "line";
export type DashboardOrderChartKey =
  | "situation" | "status" | "opened" | "service_type" | "equipment_type"
  | "equipment_model" | "quote_approved" | "quote_rejected";

const modes = [
  { value: "pie", label: "Gráfico de pizza", Icon: PieChart },
  { value: "vertical", label: "Barras verticais", Icon: BarChart3 },
  { value: "horizontal", label: "Barras horizontais", Icon: AlignLeft },
  { value: "line", label: "Gráfico de linha", Icon: LineChartIcon },
] as const;

const CHART_ACCENTS: Record<DashboardOrderChartKey,string> = {
  situation: "#0131CD", status: "#0131CD", opened: "#0131CD",
  service_type: "#0131CD", equipment_type: "#0131CD",
  equipment_model: "#0131CD", quote_approved: "#059669", quote_rejected: "#dc2626",
};

const CHART_PALETTES = {
  blue: ["#0131CD", "#2563eb", "#1d4ed8", "#60a5fa", "#3b82f6", "#1e40af", "#93c5fd"],
  green: ["#059669", "#10b981", "#047857", "#34d399", "#065f46", "#6ee7b7", "#16a34a"],
  red: ["#dc2626", "#ef4444", "#b91c1c", "#f87171", "#991b1b", "#fb7185", "#fca5a5"],
};

const CHART_EXPLANATIONS: Record<DashboardOrderChartKey,string> = {
  situation: "As cores indicam o SLA: verde no prazo, amarelo em atenção, vermelho estourado e cinza sem SLA.",
  status: "As cores representam os status configurados no cadastro. Os valores são quantidades de OS.",
  opened: "Azul: quantidade de OS abertas em cada data. Não representa valores em reais.",
  service_type: "Azul: quantidade de OS por tipo de atendimento.",
  equipment_type: "Azul: quantidade de OS por tipo de equipamento.",
  equipment_model: "Azul: quantidade de OS por modelo; nenhum modelo é somado em Outros.",
  quote_approved: "Verde: quantidade de orçamentos aprovados por data, não o valor em reais.",
  quote_rejected: "Vermelho: quantidade de orçamentos reprovados por data, não o valor em reais.",
};

const PAGE_SIZE = 6;

export function DashboardOrderChartPanel({
  chartKey, title, subtitle, icon, data, mode, onModeChange, selectedKey, onSelect,
  slaData, selectedState, onSlaSelect,
}: {
  chartKey: DashboardOrderChartKey;
  title: string;
  subtitle: string;
  icon?: ElementType;
  data: DashboardChartPoint[];
  mode: DashboardOrderChartMode;
  onModeChange: (next: DashboardOrderChartMode) => void;
  selectedKey?: string | null;
  onSelect?: (point: DashboardChartPoint) => void;
  slaData?: DashboardSlaChartPoint[];
  selectedState?: DashboardSlaState | null;
  onSlaSelect?: (point: DashboardSlaChartPoint, state: DashboardSlaState, value: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showNames, setShowNames] = useState(false);
  const isTimeSeries = chartKey === "opened" || chartKey === "quote_approved" || chartKey === "quote_rejected";
  const canSearch = chartKey === "equipment_model";
  const categoryData = useMemo(() => {
    if (isTimeSeries || !search.trim()) return data;
    const term = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return data.filter(item => item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(term));
  }, [data, isTimeSeries, search]);
  const pageCount = isTimeSeries ? 1 : Math.max(1, Math.ceil(categoryData.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageData = isTimeSeries ? categoryData : categoryData.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const visibleSlaData = slaData
    ? slaData.filter(point => pageData.some(visible => visible.key === point.key))
    : undefined;
  const showPager = !isTimeSeries && categoryData.length > PAGE_SIZE;
  const showToolbar = !isTimeSeries;
  const accent = CHART_ACCENTS[chartKey];
  const palette = chartKey === "quote_approved" ? CHART_PALETTES.green
    : chartKey === "quote_rejected" ? CHART_PALETTES.red : CHART_PALETTES.blue;
  useEffect(() => { setPage(1); setSearch(""); setShowNames(false); }, [chartKey]);
  const controls = <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
    {modes.map(({ value, label, Icon }) => <button key={value} type="button" title={label}
      aria-label={`${label} · ${title}`} aria-pressed={mode === value}
      onClick={() => onModeChange(value)}
      className={cn("flex size-7 items-center justify-center rounded-md transition-colors",
        mode === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")}>
      <Icon size={14} />
    </button>)}
  </div>;

  const chartHeight = showToolbar ? 203 : 238;
  const explanation = mode === "line" && chartKey === "situation"
    ? "Linha azul: quantidade total por situação. Use barras ou pizza para visualizar os níveis do SLA."
    : mode === "line" && chartKey === "status"
    ? "Linha azul: quantidade por status. As cores de cada status aparecem nos gráficos de barras e pizza."
    : CHART_EXPLANATIONS[chartKey];

  return <DashboardPanel title={title} subtitle={subtitle} icon={icon} headerAside={controls}
    className="h-[370px] w-full max-w-[465px]">
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-1.5">
      {showToolbar && <div className="flex h-8 shrink-0 items-center justify-between gap-2">
        {canSearch && <label className="flex min-w-0 max-w-[200px] flex-1 items-center gap-1.5 rounded-md border border-border bg-card px-2">
          <Search size={12} className="shrink-0 text-muted-foreground" />
          <input type="search" aria-label="Buscar modelo do equipamento" placeholder="Buscar modelo"
            value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}
            className="h-7 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" />
        </label>}
        {!canSearch && <button type="button" aria-label={showNames ? `Voltar ao gráfico de ${title}` : `Ver nomes completos de ${title}`}
          aria-pressed={showNames} onClick={() => setShowNames(value => !value)}
          className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold",
            showNames ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
          {showNames ? <BarChart3 size={12} /> : <List size={12} />}
          {showNames ? "Gráfico" : "Ver nomes"}
        </button>}
        {canSearch && <button type="button" aria-label={showNames ? "Voltar ao gráfico de modelos" : "Ver modelos em lista"}
          aria-pressed={showNames} onClick={() => setShowNames(value => !value)}
          className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold",
            showNames ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
          {showNames ? <BarChart3 size={12} /> : <List size={12} />}
          <span className="hidden sm:inline">{showNames ? "Gráfico" : "Lista"}</span>
        </button>}
        <div className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
          <span>{categoryData.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(safePage * PAGE_SIZE, categoryData.length)} de {categoryData.length}</span>
          <button type="button" aria-label={`Categorias anteriores de ${title}`}
            disabled={safePage === 1} onClick={() => setPage(Math.max(1, safePage - 1))}
            className="grid size-7 place-items-center rounded-md border border-border disabled:opacity-35 hover:bg-muted">
            <ChevronLeft size={14} />
          </button>
          <button type="button" aria-label={`Próximas categorias de ${title}`}
            disabled={safePage >= pageCount} onClick={() => setPage(Math.min(pageCount, safePage + 1))}
            className="grid size-7 place-items-center rounded-md border border-border disabled:opacity-35 hover:bg-muted">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {!pageData.length
          ? <DashboardEmpty text={search ? "Nenhum modelo corresponde à busca." : "Sem dados para o período."} />
          : showNames ? <div className="h-full overflow-y-auto divide-y divide-border/70 pr-1 [scrollbar-width:thin]">
              {pageData.map((point,index) => {
                const sla = visibleSlaData?.find(value => value.key === point.key);
                const dotColor = point.color || palette[index % palette.length];
                return <div key={point.key || point.name} className="py-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{backgroundColor:dotColor}}/>
                    <button type="button" disabled={!onSelect}
                      className={cn("min-w-0 flex-1 text-left text-xs font-semibold leading-5 text-foreground",
                        onSelect && "hover:text-primary hover:underline")}
                      onClick={() => onSelect?.(point)} title={point.name}>{point.name}</button>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-foreground">{point.value} OS</span>
                  </div>
                  {sla && <div className="mt-1.5 flex flex-wrap gap-1 pl-[18px]">
                    {([
                      ["success", "No prazo", "#22c55e"],
                      ["warning", "Atenção", "#f59e0b"],
                      ["danger", "Estourado", "#ef4444"],
                      ["neutral", "Sem SLA", "#94a3b8"],
                    ] as const).map(([state,label,color]) => <button key={state} type="button"
                      onClick={() => onSlaSelect?.(sla,state,sla.sla[state])}
                      disabled={!onSlaSelect || sla.sla[state]===0}
                      title={`${point.name}: ${label}, ${sla.sla[state]} OS`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground disabled:opacity-40 hover:bg-muted">
                      <span className="size-1.5 rounded-full" style={{backgroundColor:color}}/>{label} {sla.sla[state]}
                    </button>)}
                  </div>}
                </div>;
              })}
            </div>
          : visibleSlaData && mode !== "line" ? <DashboardSlaDistributionChart
            data={visibleSlaData} mode={mode} minHeight={chartHeight} fixedHeight={chartHeight}
            hideLegend={mode === "pie"} selectedKey={selectedKey} selectedState={selectedState}
            onSelect={onSlaSelect} />
          : mode === "pie" ? <DashboardDonutChart
            data={pageData} colors={palette} selectedKey={selectedKey} onSelect={onSelect}
            fixedHeight={chartHeight} minHeight={chartHeight} innerRadius={0} />
          : mode === "line" ? <DashboardLineChart
            data={pageData} color={accent} fixedHeight={chartHeight} onSelect={onSelect} />
          : <DashboardBarChart
            data={pageData} color={accent} selectedKey={selectedKey} onSelect={onSelect}
            fixedHeight={chartHeight} minHeight={chartHeight}
            layout={mode === "horizontal" ? "vertical" : "horizontal"} />}
      </div>
      <p className="shrink-0 truncate text-[10px] font-medium text-muted-foreground"
        title={explanation}>
        {chartKey !== "situation" && chartKey !== "status" && <span className="mr-1.5 inline-block size-2 rounded-full align-middle"
          style={{backgroundColor:accent}} aria-hidden="true" />}
        {explanation}
      </p>
    </div>
  </DashboardPanel>;
}
