import type { ElementType, ReactNode } from "react";
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

export type DashboardChartPoint = { name: string; value: number };
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
    <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white p-1.5 shadow-sm" aria-label="Áreas do dashboard">
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
              "inline-flex min-h-10 shrink-0 cursor-default items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40",
              selected ? "bg-[#0057e7] text-white shadow-sm" : "text-[#5a6a82] hover:bg-[#0057e7]/5 hover:text-[#0057e7]",
            )}
          >
            <Icon size={15} />
            {item.label}
          </button>
        );
      })}
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
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ElementType;
  onOpen?: () => void;
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
        {onOpen && (
          <button type="button" onClick={onOpen} className="inline-flex shrink-0 cursor-default items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#0057e7] hover:bg-[#0057e7]/5">
            Abrir <ArrowUpRight size={13} />
          </button>
        )}
      </AdminCardHeader>
      <div className="min-h-0 flex-1 p-3 sm:p-4">{children}</div>
    </AdminCard>
  );
}

const tooltipStyle = { borderRadius: 10, border: "1px solid rgba(13,27,46,.1)", fontSize: 11, boxShadow: "0 10px 30px rgba(13,27,46,.08)" };

export function DashboardBarChart({ data, color = "#0057e7" }: { data: DashboardChartPoint[]; color?: string }) {
  if (!data.length) return <DashboardEmpty text="Sem dados para o período." />;
  return (
    <div className="h-full min-h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf4" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#718096" }} interval={0} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#718096" }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,87,231,.04)" }} />
          <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={42} />
        </BarChart>
      </ResponsiveContainer>
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
          <Tooltip contentStyle={tooltipStyle} formatter={value => money ? Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardDonutChart({ data, colors = ["#0057e7", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"] }: { data: DashboardChartPoint[]; colors?: string[] }) {
  if (!data.length) return <DashboardEmpty text="Sem dados para o período." />;
  return (
    <div className="grid h-full min-h-[210px] grid-cols-[minmax(0,1fr)_minmax(120px,.75fr)] items-center gap-2">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="78%" paddingAngle={3}>
            {data.map((point, index) => <Cell key={point.name} fill={colors[index % colors.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2 overflow-hidden">
        {data.slice(0, 6).map((point, index) => (
          <div key={point.name} className="flex min-w-0 items-center gap-2 text-[10px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            <span className="min-w-0 flex-1 truncate font-semibold text-[#5a6a82]">{point.name}</span>
            <strong className="text-[#0d1b2e]">{point.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardEmpty({ text }: { text: string }) {
  return <div className="flex h-full min-h-[150px] items-center justify-center text-center text-xs font-semibold text-[#7a879a]">{text}</div>;
}
