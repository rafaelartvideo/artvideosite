import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { FCurrencyInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import type { FinancialAccount } from "../domain/finance.types";

function parseMoneyInput(value: string) {
  const raw = value.trim();
  if (!raw) return Number.NaN;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  return Number(normalized);
}

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
  const [amountError, setAmountError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setNote("");
    setAmountError("");
  }, [open, account?.id]);

  if (!open || !account) return null;

  const submit = async () => {
    const parsed = parseMoneyInput(amount);
    if (!Number.isFinite(parsed)) {
      setAmountError("Informe um saldo inicial válido.");
      return;
    }
    try {
      setAmountError("");
      await onSave(parsed, note.trim() || null);
      onClose();
    } catch (caught) {
      notifyAdmin(systemErrorMessage(caught, "Não foi possível configurar o saldo inicial."), "error");
    }
  };

  const errorText = error ? systemErrorMessage(error) : "";
  return <AdminDialog
    open
    onClose={onClose}
    title="Configurar saldo inicial"
    description={`${account.name} · esta configuração só pode ser feita uma vez.`}
    minimizedDescription={`${account.name}${Number.isFinite(parseMoneyInput(amount)) ? ` · ${parseMoneyInput(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}`}
    minimizable={!saving}
    className="max-w-lg"
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton>
      <AdminButton onClick={submit} loading={saving} loadingText="Configurando...">Confirmar saldo inicial</AdminButton>
    </div>}
  >
    <div className="space-y-4">
      <FCurrencyInput label="Saldo inicial" required allowNegative error={amountError} value={amount} onChange={(event: any) => { setAmountError(""); setAmount(event.target.value); }} />
      <FTextarea label="Observação" value={note} onChange={(event: any) => setNote(event.target.value)} placeholder="Ex.: saldo existente antes da implantação do Financeiro" />
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">Use valor positivo para saldo disponível e negativo para saldo devedor. Depois de confirmado, ajustes devem ser feitos por movimentações financeiras, não alterando o saldo inicial.</p>
      {errorText && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</div>}
    </div>
  </AdminDialog>;
}