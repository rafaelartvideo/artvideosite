import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn } from "@/shared/domain/formatters";

export function OrderUndoSolutionDialog({
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
    title="Desfazer solução"
    description={`Desfaça a solução ativa da OS ${order?.os_number || ""} sem alterar a situação atual.`}
    className="max-w-lg"
    footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <BtnSecondary disabled={loading} onClick={onClose}>Cancelar</BtnSecondary>
      <BtnPrimary
        disabled={loading || !valid}
        aria-busy={loading || undefined}
        onClick={() => void onConfirm(reason.trim())}
        className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
      >
        <RotateCcw size={15} /> {loading ? "Desfazendo..." : "Desfazer solução"}
      </BtnPrimary>
    </div>}
  >
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <p>As peças utilizadas ficarão como <strong>devolução pendente</strong>. Elas só voltarão ao saldo do estoque quando o estoquista confirmar o recebimento físico.</p>
      </div>
      <div className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] px-3 py-2.5 text-xs text-[#5a6a82]">
        Diagnóstico, solução e fotos deixarão a solução ativa, mas continuarão disponíveis em <strong>Registros da solução</strong>.
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5a6a82]">Motivo *</span>
        <textarea
          autoFocus
          value={reason}
          onChange={event => setReason(event.target.value)}
          rows={5}
          maxLength={1000}
          disabled={loading}
          placeholder="Informe por que a solução está sendo desfeita..."
          className={cn(INPUT, "h-auto min-h-28 resize-y text-sm")}
        />
        <div className="mt-1 flex justify-between gap-3 text-[10px] text-[#7c899c]"><span>Mínimo de 3 caracteres.</span><span>{reason.length}/1000</span></div>
      </label>
    </div>
  </AdminDialog>;
}
