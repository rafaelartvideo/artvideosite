import { AlertTriangle, CheckCircle2, Clock3, History } from "lucide-react";
import { AdminCard, AdminPage, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { cn } from "@/shared/domain/formatters";
import { formatElapsedHours } from "./ServiceOrderSlaCards";
import type { ServiceOrderSituationVisit } from "../infrastructure/order-situation-visits.repository";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  if (exceededBy > 0) return { key: "danger", label: `Estourou +${formatElapsedHours(exceededBy)}`, elapsed, exceededBy };
  if (visit.exited_at) return { key: "success", label: "Encerrado no prazo", elapsed, exceededBy: 0 };
  return { key: "active", label: "Em andamento", elapsed, exceededBy: 0 };
}

export function OrderSituationRecordsPage({
  open,
  order,
  situationName,
  visits,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  order: any;
  situationName: string;
  visits: ServiceOrderSituationVisit[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return <AdminPage
    open={open}
    onClose={onClose}
    breadcrumb={`Ordens de Serviço > ${order?.os_number || "OS"}`}
    title={`Registros · ${situationName || "Situação"}`}
    subtitle="Histórico de todas as vezes em que esta OS entrou nesta situação"
    maxW="max-w-2xl"
  >
    <div className="space-y-4 p-5">
      {loading && <AdminCard className="p-5 text-sm font-semibold text-[#5a6a82]">Carregando registros...</AdminCard>}
      {!loading && error && <AdminCard className="border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error}</AdminCard>}
      {!loading && !error && visits.length === 0 && <AdminCard className="p-6 text-center">
        <History className="mx-auto mb-3 text-[#8b98aa]" size={24} />
        <p className="font-bold text-[#0d1b2e]">Nenhum registro encontrado</p>
        <p className="mt-1 text-sm text-[#5a6a82]">Os registros começarão a aparecer após a migration do histórico ser aplicada.</p>
      </AdminCard>}

      {!loading && !error && visits.map((visit) => {
        const state = visitState(visit);
        const styles = state.key === "danger"
          ? { card: "border-red-200 bg-red-50/70", icon: "bg-red-100 text-red-700", badge: "bg-red-100 text-red-700 border-red-200" }
          : state.key === "active"
            ? { card: "border-blue-200 bg-blue-50/70", icon: "bg-blue-100 text-[#0057e7]", badge: "bg-blue-100 text-[#0057e7] border-blue-200" }
            : { card: "border-emerald-200 bg-emerald-50/60", icon: "bg-emerald-100 text-emerald-700", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" };
        const slaHours = Number(visit.sla_hours_snapshot);
        const validSla = Number.isFinite(slaHours) && slaHours > 0;

        return <AdminCard key={visit.id} className={cn("p-4 sm:p-5", styles.card)}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className={cn("mt-0.5 shrink-0 rounded-lg p-2", styles.icon)}>
                {state.key === "danger" ? <AlertTriangle size={17} /> : state.key === "success" ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-[#0d1b2e]">{visit.visit_number}ª passagem</p>
                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase", styles.badge)}>{state.label}</span>
                </div>
                <p className="mt-1 text-xs text-[#5a6a82]">{visit.situation_name_snapshot}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b98aa]">Duração</p>
              <p className="mt-0.5 text-sm font-black text-[#0d1b2e]">{formatElapsedHours(state.elapsed)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-[#0d1b2e]/10 bg-white/80 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b98aa]">Entrada</p>
              <p className="mt-1 text-xs font-bold text-[#0d1b2e]">{formatDateTime(visit.entered_at)}</p>
            </div>
            <div className="rounded-lg border border-[#0d1b2e]/10 bg-white/80 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b98aa]">Saída</p>
              <p className="mt-1 text-xs font-bold text-[#0d1b2e]">{visit.exited_at ? formatDateTime(visit.exited_at) : "Situação atual"}</p>
            </div>
            <div className="rounded-lg border border-[#0d1b2e]/10 bg-white/80 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b98aa]">Prazo registrado</p>
              <p className="mt-1 text-xs font-bold text-[#0d1b2e]">{validSla ? formatElapsedHours(slaHours) : "Não configurado"}</p>
            </div>
            <div className="rounded-lg border border-[#0d1b2e]/10 bg-white/80 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b98aa]">Término previsto</p>
              <p className="mt-1 text-xs font-bold text-[#0d1b2e]">{visit.sla_due_at ? formatDateTime(visit.sla_due_at) : "Não configurado"}</p>
            </div>
          </div>

          {state.exceededBy > 0 && <div className="mt-3 rounded-lg border border-red-200 bg-white/80 px-3 py-2 text-xs font-black text-red-700">Tempo excedido nesta passagem: +{formatElapsedHours(state.exceededBy)}</div>}
        </AdminCard>;
      })}
    </div>
    <div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white px-5 py-4">
      <BtnSecondary onClick={onClose}>Voltar para a OS</BtnSecondary>
    </div>
  </AdminPage>;
}
