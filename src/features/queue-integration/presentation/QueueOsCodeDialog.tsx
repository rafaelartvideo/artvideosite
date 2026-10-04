import { useEffect, useState } from "react";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import {
  QueueIntegrationError,
  reserveQueueOsCode,
  type QueueIntegrationSettings,
  type QueueReservation,
} from "../infrastructure/queue-integration.repository";

export function QueueOsCodeDialog({
  open,
  organizationId,
  settings,
  canManagerOverride,
  onValidated,
  onOverride,
  onCancel,
}: {
  open: boolean;
  organizationId: string;
  settings: QueueIntegrationSettings;
  canManagerOverride: boolean;
  onValidated: (reservation: QueueReservation) => void;
  onOverride: (reason: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [queueUnavailable, setQueueUnavailable] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setReason("");
    setError("");
    setQueueUnavailable(false);
    setBusy(false);
  }, [open]);

  const canOverride = queueUnavailable && (
    settings.outage_policy === "allow"
    || (settings.outage_policy === "manager_override" && canManagerOverride)
  );

  const validate = async () => {
    if (!/^\d{4}$/.test(code)) {
      setError("Informe os 4 dígitos do código entregue junto com a senha.");
      return;
    }
    setBusy(true);
    setError("");
    setQueueUnavailable(false);
    try {
      const reservation = await reserveQueueOsCode(organizationId, code);
      onValidated(reservation);
    } catch (cause) {
      const integrationError = cause instanceof QueueIntegrationError ? cause : null;
      setQueueUnavailable(integrationError?.code === "queue_unavailable");
      setError(cause instanceof Error ? cause.message : "Não foi possível validar o código da fila.");
    } finally {
      setBusy(false);
    }
  };

  const override = () => {
    const normalized = reason.trim();
    if (!normalized) {
      setError("Informe o motivo para abrir a OS sem o código da fila.");
      return;
    }
    onOverride(normalized);
  };

  return <AdminDialog
    open={open}
    onClose={() => { if (!busy) onCancel(); }}
    title="Código da Fila"
    description="Informe o código de 4 dígitos entregue ao cliente. Ele será reservado para esta OS e não poderá ser reutilizado."
    minimizedDescription={code ? `Código ${code}` : "Aguardando código"}
    minimizable={!busy}
    className="max-w-md"
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><BtnSecondary onClick={onCancel} disabled={busy}>Cancelar</BtnSecondary>         <BtnPrimary onClick={validate} loading={busy} loadingText="Validando..." disabled={code.length !== 4}>Validar código</BtnPrimary></div>}
  >
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Código</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          maxLength={4}
          disabled={busy}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, "").slice(0, 4));
            setError("");
            setQueueUnavailable(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) void validate();
          }}
          placeholder="0000"
          className={`${INPUT} text-center font-mono text-2xl font-bold tracking-[0.45em]`}
        />
      </label>

      {error && <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {canOverride && <div className="space-y-2 border-t border-[#0d1b2e]/10 pt-4">
        <p className="text-sm font-semibold text-[#0d1b2e] dark:text-white">Contingência</p>
        <p className="text-xs leading-5 text-[#5a6a82] dark:text-slate-400">A Fila está indisponível. Esta política permite continuar somente com uma justificativa registrada na OS.</p>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, 500))}
          disabled={busy}
          rows={3}
          className={INPUT}
          placeholder="Motivo da liberação excepcional"
        />
        <BtnSecondary onClick={override} disabled={busy}>Abrir sem código</BtnSecondary>
      </div>}
    </div>

  </AdminDialog>;
}
