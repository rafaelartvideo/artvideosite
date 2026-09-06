import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, History } from "lucide-react";
import { AdminCard, AdminCardHeader, AdminPage, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { cn, formatDateTime } from "@/shared/domain/formatters";
import type { ServiceOrderSituationVisit } from "../infrastructure/order-situation-visits.repository";

function formatElapsedHours(hours: number) {
  let totalMinutes = Math.max(0, Math.floor(Number(hours) * 60 + 0.000001));
  if (totalMinutes < 24 * 60) {
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  const units = [
    { singular: "ano", plural: "anos", minutes: 365 * 24 * 60 },
    { singular: "mês", plural: "meses", minutes: 30 * 24 * 60 },
    { singular: "semana", plural: "semanas", minutes: 7 * 24 * 60 },
    { singular: "dia", plural: "dias", minutes: 24 * 60 },
  ];
  const parts: string[] = [];
  for (const unit of units) {
    const amount = Math.floor(totalMinutes / unit.minutes);
    if (!amount) continue;
    parts.push(`${amount} ${amount === 1 ? unit.singular : unit.plural}`);
    totalMinutes %= unit.minutes;
  }
  parts.push(`${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}h`);
  parts.push(`${String(totalMinutes % 60).padStart(2, "0")}min`);
  return parts.join(", ");
}

function elapsedHours(start?: string | null, end?: string | null) {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, (endTime - startTime) / 3_600_000);
}

function visitState(visit: ServiceOrderSituationVisit) {
  const elapsed = elapsedHours(visit.entered_at, visit.exited_at);
  const slaHours = Number(visit.sla_hours_snapshot);
  const validSla = Number.isFinite(slaHours) && slaHours > 0;
  const exceededBy = validSla ? Math.max(0, elapsed - slaHours) : 0;
  if (exceededBy > 0) return { key: "danger", label: `Estourou +${formatElapsedHours(exceededBy)}`, elapsed };
  if (!validSla && visit.exited_at) return { key: "neutral", label: "Encerrado · sem SLA", elapsed };
  if (!validSla) return { key: "active", label: "Em andamento · sem SLA", elapsed };
  if (visit.exited_at) return { key: "success", label: "No prazo", elapsed };
  return { key: "active", label: "Em andamento", elapsed };
}

export function OrderSituationRecordsPage({
  open,
  order,
  visits,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  order: any;
  visits: ServiceOrderSituationVisit[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const [browserBottomInset, setBrowserBottomInset] = useState(0);

  useEffect(() => {
    if (!open) { setBrowserBottomInset(0); return; }
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateBottomInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setBrowserBottomInset(Math.min(110, Math.round(inset)));
    };
    updateBottomInset();
    viewport.addEventListener("resize", updateBottomInset);
    viewport.addEventListener("scroll", updateBottomInset);
    window.addEventListener("resize", updateBottomInset);
    return () => {
      viewport.removeEventListener("resize", updateBottomInset);
      viewport.removeEventListener("scroll", updateBottomInset);
      window.removeEventListener("resize", updateBottomInset);
    };
  }, [open]);

  if (!open) return null;

  const grouped = visits.reduce<Record<string, ServiceOrderSituationVisit[]>>((acc, visit) => {
    const key = visit.situation_id || `removed:${visit.situation_name_snapshot}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(visit);
    return acc;
  }, {});

  const groups = Object.values(grouped)
    .map(group => [...group].sort((a, b) => a.visit_number - b.visit_number))
    .sort((a, b) => new Date(b[b.length - 1]?.entered_at || 0).getTime() - new Date(a[a.length - 1]?.entered_at || 0).getTime());

  return <AdminPage
    open
    onClose={onClose}
    breadcrumb={`Ordens de Serviço > ${order?.os_number || "OS"}`}
    title="Registros de SLA"
    subtitle="Histórico das passagens da ordem de serviço pelas situações"
    maxW="max-w-4xl"
  >
    <div className="min-w-0 max-w-full space-y-4 overflow-hidden p-5">
      {loading && <p className="py-8 text-center text-sm text-[#5a6a82]">Carregando registros...</p>}
      {!loading && error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs font-semibold text-red-700">{error}</div>}
      {!loading && !error && visits.length === 0 && <div className="rounded-xl border border-dashed border-[#0d1b2e]/10 px-3 py-10 text-center text-xs text-[#5a6a82]">
        <History className="mx-auto mb-2 text-[#8b98aa]" size={22} />
        Nenhum registro de SLA nesta OS.
      </div>}

      {!loading && !error && groups.map(group => {
        const first = group[0];
        const current = group.some(visit => !visit.exited_at);
        return <AdminCard key={first.situation_id || first.situation_name_snapshot} className={cn("min-w-0 max-w-full shadow-none", current && "border-[#0057e7]/30 bg-[#f7faff]")}>
          <AdminCardHeader className={current ? "bg-[#f7faff]" : undefined}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: first.situation_color_snapshot || "#94a3b8" }} />
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-[#0d1b2e]">{first.situation_name_snapshot}</p>
                <p className="text-[10px] text-[#5a6a82]">{current ? "Situação atual" : "Situação da OS"} · {group.length} {group.length === 1 ? "passagem" : "passagens"}</p>
              </div>
            </div>
          </AdminCardHeader>

          <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            {group.map(visit => {
              const state = visitState(visit);
              const slaHours = Number(visit.sla_hours_snapshot);
              const validSla = Number.isFinite(slaHours) && slaHours > 0;
              const stateStyles = state.key === "danger"
                ? "border-red-200 text-red-700 bg-red-50"
                : state.key === "active"
                  ? "border-blue-200 text-[#0057e7] bg-[#f7faff]"
                  : state.key === "neutral"
                    ? "border-slate-200 text-slate-600 bg-slate-50"
                    : "border-emerald-200 text-emerald-700 bg-emerald-50";

              return <div key={visit.id} className="min-w-0 rounded-xl border border-[#0d1b2e]/10 bg-white p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-[#0d1b2e]">{visit.visit_number}ª passagem</p>
                    <p className="mt-0.5 text-[10px] text-[#7c899c]">{formatDateTime(visit.entered_at)}</p>
                  </div>
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase", stateStyles)}>
                    {state.key === "danger" ? <AlertTriangle size={10} /> : state.key === "active" ? <Clock3 size={10} /> : <CheckCircle2 size={10} />}
                    {state.label}
                  </span>
                </div>

                <div className="mt-3 space-y-2 border-t border-[#0d1b2e]/7 pt-2.5 text-[11px]">
                  <div className="flex min-w-0 items-center justify-between gap-3"><span className="text-[#7c899c]">Saída</span><span className="break-words text-right font-bold text-[#0d1b2e]">{visit.exited_at ? formatDateTime(visit.exited_at) : "Em andamento"}</span></div>
                  <div className="flex min-w-0 items-center justify-between gap-3"><span className="text-[#7c899c]">Duração</span><span className="font-black text-[#0d1b2e]">{formatElapsedHours(state.elapsed)}</span></div>
                  <div className="flex min-w-0 items-center justify-between gap-3"><span className="text-[#7c899c]">Prazo</span><span className="font-bold text-[#0d1b2e]">{validSla ? formatElapsedHours(slaHours) : "Não configurado"}</span></div>
                  {visit.sla_due_at && <div className="flex min-w-0 items-center justify-between gap-3"><span className="text-[#7c899c]">Previsão</span><span className="break-words text-right font-bold text-[#0d1b2e]">{formatDateTime(visit.sla_due_at)}</span></div>}
                </div>
              </div>;
            })}
          </div>
        </AdminCard>;
      })}
    </div>

    <div aria-hidden="true" className="h-[5.5rem] md:hidden" />
    <div
      className="fixed inset-x-0 z-[70] border-t border-[#0d1b2e]/10 bg-white/95 px-3 pt-3 shadow-[0_-10px_30px_rgba(13,27,46,0.10)] backdrop-blur md:sticky md:bottom-0 md:z-auto md:bg-white md:px-5 md:py-4 md:shadow-none md:backdrop-blur-none"
      style={{ bottom: browserBottomInset ? `${browserBottomInset}px` : 0, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto w-full max-w-6xl"><BtnSecondary onClick={onClose} className="w-full justify-center md:w-auto">Voltar para a OS</BtnSecondary></div>
    </div>
  </AdminPage>;
}
