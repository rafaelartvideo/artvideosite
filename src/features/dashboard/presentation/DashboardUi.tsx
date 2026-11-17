import { AdminSubsectionTabs } from "@/shared/ui/admin/AdminSubsectionTabs";
import { useState, type ElementType, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/shared/domain/formatters";
import { AdminCard, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import type { DashboardModule } from "../domain/dashboard";

export type DashboardChartPoint = { id?: string | null; name: string; value: number; color?: string | null; key?: string };
export type DashboardSlaState = "success" | "warning" | "danger" | "neutral";
export type DashboardSlaChartPoint = {
  id: string | null;
  name: string;
  total: number;
  key: string;
  sla: Record<DashboardSlaState, number>;
};
export type DashboardMetricTone = "blue" | "green" | "amber" | "red" | "purple" | "slate";

export function DashboardModuleNav({
  items, value, onChange,
}: {
  items: Array<{ id: DashboardModule; label: string; icon: ElementType }>;
  value: DashboardModule;
  onChange: (module: DashboardModule) => void;
}) {
  return <AdminSubsectionTabs
    value={value} items={items.map(item => ({ id: item.id, label: item.label, Icon: item.icon }))}
    onChange={onChange} ariaLabel="Áreas do dashboard" centered />;
}

export function DashboardMetricCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  hint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon: ElementType;
  tone?: DashboardMetricTone;
  hint?: string;
  onClick?: () => void;
}) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
    purple: "border-violet-100 bg-violet-50 text-violet-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const card = (
    <AdminCard className="flex h-full min-h-[92px] items-center justify-between gap-3 p-4 transition-colors">
      <div className="min-w-0">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-[#5a6a82]">{label}</p>
        <p className="mt-1 truncate text-2xl font-black leading-none text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</p>
        {hint && <p className="mt-1.5 truncate text-[10px] font-semibold text-[#7a879a]">{hint}</p>}
      </div>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", tones[tone])}><Icon size={19} /></div>
    </AdminCard>
  );
  return onClick ? <button type="button" onClick={onClick} aria-label={`Ver detalhes de ${label}`}
    className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&>*]:hover:border-primary/40 [&>*]:hover:bg-muted/30">{card}</button> : card;
}

export function DashboardPanel({
  title,
  subtitle,
  icon: Icon,
  onOpen,
  headerAside,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ElementType;
  onOpen?: () => void;
  headerAside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AdminCard className={cn("flex h-[580px] min-h-0 w-full min-w-0 flex-col overflow-hidden", className)}>
      <AdminCardHeader className="min-h-[52px] py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0057e7]/8 text-[#0057e7]"><Icon size={15} /></div>}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-[#0d1b2e]">{title}</h3>
            {subtitle && <p className="truncate text-[10px] font-semibold text-[#7a879a]">{subtitle}</p>}
          </div>
        </div>
        {(headerAside || onOpen) && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {headerAside}
            {onOpen && (
              <button type="button" onClick={onOpen} className="inline-flex shrink-0 cursor-default items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#0057e7] hover:bg-[#0057e7]/5">
                Abrir <ArrowUpRight size={13} />
              </button>
            )}
          </div>
        )}
      </AdminCardHeader>
      <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">{children}</div>
    </AdminCard>
  );
}

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "0 10px 30px rgba(0,0,0,.16)",
};
const tooltipLabelStyle = { color: "var(--popover-foreground)", fontWeight: 700 };
const tooltipItemStyle = { color: "var(--popover-foreground)" };

