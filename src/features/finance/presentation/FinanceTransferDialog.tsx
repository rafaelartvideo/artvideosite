import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import type { FinancialAccount, FinancialTransferDraft } from "../domain/finance.types";

function localDateTimeInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function FinanceTransferDialog({
  open,
  accounts,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  accounts: FinancialAccount[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: FinancialTransferDraft) => Promise<void>;
}) {
  const activeAccounts = accounts.filter(item => item.is_active);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeInput());
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setFromId(activeAccounts[0]?.id || "");
    setToId(activeAccounts.find(item => item.id !== activeAccounts[0]?.id)?.id || "");
    setAmount("");
    setOccurredAt(localDateTimeInput());
    setNote("");
    setMessage("");
  }, [open]);

  if (!open) return null;

  const save = async () => {
    const numericAmount = Number(amount || 0);
    if (!fromId || !toId) { setMessage("Selecione as contas de origem e destino."); return; }
    if (fromId === toId) { setMessage("As contas de origem e destino devem ser diferentes."); return; }
    if (!(numericAmount > 0)) { setMessage("Informe um valor maior que zero."); return; }
    try {
      setMessage("");
      await onSave({ from_account_id: fromId, to_account_id: toId, amount: numericAmount, occurred_at: occurredAt, note: note.trim() || null });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível realizar a transferência.");
    }
  };

  const options = activeAccounts.map(item => ({ value: item.id, label: `${item.name} · ${Number(item.balance || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` }));
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-lg font-black text-[#0d1b2e]">Nova transferência</h2><p className="mt-1 text-xs text-[#5a6a82]">Movimenta saldo entre duas contas sem gerar receita ou despesa.</p></div><button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button></div>
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2"><FSelect label="Conta de origem" required value={fromId} onChange={(event: any) => setFromId(event.target.value)} options={options} /><FSelect label="Conta de destino" required value={toId} onChange={(event: any) => setToId(event.target.value)} options={options} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><FInput label="Valor" required type="number" min="0.01" step="0.01" value={amount} onChange={(event: any) => setAmount(event.target.value)} /><FInput label="Data e hora" required type="datetime-local" value={occurredAt} onChange={(event: any) => setOccurredAt(event.target.value)} /></div>
        <FTextarea label="Observação" value={note} onChange={(event: any) => setNote(event.target.value)} placeholder="Opcional" />
        {message && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton><AdminButton onClick={save} loading={saving} loadingText="Transferindo...">Transferir</AdminButton></div>
    </div>
  </div>;
}
