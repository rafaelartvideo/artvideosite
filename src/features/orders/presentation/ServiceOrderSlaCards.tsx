import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, History } from "lucide-react";
import { cn, formatDateTime, formatDurationHours, formatNumber } from "@/shared/domain/formatters";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import type { ServiceOrderSituationVisit } from "../infrastructure/order-situation-visits.repository";

export function formatElapsedHours(hours: number) {
  return formatDurationHours(hours);
}

function elapsedHours(start?: string | null, end?: string | null, now = Date.now()) {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : now;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, (endTime - startTime) / 3_600_000);
}

export function ServiceOrderSlaCards({
  order,
  slaHours,
  visits,
  onOpenRecords,
}: {
  order: any;
  slaHours: number | null;
  visits: ServiceOrderSituationVisit[];
  onOpenRecords: () => void;
}) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    setNow(Date.now());
    if (order.completed_at) return;
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [order.id, order.situation_id, order.situation_started_at, order.completed_at]);

  const currentSituationVisits = useMemo(
    () => visits
      .filter(visit => visit.situation_id === order.situation_id)
      .sort((left, right) => right.visit_number - left.visit_number),
    [visits, order.situation_id],
  );

  const endAt = order.completed_at || null;
  const situationStart = order.situation_started_at || order.updated_at || order.created_at;
  const situationStartTime = new Date(situationStart).getTime();
  const situationElapsed = elapsedHours(situationStart, endAt, now);
  const orderElapsed = elapsedHours(order.created_at, endAt, now);
  const orderStartTime = new Date(order.created_at).getTime();
  const forecastDays = Number(order.service_type?.forecast_days);
  const hasForecast = Number.isFinite(orderStartTime) && Number.isFinite(forecastDays) && forecastDays > 0;
  const forecastEnd = hasForecast ? new Date(orderStartTime + forecastDays * 86_400_000) : null;
  const validSla = slaHours != null && Number.isFinite(slaHours) && slaHours > 0;
  const situationForecastEnd = validSla && Number.isFinite(situationStartTime)
    ? new Date(situationStartTime + slaHours * 3_600_000)
    : null;
  const exceededBy = validSla ? Math.max(0, situationElapsed - slaHours) : 0;
  const usage = validSla ? situationElapsed / slaHours : 0;
  const state = !validSla ? "neutral" : usage > 1 ? "danger" : usage >= 0.8 ? "warning" : "success";
  const styles = {
    neutral: { card: "border-slate-300 bg-slate-50", icon: "bg-slate-200 text-slate-700", title: "text-slate-700", bar: "bg-slate-400", infoBorder: "border-slate-300" },
    success: { card: "border-emerald-300 bg-emerald-50", icon: "bg-emerald-100 text-emerald-700", title: "text-emerald-700", bar: "bg-emerald-500", infoBorder: "border-emerald-200" },
    warning: { card: "border-amber-400 bg-amber-50", icon: "bg-amber-100 text-amber-700", title: "text-amber-700", bar: "bg-amber-500", infoBorder: "border-amber-300" },
    danger: { card: "border-red-400 bg-red-50", icon: "bg-red-100 text-red-700", title: "text-red-700", bar: "bg-red-500", infoBorder: "border-red-300" },
  }[state];

  return <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    <AdminCard className={cn("p-4 sm:p-5", styles.card)}>
      <div className="flex min-w-0 items-start gap-3">
        <div className={cn("shrink-0 rounded-lg p-2", styles.icon)}>{state === "danger" ? <AlertTriangle size={18} /> : <Clock size={18} />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("break-words text-[10px] font-black uppercase tracking-wider", styles.title)}>Situação: {order.situation?.name || "Não definida"}</p>
            {currentSituationVisits.length > 1 && <span
              title={`${currentSituationVisits.length} passagens por esta situação`}
              className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-white px-1 text-[10px] font-black", styles.infoBorder, styles.title)}
            >{currentSituationVisits.length}</span>}
          </div>
          <p className="mt-1 break-words text-2xl font-black text-[#0d1b2e]">{formatElapsedHours(situationElapsed)}</p>
          <p className="break-words text-[11px] leading-relaxed text-[#5a6a82]">Tempo corrido nesta passagem pela situação</p>
        </div>
        <button
          type="button"
          onClick={onOpenRecords}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"
        >
          <History size={14} /> Registros
        </button>
      </div>

      <div className={cn("mt-4 flex min-w-0 flex-col rounded-lg border-2 bg-white/70 px-3 py-3 text-[11px] sm:flex-row sm:items-center", styles.infoBorder)}>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:pr-3">
          <span className="shrink-0 font-semibold text-[#5a6a82]">Início</span>
          <span className="break-words text-right font-bold text-[#0d1b2e]">{formatDateTime(situationStart)}</span>
        </div>
        <div aria-hidden="true" className="my-2 h-px bg-current opacity-15 sm:my-0 sm:h-8 sm:w-px" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:pl-3">
          <span className="shrink-0 font-semibold text-[#5a6a82]">Término previsto</span>
          <span className="break-words text-right font-bold text-[#0d1b2e]">{situationForecastEnd ? formatDateTime(situationForecastEnd) : "Não configurado"}</span>
        </div>
      </div>

      {validSla ? <>
        <div className="mt-4 flex min-w-0 flex-wrap justify-between gap-2 text-[11px]">
          <span className="font-semibold text-[#5a6a82]">Prazo: {formatElapsedHours(slaHours)}</span>
          {exceededBy > 0
            ? <span className="font-black text-red-700">Estourou: +{formatElapsedHours(exceededBy)}</span>
            : <span className={cn("font-bold", styles.title)}>{formatNumber(Math.max(0, 100 - usage * 100), { maximumFractionDigits: 0 }, "0")}% restante</span>}
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full border border-[#0d1b2e]/20 bg-white shadow-inner">
          <div className={cn("h-full rounded-full transition-all", styles.bar)} style={{ width: `${Math.min(100, Math.max(0, usage * 100))}%` }} />
        </div>
      </> : <p className="mt-4 break-words rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">Prazo de SLA não configurado.</p>}
    </AdminCard>

    <AdminCard className="border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0 rounded-lg bg-blue-100 p-2 text-[#0057e7]"><Clock size={18} /></div>
        <div className="min-w-0">
          <p className="break-words text-[10px] font-black uppercase tracking-wider text-[#0057e7]">Tempo total da ordem de serviço</p>
          <p className="mt-1 break-words text-2xl font-black text-[#0d1b2e]">{formatElapsedHours(orderElapsed)}</p>
          <p className="break-words text-[11px] leading-relaxed text-[#5a6a82]">{order.completed_at ? "Tempo encerrado na conclusão" : "Correndo desde a abertura da OS"}</p>
        </div>
      </div>
      <div className="mt-4 flex min-w-0 flex-col rounded-lg border-2 border-blue-200 bg-white/70 px-3 py-3 text-[11px] sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:pr-3">
          <span className="shrink-0 font-semibold text-[#5a6a82]">Início</span>
          <span className="break-words text-right font-bold text-[#0d1b2e]">{formatDateTime(order.created_at)}</span>
        </div>
        <div aria-hidden="true" className="my-2 h-px bg-blue-200 sm:my-0 sm:h-8 sm:w-px" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:pl-3">
          <span className="shrink-0 font-semibold text-[#5a6a82]">Término previsto</span>
          <span className="break-words text-right font-bold text-[#0d1b2e]">{forecastEnd ? formatDateTime(forecastEnd) : "Não configurado"}</span>
        </div>
      </div>
    </AdminCard>
  </div>;
}