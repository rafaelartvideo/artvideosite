import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, ExternalLink, Minus, PhoneCall, PhoneIncoming, PhoneOutgoing, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import {
  ARTVIDEO_ORGANIZATION_ID,
  callCustomer,
  callServiceOrder,
  formatCallDuration,
  formatUniqPhone,
  type UniqCall,
} from "../domain/uniq-call";
import { getActiveUniqCall, subscribeToUniqCalls } from "../infrastructure/uniq-call.repository";

function elapsedSeconds(call: UniqCall | null) {
  if (!call?.answered_at) return Math.max(0, call?.duration_seconds ?? 0);
  const answeredAt = new Date(call.answered_at).getTime();
  if (!Number.isFinite(answeredAt)) return Math.max(0, call.duration_seconds ?? 0);
  const end = call.ended_at ? new Date(call.ended_at).getTime() : Date.now();
  if (!Number.isFinite(end)) return Math.max(0, call.duration_seconds ?? 0);
  return Math.max(call.duration_seconds ?? 0, Math.floor((end - answeredAt) / 1000));
}

export function UniqCallOverlay() {
  const { activeOrganizationId, employee, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [call, setCall] = useState<UniqCall | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const enabled = activeOrganizationId === ARTVIDEO_ORGANIZATION_ID;
  const subscriberId = String((employee as any)?.uniq_subscriber_id || "").trim() || null;
  const canMonitorAll = hasPermission("orders.view_all") || hasPermission("employees.edit");
  const canReceiveCallState = Boolean(subscriberId || canMonitorAll);

  const refresh = useCallback(async () => {
    if (!enabled || !canReceiveCallState) {
      setCall(null);
      return;
    }
    const { data, error } = await getActiveUniqCall({ subscriberId, canMonitorAll });
    if (error) {
      console.error("Erro ao carregar chamada Uniq:", error);
      return;
    }
    setCall(data);
  }, [enabled, canReceiveCallState, subscriberId, canMonitorAll]);

  useEffect(() => {
    if (!enabled || !canReceiveCallState) {
      setCall(null);
      return;
    }
    void refresh();
    return subscribeToUniqCalls(() => void refresh());
  }, [enabled, canReceiveCallState, refresh]);

  useEffect(() => {
    setMinimized(false);
  }, [call?.uniq_call_id]);

  useEffect(() => {
    if (!call) {
      setSeconds(0);
      return;
    }
    const update = () => setSeconds(elapsedSeconds(call));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [call]);

  const customer = useMemo(() => call ? callCustomer(call) : null, [call]);
  const serviceOrder = useMemo(() => call ? callServiceOrder(call) : null, [call]);

  if (!enabled || !call) return null;

  const incoming = call.direction === "INGRESS";
  const customerName = customer?.full_name?.trim() || customer?.trade_name?.trim() || "Número não cadastrado";
  const phone = formatUniqPhone(call.remote_phone || call.remote_phone_digits);
  const directionLabel = incoming ? "Chamada recebida" : "Chamada realizada";
  const DirectionIcon = incoming ? PhoneIncoming : PhoneOutgoing;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-3 z-[90] flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-full border border-[#d9e1ec] bg-white px-3.5 py-2.5 text-left shadow-[0_14px_40px_rgba(13,27,46,0.18)] sm:bottom-5 sm:left-auto sm:right-5"
        aria-label="Expandir chamada em andamento"
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf8f0] text-[#15803d]">
          <PhoneCall size={17} />
          <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#16a34a]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-black text-[#0d1b2e]">{customerName}</span>
          <span className="block text-[11px] font-bold tabular-nums text-[#5a6a82]">{formatCallDuration(seconds)}</span>
        </span>
      </button>
    );
  }

  return (
    <section className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-3 right-3 z-[90] overflow-hidden rounded-2xl border border-[#d9e1ec] bg-white shadow-[0_20px_55px_rgba(13,27,46,0.2)] sm:bottom-5 sm:left-auto sm:right-5 sm:w-[360px]" aria-label="Chamada Uniq em andamento">
      <div className="flex items-center justify-between border-b border-[#e8edf4] bg-[#f8fafc] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eaf8f0] text-[#15803d]">
            <DirectionIcon size={17} />
            <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-[#f8fafc] bg-[#16a34a]" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-xs font-black text-[#0d1b2e]">{directionLabel}</p>
              <span className="rounded-full bg-[#eaf8f0] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#15803d]">Em andamento</span>
            </div>
            <p className="mt-0.5 text-[11px] font-bold tabular-nums text-[#5a6a82]">{formatCallDuration(seconds)}</p>
          </div>
        </div>
        <button type="button" onClick={() => setMinimized(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#5a6a82] transition hover:bg-[#e8eef8] hover:text-[#0d1b2e]" title="Minimizar" aria-label="Minimizar chamada">
          <Minus size={17} />
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf3ff] text-[#0057e7]">
            <UserRound size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-[#0d1b2e]">{customerName}</p>
            <p className="mt-0.5 text-xs font-semibold text-[#5a6a82]">{phone}</p>
            {customer ? <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#15803d]">Cliente identificado</p> : <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#b45309]">Telefone sem cadastro</p>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ClipboardList size={16} className="shrink-0 text-[#0057e7]" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#7a8799]">Ordem de serviço</p>
              <p className="truncate text-xs font-black text-[#0d1b2e]">{serviceOrder?.os_number != null ? `OS #${serviceOrder.os_number}` : "Nenhuma OS aberta vinculada"}</p>
            </div>
          </div>
          {serviceOrder?.id && (
            <button type="button" onClick={() => navigate(`/admin/orders/${serviceOrder.id}`)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0057e7] shadow-sm ring-1 ring-[#d9e1ec] transition hover:bg-[#edf3ff]" title="Abrir OS" aria-label="Abrir ordem de serviço">
              <ExternalLink size={14} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
