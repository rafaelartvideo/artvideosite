import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { FCurrencyInput, FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
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
  const [fieldErrors, setFieldErrors] = useState<{ from?: string; to?: string; amount?: string; occurredAt?: string }>({});

  useEffect(() => {
    if (!open) return;
    setFromId(activeAccounts[0]?.id || "");
    setToId(activeAccounts.find(item => item.id !== activeAccounts[0]?.id)?.id || "");
    setAmount("");
    setOccurredAt(localDateTimeInput());
    setNote("");
    setFieldErrors({});
  }, [open]);

  if (!open) return null;

  const save = async () => {
    const numericAmount = Number(amount || 0);
    const nextErrors: typeof fieldErrors = {};
    if (!fromId) nextErrors.from = "Selecione a conta de origem.";
    if (!toId) nextErrors.to = "Selecione a conta de destino.";
    if (fromId && toId && fromId === toId) nextErrors.to = "A conta de destino deve ser diferente da origem.";
    if (!(numericAmount > 0)) nextErrors.amount = "Informe um valor maior que zero.";
    if (!occurredAt) nextErrors.occurredAt = "Informe a data e hora da transferência.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      setFieldErrors({});
      await onSave({ from_account_id: fromId, to_account_id: toId, amount: numericAmount, occurred_at: occurredAt, note: note.trim() || null });
      onClose();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível realizar a transferência."), "error");
    }
  };

  const options = activeAccounts.map(item => ({ value: item.id, label: `${item.name} · ${Number(item.balance || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` }));
  return <AdminDialog
    open
    onClose={onClose}
    title="Nova transferência"
    description="Movimenta saldo entre duas contas sem gerar receita ou despesa."
    className="max-w-2xl"
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton>
      <AdminButton onClick={save} loading={saving} loadingText="Transferindo...">Transferir</AdminButton>
    </div>}
  >
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><FSelect label="Conta de origem" required error={fieldErrors.from} value={fromId} onChange={(event: any) => { setFieldErrors(current => ({ ...current, from: undefined })); setFromId(event.target.value); }} options={options} /><FSelect label="Conta de destino" required error={fieldErrors.to} value={toId} onChange={(event: any) => { setFieldErrors(current => ({ ...current, to: undefined })); setToId(event.target.value); }} options={options} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><FCurrencyInput label="Valor" required error={fieldErrors.amount} value={amount} onChange={(event: any) => { setFieldErrors(current => ({ ...current, amount: undefined })); setAmount(event.target.value); }} /><FInput label="Data e hora" required error={fieldErrors.occurredAt} type="datetime-local" value={occurredAt} onChange={(event: any) => { setFieldErrors(current => ({ ...current, occurredAt: undefined })); setOccurredAt(event.target.value); }} /></div>
      <FTextarea label="Observação" value={note} onChange={(event: any) => setNote(event.target.value)} placeholder="Opcional" />
    </div>
  </AdminDialog>;
}