import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/shared/domain/formatters";

export function formatElapsedHours(hours: number) {
  const totalMinutes = Math.max(0, Math.floor(Number(hours) * 60 + 0.000001));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function elapsedHours(start?: string | null, end?: string | null, now = Date.now()) {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : now;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, (endTime - startTime) / 3_600_000);
}

export function ServiceOrderSlaCards({ order, slaHours }: { order: any; slaHours: number | null }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (order.completed_at) return;
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [order.id, order.situation_id, order.situation_started_at, order.completed_at]);

  const endAt = order.completed_at || null;
  const situationElapsed = elapsedHours(order.situation_started_at || order.updated_at || order.created_at, endAt, now);
  const orderElapsed = elapsedHours(order.created_at, endAt, now);
  const orderStartTime = new Date(order.created_at).getTime();
  const forecastDays = Number(order.service_type?.forecast_days);
  const hasForecast = Number.isFinite(orderStartTime) && Number.isFinite(forecastDays) && forecastDays > 0;
  const forecastEnd = hasForecast ? new Date(orderStartTime + forecastDays * 86_400_000) : null;
  const formatDateTime = (value: Date | string) => new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const validSla = slaHours != null && Number.isFinite(slaHours) && slaHours > 0;
  const exceededBy = validSla ? Math.max(0, situationElapsed - slaHours) : 0;
  const usage = validSla ? situationElapsed / slaHours : 0;
  const state = !validSla ? "neutral" : usage > 1 ? "danger" : usage >= 0.8 ? "warning" : "success";
  const styles = {
    neutral: { card: "border-slate-200 bg-slate-50", icon: "bg-slate-200 text-slate-700", title: "text-slate-700", bar: "bg-slate-400" },
    success: { card: "border-emerald-200 bg-emerald-50", icon: "bg-emerald-100 text-emerald-700", title: "text-emerald-700", bar: "bg-emerald-500" },
    warning: { card: "border-amber-300 bg-amber-50", icon: "bg-amber-100 text-amber-700", title: "text-amber-700", bar: "bg-amber-500" },
    danger: { card: "border-red-300 bg-red-50", icon: "bg-red-100 text-red-700", title: "text-red-700", bar: "bg-red-500" },
  }[state];

  return <div className="grid gap-3 sm:grid-cols-2">
    <div className={cn("rounded-xl border p-4 shadow-sm", styles.card)}>
      <div className="flex items-start gap-3"><div className={cn("rounded-lg p-2", styles.icon)}>{state === "danger" ? <AlertTriangle size={18} /> : <Clock size={18} />}</div><div className="min-w-0 flex-1"><p className={cn("truncate text-[10px] font-black uppercase tracking-wider", styles.title)}>Situação: {order.situation?.name || "Não definida"}</p><p className="mt-1 text-2xl font-black text-[#0d1b2e]">{formatElapsedHours(situationElapsed)}</p><p className="text-[11px] text-[#5a6a82]">Tempo corrido na situação · HH:MM</p></div></div>
      {validSla ? <><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80"><div className={cn("h-full rounded-full transition-all", styles.bar)} style={{ width: `${Math.min(100, Math.max(0, usage * 100))}%` }} /></div><div className="mt-2 flex justify-between gap-2 text-[11px]"><span className="font-semibold text-[#5a6a82]">Prazo: {formatElapsedHours(slaHours)}</span>{exceededBy > 0 ? <span className="font-black text-red-700">Estourou: +{formatElapsedHours(exceededBy)}</span> : <span className={cn("font-bold", styles.title)}>{Math.max(0, 100 - usage * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% restante</span>}</div></> : <p className="mt-3 rounded-lg bg-white/70 px-2.5 py-2 text-[11px] font-semibold text-slate-600">Prazo de SLA não configurado.</p>}
    </div>
    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 shadow-sm">
      <div className="flex items-start gap-3"><div className="rounded-lg bg-blue-100 p-2 text-[#0057e7]"><Clock size={18} /></div><div><p className="text-[10px] font-black uppercase tracking-wider text-[#0057e7]">Tempo total da ordem de serviço</p><p className="mt-1 text-2xl font-black text-[#0d1b2e]">{formatElapsedHours(orderElapsed)}</p><p className="text-[11px] text-[#5a6a82]">{order.completed_at ? "Tempo encerrado na conclusão" : "Correndo desde a abertura da OS"}</p></div></div>
      <div className="mt-3 flex flex-col rounded-lg border border-blue-100 bg-white/70 px-3 py-2 text-[11px] sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:pr-3">
          <span className="shrink-0 font-semibold text-[#5a6a82]">Início</span>
          <span className="text-right font-bold text-[#0d1b2e]">{formatDateTime(order.created_at)}</span>
        </div>
        <div aria-hidden="true" className="my-2 h-px bg-blue-200 sm:my-0 sm:h-8 sm:w-px" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:pl-3">
          <span className="shrink-0 font-semibold text-[#5a6a82]">Término previsto</span>
          <span className="text-right font-bold text-[#0d1b2e]">{forecastEnd ? formatDateTime(forecastEnd) : "Não configurado"}</span>
        </div>
      </div>
    </div>
  </div>;
}