export function DashboardBarChart({
  data,
  color = "#0057e7",
  layout = "horizontal",
  selectedKey,
  onSelect,
  minHeight = 210,
  fixedHeight,
}: {
  data: DashboardChartPoint[];
  color?: string;
  layout?: "horizontal" | "vertical";
  selectedKey?: string | null;
  onSelect?: (point: DashboardChartPoint) => void;
  minHeight?: number;
  fixedHeight?: number;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  if (!data.length) return <DashboardEmpty text="Sem dados para o período." />;
  const vertical = layout === "vertical";
  const chartHeight = fixedHeight ?? (vertical ? Math.max(minHeight, data.length * 40 + 38) : minHeight);
  const pointKey = (point: DashboardChartPoint) => point.key || point.name;

  return (
    <div className="w-full min-w-0" style={{ height: chartHeight, minHeight: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={vertical ? "vertical" : "horizontal"}
          margin={vertical ? { top: 6, right: 16, left: 8, bottom: 2 } : { top: 8, right: 12, left: -18, bottom: 2 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={!vertical} vertical={vertical} stroke="#e8edf4" />
          {vertical ? (
            <>
              <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }} />
              <YAxis
                type="category"
                dataKey="name"
                width={194}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }}
                tickFormatter={value => String(value).length > 34 ? `${String(value).slice(0, 32)}…` : String(value)}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} height={84} angle={-38} textAnchor="end"
                  tick={{ fontSize: 11, fontWeight: 600, fill: "var(--muted-foreground)" }}
                  tickFormatter={value => String(value).length > 13 ? `${String(value).slice(0, 11)}…` : String(value)} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: "rgba(0,87,231,.04)" }} />
          <Bar
            dataKey="value"
            name="Quantidade de OS"
            fill={color}
            radius={vertical ? [0, 7, 7, 0] : [7, 7, 0, 0]}
            maxBarSize={vertical ? 28 : 50}
          >
            {data.map(point => {
              const key = pointKey(point);
              const hovered = hoveredKey === key;
              return (
                <Cell
                  key={key}
                  fill={point.color || color}
                  stroke={hovered ? "var(--foreground)" : "transparent"}
                  strokeWidth={hovered ? 2.5 : 0}
                  opacity={selectedKey && selectedKey !== key ? 0.4 : 1}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => onSelect?.(point)}
                  style={{ cursor: onSelect ? "pointer" : "default" }}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const SLA_CHART_SEGMENTS: Array<{ key: DashboardSlaState; label: string; shortLabel: string; color: string }> = [
  { key: "success", label: "Dentro do prazo", shortLabel: "No prazo", color: "#22c55e" },
  { key: "warning", label: "Próxima de estourar", shortLabel: "Atenção", color: "#f59e0b" },
  { key: "danger", label: "Prazo estourado", shortLabel: "Estourada", color: "#ef4444" },
  { key: "neutral", label: "Sem SLA configurado", shortLabel: "Sem SLA", color: "#94a3b8" },
];

export function DashboardSlaDistributionChart({
  data,
  mode,
  selectedKey,
  selectedState,
  onSelect,
  minHeight = 260,
  fixedHeight,
  hideLegend = false,
}: {
  data: DashboardSlaChartPoint[];
  mode: "pie" | "vertical" | "horizontal";
  selectedKey?: string | null;
  selectedState?: DashboardSlaState | null;
  onSelect?: (point: DashboardSlaChartPoint, state: DashboardSlaState, value: number) => void;
  minHeight?: number;
  fixedHeight?: number;
  hideLegend?: boolean;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  if (!data.length) return <DashboardEmpty text="Sem dados para o período." />;

  const segmentKey = (point: DashboardSlaChartPoint, state: DashboardSlaState) => `${point.key}:${state}`;
  const hasState = (state: DashboardSlaState) => data.some(point => Number(point.sla[state] || 0) > 0);
  const visibleSegments = SLA_CHART_SEGMENTS.filter(segment => hasState(segment.key));
  const selectedSegment = selectedKey && selectedState ? `${selectedKey}:${selectedState}` : null;

  const legend = (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {visibleSegments.map(segment => (
        <div key={segment.key} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
          {segment.shortLabel}
        </div>
      ))}
    </div>
  );

  if (mode === "pie") {
    const pieData = data.flatMap(point => visibleSegments.flatMap(segment => {
      const value = Number(point.sla[segment.key] || 0);
      return value > 0 ? [{
        id: point.id,
        point,
        state: segment.key,
        stateLabel: segment.label,
        label: `${point.name} · ${segment.shortLabel}`,
        value,
        color: segment.color,
        segmentKey: segmentKey(point, segment.key),
      }] : [];
    }));
    const chartHeight = fixedHeight ?? Math.max(minHeight, data.length * 38 + 80);

    return (
      <div>
        {!hideLegend && legend}
        <div
          className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(120px,.85fr)] items-center gap-2"
          style={{ height: chartHeight, minHeight: chartHeight }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="label" innerRadius={0} outerRadius="84%" paddingAngle={2}>
                {pieData.map(item => {
                  const hovered = hoveredSegment === item.segmentKey;
                  return (
                    <Cell
                      key={item.segmentKey}
                      fill={item.color}
                      stroke={hovered ? "var(--foreground)" : "var(--card)"}
                      strokeWidth={hovered ? 3 : 1.5}
                      opacity={selectedSegment && selectedSegment !== item.segmentKey ? 0.32 : 1}
                      onMouseEnter={() => setHoveredSegment(item.segmentKey)}
                      onMouseLeave={() => setHoveredSegment(null)}
                      onClick={() => onSelect?.(item.point, item.state, item.value)}
                      style={{ cursor: onSelect ? "pointer" : "default" }}
                    />
                  );
                })}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex h-full min-w-0 flex-col justify-center gap-0.5">
            {data.map(point => (
              <div key={point.key} className="flex min-h-0 items-center justify-between gap-1.5 py-0.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground" title={point.name}>{point.name}</span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {visibleSegments.map(segment => {
                    const value = Number(point.sla[segment.key] || 0);
                    if (value === 0) return null;
                    const key = segmentKey(point, segment.key);
                    return <button key={segment.key} type="button"
                      disabled={!onSelect}
                      title={`${point.name} · ${segment.label}: ${value}`}
                      aria-label={`${point.name}, ${segment.label}: ${value}`}
                      onMouseEnter={() => setHoveredSegment(key)}
                      onMouseLeave={() => setHoveredSegment(null)}
                      onClick={() => onSelect?.(point, segment.key, value)}
                      className={cn("inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-bold text-foreground hover:bg-muted",selectedSegment === key && "bg-muted")}>
                      <span className="size-1.5 rounded-full" style={{backgroundColor: segment.color}} />{value}
                    </button>;
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const horizontalBars = mode === "horizontal";
  const barData = data.map(point => ({
    ...point,
    success: Number(point.sla.success || 0),
    warning: Number(point.sla.warning || 0),
    danger: Number(point.sla.danger || 0),
    neutral: Number(point.sla.neutral || 0),
  }));
  const chartHeight = fixedHeight ?? (horizontalBars ? Math.max(minHeight, data.length * 44 + 44) : minHeight);
  const innerChartHeight = Math.max(210, chartHeight - 34);

  return (
    <div className="flex min-w-0 flex-col" style={{height:chartHeight}}>
      <div className="shrink-0">{legend}</div>
      <div className="min-h-0 w-full flex-1">
        <div style={{height:innerChartHeight,width:"100%"}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={barData}
            layout={horizontalBars ? "vertical" : "horizontal"}
            margin={horizontalBars ? { top: 6, right: 12, left: 8, bottom: 2 } : { top: 8, right: 12, left: -18, bottom: 2 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={!horizontalBars} vertical={horizontalBars} stroke="#e8edf4" />
            {horizontalBars ? (
              <>
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={194}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }}
                  tickFormatter={value => String(value).length > 34 ? `${String(value).slice(0, 32)}…` : String(value)}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }}
                  tickFormatter={value => String(value).length > 13 ? `${String(value).slice(0, 11)}…` : String(value)}
                  angle={-38} textAnchor="end" height={84}
                  interval={0}
                />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }} />
              </>
            )}
            <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: "rgba(0,87,231,.04)" }} />
            {visibleSegments.map(segment => (
              <Bar
                key={segment.key}
                dataKey={segment.key}
                name={segment.label}
                stackId="sla"
                fill={segment.color}
                maxBarSize={horizontalBars ? 30 : 54}
              >
                {barData.map(point => {
                  const key = segmentKey(point, segment.key);
                  const hovered = hoveredSegment === key;
                  const selected = selectedSegment === key;
                  const dimmed = Boolean(selectedSegment && !selected);
                  return (
                    <Cell
                      key={key}
                      fill={segment.color}
                      stroke={hovered ? "var(--foreground)" : "transparent"}
                      strokeWidth={hovered ? 2.5 : 0}
                      opacity={dimmed ? 0.28 : 1}
                      onMouseEnter={() => setHoveredSegment(key)}
                      onMouseLeave={() => setHoveredSegment(null)}
                      onClick={() => Number(point[segment.key] || 0) > 0 && onSelect?.(point, segment.key, Number(point[segment.key] || 0))}
                      style={{ cursor: onSelect && Number(point[segment.key] || 0) > 0 ? "pointer" : "default" }}
                    />
                  );
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function DashboardLineChart({ data, color = "#0057e7", money = false, fixedHeight, onSelect }: { data: DashboardChartPoint[]; color?: string; money?: boolean; fixedHeight?: number; onSelect?: (point: DashboardChartPoint) => void }) {
  if (!data.length) return <DashboardEmpty text="Sem movimentação no período." />;
  return (
    <div className="h-full min-h-[210px] w-full" style={fixedHeight ? {height:fixedHeight,minHeight:fixedHeight}:undefined}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: money ? -4 : -22, bottom: 0 }}
          onClick={(event: any) => {
            const point = event?.activePayload?.[0]?.payload as DashboardChartPoint | undefined;
            if (point) onSelect?.(point);
          }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf4" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#718096" }} minTickGap={18} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#718096" }} tickFormatter={value => money ? `R$ ${Number(value) / 1000 >= 1 ? `${(Number(value) / 1000).toFixed(0)}k` : value}` : String(value)} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={value => money ? Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardDonutChart({
  data,
  colors = ["#0057e7", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"],
  selectedKey,
  onSelect,
  minHeight = 210,
  fixedHeight,
  innerRadius = "54%",
}: {
  data: DashboardChartPoint[];
  colors?: string[];
  selectedKey?: string | null;
  onSelect?: (point: DashboardChartPoint) => void;
  minHeight?: number;
  fixedHeight?: number;
  innerRadius?: number | string;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  if (!data.length) return <DashboardEmpty text="Sem dados para o período." />;
  const pointKey = (point: DashboardChartPoint) => point.key || point.name;
  const chartHeight = fixedHeight ?? Math.max(minHeight, data.length * 32 + 58);

  return (
    <div
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(120px,.85fr)] items-center gap-2"
      style={{ height: chartHeight, minHeight: chartHeight }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={innerRadius} outerRadius="84%" paddingAngle={3}>
            {data.map((point, index) => {
              const key = pointKey(point);
              const hovered = hoveredKey === key;
              return (
                <Cell
                  key={key}
                  fill={point.color || colors[index % colors.length]}
                  stroke={hovered ? "var(--foreground)" : "transparent"}
                  strokeWidth={hovered ? 3 : 0}
                  opacity={selectedKey && selectedKey !== key ? 0.4 : 1}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => onSelect?.(point)}
                  style={{ cursor: onSelect ? "pointer" : "default" }}
                />
              );
            })}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex h-full min-w-0 flex-col justify-center gap-1">
        {data.map((point, index) => {
          const key = pointKey(point);
          return (
            <button
              key={key}
              type="button"
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={() => onSelect?.(point)}
              disabled={!onSelect}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1 text-[11px] transition-all",
                onSelect ? "cursor-pointer hover:bg-muted" : "cursor-default",
                hoveredKey === key ? "border-foreground/35 bg-muted/70" : "border-transparent",
                selectedKey && selectedKey !== key && "opacity-45",
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: point.color || colors[index % colors.length] }} />
              <span className="line-clamp-2 min-w-0 flex-1 break-words text-left font-semibold leading-4 text-muted-foreground" title={point.name}>{point.name}</span>
              <strong className="text-foreground">{point.value}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardEmpty({ text }: { text: string }) {
  return <div className="flex h-full min-h-[150px] items-center justify-center text-center text-xs font-semibold text-[#7a879a]">{text}</div>;
}
