import { useState } from "react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency } from "@/shared/domain/formatters";
import { FCurrencyInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { useFinanceCash } from "../application/useFinanceCash";
import type { FinancialAccount, FinancialCashSession } from "../domain/finance.types";

export type FinanceCashAction = "open" | "supply" | "withdraw" | "close";

function actionTitle(action: FinanceCashAction) {
  if (action === "open") return "Abrir caixa";
  if (action === "supply") return "Suprimento";
  if (action === "withdraw") return "Sangria";
  return "Fechar caixa";
}

/** Exclusivamente o diálogo da operação, acionado na própria linha de Contas e Caixas. */
export function FinanceCashActionDialog({
  account, session, action, onClose,
}: {
  account: FinancialAccount;
  session: FinancialCashSession | null;
  action: FinanceCashAction;
  onClose: () => void;
}) {
  const cash = useFinanceCash(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; note?: string }>({});
  const pending = cash.openMutation.isPending || cash.adjustmentMutation.isPending || cash.closeMutation.isPending;

  const submit = async () => {
    const numericAmount = Number(amount || 0);
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || (["supply", "withdraw"].includes(action) && numericAmount <= 0)) {
      setFieldErrors(current => ({ ...current, amount: ["supply", "withdraw"].includes(action) ? "Informe um valor maior que zero." : "Informe o valor contado no caixa." }));
      return;
    }
    if (["supply", "withdraw"].includes(action) && !note.trim()) {
      setFieldErrors(current => ({ ...current, note: "Informe o motivo da movimentação." }));
      return;
    }
    if (action !== "open" && !session) {
      notifyAdmin("A sessão do caixa não está aberta. Atualize os dados e tente novamente.", "error");
      return;
    }
    try {
      setFieldErrors({});
      if (action === "open") {
        await cash.openMutation.mutateAsync({ accountId: account.id, countedAmount: numericAmount, note: note.trim() || null });
      } else if (action === "close") {
        await cash.closeMutation.mutateAsync({ sessionId: session!.id, countedAmount: numericAmount, reason: note.trim() || null });
      } else {
        await cash.adjustmentMutation.mutateAsync({ sessionId: session!.id, action, amount: numericAmount, note: note.trim() });
      }
      notifyAdmin(actionTitle(action) + " registrado com sucesso.", "success");
      onClose();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível concluir a operação do caixa."), "error");
    }
  };

  return <AdminDialog
    open
    title={actionTitle(action)}
    description={account.name + " · Saldo " + formatCurrency(Number(account.balance || 0))}
    onClose={() => { if (!pending) onClose(); }}
    className="max-w-lg"
    footer={<div className="flex flex-wrap justify-end gap-2">
      <AdminButton variant="secondary" onClick={onClose} disabled={pending}>Cancelar</AdminButton>
      <AdminButton onClick={() => void submit()} loading={pending}>Confirmar</AdminButton>
    </div>}
  >
    <div className="space-y-4">
      <FCurrencyInput
        label={action === "open" || action === "close" ? "Valor contado no caixa" : "Valor"}
        error={fieldErrors.amount}
        value={amount}
        onChange={(event: any) => { setFieldErrors(current => ({ ...current, amount: undefined })); setAmount(event.target.value); }}
      />
      <FTextarea
        label={action === "supply" || action === "withdraw" ? "Motivo *" : "Observação / justificativa"}
        error={fieldErrors.note}
        value={note}
        onChange={(event: any) => { setFieldErrors(current => ({ ...current, note: undefined })); setNote(event.target.value); }}
        rows={3}
        placeholder={action === "close" ? "Obrigatória apenas se houver diferença no fechamento" : undefined}
      />
    </div>
  </AdminDialog>;
}
