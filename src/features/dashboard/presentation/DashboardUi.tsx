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
  items,
  value,
  onChange,
}: {
  items: Array<{ id: DashboardModule; label: string; icon: ElementType }>;
  value: DashboardModule;
  onChange: (module: DashboardModule) => void;
}) {
  return (
    <nav className="mx-auto w-fit max-w-full overflow-x-auto rounded-xl border border-border bg-card px-2 shadow-sm" aria-label="Áreas do dashboard">
      <div className="flex w-max items-center justify-center gap-1">
        {items.map(item => {
          const Icon = item.icon;
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative inline-flex min-h-11 shrink-0 cursor-default items-center justify-center gap-2 bg-transparent px-3 text-xs font-black transition-colors duration-200 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-primary after:transition-transform after:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                selected
                  ? "text-primary after:scale-x-100"
                  : "text-muted-foreground after:scale-x-0 hover:text-primary",
              )}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function DashboardMetricCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: ElementType;
  tone?: DashboardMetricTone;
  hint?: string;
}) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
    purple: "border-violet-100 bg-violet-50 text-violet-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <AdminCard className="flex min-h-[92px] items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-[#5a6a82]">{label}</p>
        <p className="mt-1 truncate text-2xl font-black leading-none text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</p>
        {hint && <p className="mt-1.5 truncate text-[10px] font-semibold text-[#7a879a]">{hint}</p>}
      </div>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", tones[tone])}><Icon size={19} /></div>
    </AdminCard>
  );
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
    <AdminCard className={cn("flex min-h-0 flex-col", className)}>
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
      <div className="min-h-0 flex-1 p-3 sm:p-4">{children}</div>
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
}: {
  data: DashboardChartPoint[];
  color?: string;
  layout?: "horizontal" | "vertical";
  selectedKey?: string | null;
  onSelect?: (point: DashboardChartPoint) => void;
  minHeight?: number;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  if (!data.length) return <DashboardEmpty text="Sem dados para o período." />;
  const vertical = layout === "vertical";
  const chartHeight = vertical ? Math.max(minHeight, data.length * 40 + 38) : minHeight;
  const pointKey = (point: DashboardChartPoint) => point.key || point.name;

  return (
    <div className="w-full" style={{ height: chartHeight, minHeight: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={vertical ? "vertical" : "horizontal"}
          margin={vertical ? { top: 6, right: 16, left: 8, bottom: 2 } : { top: 10, right: 8, left: -18, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={!vertical} vertical={vertical} stroke="#e8edf4" />
          {vertical ? (
            <>
              <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }} />
              <YAxis
                type="category"
                dataKey="name"
                width={132}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }}
                tickFormatter={value => String(value).length > 21 ? `${String(value).slice(0, 19)}…` : String(value)}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }} interval={0} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: "rgba(0,87,231,.04)" }} />
          <Bar
            dataKey="value"
            name="Total"
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
}: {
  data: DashboardSlaChartPoint[];
  mode: "pie" | "vertical" | "horizontal";
  selectedKey?: string | null;
  selectedState?: DashboardSlaState | null;
  onSelect?: (point: DashboardSlaChartPoint, state: DashboardSlaState, value: number) => void;
  minHeight?: number;
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
    const chartHeight = Math.max(minHeight, data.length * 38 + 80);

    return (
      <div>
        {legend}
        <div
          className="grid w-full grid-cols-[minmax(0,1.08fr)_minmax(150px,.92fr)] items-center gap-4"
          style={{ height: chartHeight, minHeight: chartHeight }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="label" innerRadius={0} outerRadius="86%" paddingAngle={2}>
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

          <div className="max-h-full space-y-2 overflow-y-auto pr-1">
            {data.map(point => (
              <div key={point.key} className="rounded-lg border border-border/70 bg-card px-2.5 py-2">
                <p className="truncate text-[11px] font-black text-foreground" title={point.name}>{point.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {visibleSegments.map(segment => {
                    const value = Number(point.sla[segment.key] || 0);
                    const key = segmentKey(point, segment.key);
                    const selected = selectedSegment === key;
                    return (
                      <button
                        key={segment.key}
                        type="button"
                        disabled={!onSelect || value <= 0}
                        title={`${segment.label}: ${value}`}
                        aria-label={`${point.name}, ${segment.label}: ${value}`}
                        onMouseEnter={() => value > 0 && setHoveredSegment(key)}
                        onMouseLeave={() => setHoveredSegment(null)}
                        onClick={() => value > 0 && onSelect?.(point, segment.key, value)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-black transition-all",
                          value > 0 ? "cursor-pointer" : "cursor-default opacity-35",
                          selected || hoveredSegment === key ? "border-foreground/35 bg-muted" : "border-transparent bg-muted/45",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
                        {value}
                      </button>
                    );
                  })}
                </div>
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
  const chartHeight = horizontalBars ? Math.max(minHeight, data.length * 44 + 44) : minHeight;

  return (
    <div>
      {legend}
      <div className="w-full" style={{ height: chartHeight, minHeight: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={barData}
            layout={horizontalBars ? "vertical" : "horizontal"}
            margin={horizontalBars ? { top: 6, right: 16, left: 8, bottom: 2 } : { top: 10, right: 8, left: -18, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={!horizontalBars} vertical={horizontalBars} stroke="#e8edf4" />
            {horizontalBars ? (
              <>
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={132}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }}
                  tickFormatter={value => String(value).length > 21 ? `${String(value).slice(0, 19)}…` : String(value)}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 600, fill: "#718096" }}
                  tickFormatter={value => String(value).length > 14 ? `${String(value).slice(0, 12)}…` : String(value)}
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
  );
}

export function DashboardLineChart({ data, color = "#0057e7", money = false }: { data: DashboardChartPoint[]; color?: string; money?: boolean }) {
  if (!data.length) return <DashboardEmpty text="Sem movimentação no período." />;
  return (
    <div className="h-full min-h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: money ? -4 : -22, bottom: 0 }}>
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
  innerRadius = "54%",
}: {
  data: DashboardChartPoint[];
  colors?: string[];
  selectedKey?: string | null;
  onSelect?: (point: DashboardChartPoint) => void;
  minHeight?: number;
  innerRadius?: number | string;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  if (!data.length) return <DashboardEmpty text="Sem dados para o período." />;
  const pointKey = (point: DashboardChartPoint) => point.key || point.name;
  const chartHeight = Math.max(minHeight, data.length * 32 + 58);

  return (
    <div
      className="grid w-full grid-cols-[minmax(0,1.12fr)_minmax(135px,.88fr)] items-center gap-4"
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
      <div className="max-h-full space-y-2 overflow-y-auto pr-1">
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
                "flex w-full min-w-0 items-center gap-2.5 rounded-lg border px-2 py-1.5 text-[11px] transition-all",
                onSelect ? "cursor-pointer hover:bg-muted" : "cursor-default",
                hoveredKey === key ? "border-foreground/35 bg-muted/70" : "border-transparent",
                selectedKey && selectedKey !== key && "opacity-45",
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: point.color || colors[index % colors.length] }} />
              <span className="min-w-0 flex-1 truncate text-left font-semibold text-muted-foreground">{point.name}</span>
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
