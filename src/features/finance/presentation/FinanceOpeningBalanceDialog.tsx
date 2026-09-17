import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import type { FinancialAccount } from "../domain/finance.types";

export function FinanceOpeningBalanceDialog({
  open,
  account,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  account: FinancialAccount | null;
  saving: boolean;
  error?: unknown;
  onClose: () => void;
  onSave: (amount: number, note: string | null) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setNote("");
    setMessage("");
  }, [open, account?.id]);

  if (!open || !account) return null;

  const submit = async () => {
    const normalized = amount.trim().replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setMessage("Informe um saldo inicial válido.");
      return;
    }
    try {
      setMessage("");
      await onSave(parsed, note.trim() || null);
      onClose();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível configurar o saldo inicial.");
    }
  };

  const errorText = message || (error instanceof Error ? error.message : "");
  return <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div><h2 className="text-lg font-black text-[#0d1b2e]">Configurar saldo inicial</h2><p className="mt-1 text-xs text-[#5a6a82]">{account.name} · esta configuração só pode ser feita uma vez.</p></div>
        <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="space-y-4 p-5">
        <FInput label="Saldo inicial" required value={amount} onChange={(event: any) => setAmount(event.target.value)} placeholder="0,00" inputMode="decimal" />
        <FTextarea label="Observação" value={note} onChange={(event: any) => setNote(event.target.value)} placeholder="Ex.: saldo existente antes da implantação do Financeiro" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">Use valor positivo para saldo disponível e negativo para saldo devedor. Depois de confirmado, ajustes devem ser feitos por movimentações financeiras, não alterando o saldo inicial.</p>
        {errorText && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</div>}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton><AdminButton onClick={submit} loading={saving} loadingText="Configurando...">Confirmar saldo inicial</AdminButton></div>
    </div>
  </div>;
}
