import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn } from "@/shared/domain/formatters";

export function OrderCancelDialog({
  order,
  open,
  loading = false,
  onClose,
  onConfirm,
}: {
  order: any;
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open, order?.id]);

  if (!open) return null;

  const valid = reason.trim().length >= 3;
  return <AdminDialog
    open
    onClose={() => { if (!loading) onClose(); }}
    title="Cancelar OS"
    description={`Confirme o cancelamento da OS ${order?.os_number || ""}. Esta ação altera o status para Cancelada.`}
    className="max-w-lg"
    footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <BtnSecondary disabled={loading} onClick={onClose}>Voltar</BtnSecondary>
      <BtnPrimary
        disabled={loading || !valid}
        aria-busy={loading || undefined}
        onClick={() => void onConfirm(reason.trim())}
        className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
      >
        {loading ? "Cancelando..." : "Confirmar cancelamento"}
      </BtnPrimary>
    </div>}
  >
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <p>Após confirmar, a OS ficará cancelada e não poderá ser concluída.</p>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5a6a82]">Justificativa</span>
        <textarea
          autoFocus
          value={reason}
          onChange={event => setReason(event.target.value)}
          rows={5}
          maxLength={1000}
          disabled={loading}
          placeholder="Informe o motivo do cancelamento..."
          className={cn(INPUT, "h-auto min-h-28 resize-y text-sm")}
        />
        <div className="mt-1 flex justify-between gap-3 text-[10px] text-[#7c899c]"><span>Mínimo de 3 caracteres.</span><span>{reason.length}/1000</span></div>
      </label>
    </div>
  </AdminDialog>;
}
