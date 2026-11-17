import type { ElementType } from "react";
import { AlignLeft, BarChart3, LineChart as LineChartIcon, PieChart } from "lucide-react";
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

const CHART_ACCENTS: Record<DashboardOrderChartKey, string> = {
  situation: "#0131CD", status: "#0131CD", opened: "#0131CD",
  service_type: "#0131CD", equipment_type: "#0131CD",
  equipment_model: "#0131CD", quote_approved: "#059669", quote_rejected: "#dc2626",
};

const CHART_PALETTES = {
  blue: ["#0131CD", "#2563eb", "#1d4ed8", "#60a5fa", "#3b82f6", "#1e40af", "#93c5fd"],
  green: ["#059669", "#10b981", "#047857", "#34d399", "#065f46", "#6ee7b7", "#16a34a"],
  red: ["#dc2626", "#ef4444", "#b91c1c", "#f87171", "#991b1b", "#fb7185", "#fca5a5"],
};

const CHART_EXPLANATIONS: Record<DashboardOrderChartKey, string> = {
  situation: "SLA: verde no prazo, amarelo em atenção, vermelho estourado, cinza sem SLA.",
  status: "Cores de cada status configuradas no cadastro. Valores em quantidade de OS.",
  opened: "Azul: quantidade de OS abertas por data, não valores em reais.",
  service_type: "Azul: quantidade de OS por tipo de atendimento.",
  equipment_type: "Azul: quantidade de OS por tipo de equipamento.",
  equipment_model: "Azul: modelos mais frequentes no período, sem agrupar em 'Outros'.",
  quote_approved: "Verde: quantidade de orçamentos aprovados. Exibe somente datas com aprovações.",
  quote_rejected: "Vermelho: quantidade de orçamentos reprovados. Exibe somente datas com reprovações.",
};

const MAX_CATEGORIES = 12;
const CHART_HEIGHT = 438;

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
  const timeSeries = chartKey === "opened" || chartKey === "quote_approved" || chartKey === "quote_rejected";
  // Situações e status nunca são omitidos. Nas demais distribuições, mostrar
  // as categorias mais frequentes evita 200+ barras ilegíveis, sem inventar "Outros".
  // Para aprovações/reprovações, exibir apenas datas em que houve ocorrências.
  // Os buckets vazios são úteis em tendências temporais, mas não representam
  // categorias no gráfico: em pizza criavam legendas 0 ao lado do único evento.
  const visibleData = chartKey === "quote_approved" || chartKey === "quote_rejected"
    ? data.filter(point => Number(point.value) > 0)
    : timeSeries || chartKey === "situation" || chartKey === "status"
      ? data : data.slice(0, MAX_CATEGORIES);
  const visibleSlaData = slaData?.filter(point => visibleData.some(item => item.key === point.key));
  const limited = visibleData.length < data.length;
  const accent = CHART_ACCENTS[chartKey];
  const palette = chartKey === "quote_approved" ? CHART_PALETTES.green
    : chartKey === "quote_rejected" ? CHART_PALETTES.red : CHART_PALETTES.blue;
  const explanation = mode === "line" && chartKey === "situation"
    ? "Linha azul: total por situação. Selecione barras ou pizza para visualizar o SLA."
    : mode === "line" && chartKey === "status"
    ? "Linha azul: total por status. As cores dos status aparecem em barras e pizza."
    : CHART_EXPLANATIONS[chartKey];

  const controls = <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
    {modes.map(({ value, label, Icon }) => <button key={value} type="button" title={label}
      aria-label={`${label} · ${title}`} aria-pressed={mode === value}
      onClick={() => onModeChange(value)}
      className={cn("flex size-7 items-center justify-center rounded-md transition-colors",
        mode === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")}>
      <Icon size={14} />
    </button>)}
  </div>;

  return <DashboardPanel title={title}
    subtitle={limited ? `${subtitle} · Top ${visibleData.length} de ${data.length}` : subtitle}
    icon={icon} headerAside={controls} className="h-[580px] w-full min-w-0">
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div className="min-h-0 min-w-0 flex-1">
        {!visibleData.length
          ? <DashboardEmpty text="Sem dados para o período." />
          : visibleSlaData && mode !== "line"
          ? <DashboardSlaDistributionChart data={visibleSlaData} mode={mode}
              fixedHeight={CHART_HEIGHT} minHeight={CHART_HEIGHT} hideLegend={mode === "pie"}
              selectedKey={selectedKey} selectedState={selectedState} onSelect={onSlaSelect} />
          : mode === "pie"
          ? <DashboardDonutChart data={visibleData} colors={palette}
              selectedKey={selectedKey} onSelect={onSelect} fixedHeight={CHART_HEIGHT}
              minHeight={CHART_HEIGHT} innerRadius={0} />
          : mode === "line"
          ? <DashboardLineChart data={visibleData} color={accent}
              fixedHeight={CHART_HEIGHT} onSelect={onSelect} />
          : <DashboardBarChart data={visibleData} color={accent}
              selectedKey={selectedKey} onSelect={onSelect} fixedHeight={CHART_HEIGHT}
              minHeight={CHART_HEIGHT} layout={mode === "horizontal" ? "vertical" : "horizontal"} />}
      </div>
      <p className="shrink-0 text-[11px] leading-4 font-medium text-muted-foreground">
        {chartKey !== "situation" && chartKey !== "status" && <span className="mr-1.5 inline-block size-2 rounded-full align-middle"
          style={{ backgroundColor: accent }} aria-hidden="true" />}
        {explanation}
      </p>
    </div>
  </DashboardPanel>;
}
