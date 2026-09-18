import { useMemo, useState } from "react";
import { Banknote, LockKeyhole, Minus, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FCurrencyInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { useFinanceCash } from "../application/useFinanceCash";
import type { FinancialAccount, FinancialCashSession } from "../domain/finance.types";

type CashAction = "open" | "supply" | "withdraw" | "close";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function actionTitle(action: CashAction) {
  if (action === "open") return "Abrir caixa";
  if (action === "supply") return "Suprimento";
  if (action === "withdraw") return "Sangria";
  return "Fechar caixa";
}

export function FinanceCashSection({ accounts }: { accounts: FinancialAccount[] }) {
  const { hasPermission } = useAuth();
  const cash = useFinanceCash();
  const eligibleAccounts = accounts.filter(item => item.is_active && item.allows_cash_session);
  const sessions = cash.sessionsQuery.data || [];
  const openByAccount = useMemo(() => new Map(
    sessions.filter(item => item.status === "open").map(item => [item.financial_account_id, item]),
  ), [sessions]);

  const canOpen = hasPermission("finance.cash.open");
  const canClose = hasPermission("finance.cash.close");
  const canSupply = hasPermission("finance.cash.supply");
  const canWithdraw = hasPermission("finance.cash.withdraw");

  const [dialog, setDialog] = useState<{ action: CashAction; account: FinancialAccount; session: FinancialCashSession | null } | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  if (eligibleAccounts.length === 0) return null;

  const pending = cash.openMutation.isPending || cash.adjustmentMutation.isPending || cash.closeMutation.isPending;
  const mutationError = cash.openMutation.error || cash.adjustmentMutation.error || cash.closeMutation.error;

  const openDialog = (action: CashAction, account: FinancialAccount, session: FinancialCashSession | null) => {
    setDialog({ action, account, session });
    setAmount("");
    setNote("");
    setMessage("");
  };

  const closeDialog = () => {
    if (pending) return;
    setDialog(null);
    setAmount("");
    setNote("");
    setMessage("");
  };

  const submit = async () => {
    if (!dialog) return;
    const numericAmount = Number(amount || 0);
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || ((dialog.action === "supply" || dialog.action === "withdraw") && numericAmount <= 0)) {
      setMessage(dialog.action === "supply" || dialog.action === "withdraw" ? "Informe um valor maior que zero." : "Informe o valor contado no caixa.");
      return;
    }
    if ((dialog.action === "supply" || dialog.action === "withdraw") && !note.trim()) {
      setMessage("Informe o motivo da movimentação.");
      return;
    }
    try {
      setMessage("");
      if (dialog.action === "open") {
        await cash.openMutation.mutateAsync({ accountId: dialog.account.id, countedAmount: numericAmount, note: note.trim() || null });
      } else if (dialog.action === "close") {
        if (!dialog.session) return;
        await cash.closeMutation.mutateAsync({ sessionId: dialog.session.id, countedAmount: numericAmount, reason: note.trim() || null });
      } else {
        if (!dialog.session) return;
        await cash.adjustmentMutation.mutateAsync({
          sessionId: dialog.session.id,
          action: dialog.action,
          amount: numericAmount,
          note: note.trim(),
        });
      }
      closeDialog();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação do caixa.");
    }
  };

  return <AdminCard>
    <AdminCardHeader>
      <div>
        <h3 className="text-sm font-black text-[#0d1b2e]">Caixa físico</h3>
        <p className="mt-1 text-xs text-[#5a6a82]">Abertura, suprimentos, sangrias e fechamento das contas que usam sessão de caixa.</p>
      </div>
    </AdminCardHeader>
    <AdminCardContent className="space-y-3">
      {cash.sessionsQuery.isLoading ? <p className="text-sm text-[#5a6a82]">Carregando caixas...</p> : eligibleAccounts.map(account => {
        const session = openByAccount.get(account.id) || null;
        return <div key={account.id} className="rounded-xl border border-[#0d1b2e]/8 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black text-[#0d1b2e]">{account.name}</p>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${session ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {session ? "Aberto" : "Fechado"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5a6a82]">Saldo atual: <strong>{formatCurrency(Number(account.balance || 0))}</strong></p>
              {session && <p className="mt-1 text-xs text-[#5a6a82]">Aberto em {formatDateTime(session.opened_at)} · contado na abertura: {formatCurrency(session.opening_counted_amount)}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {!session && canOpen && <AdminButton size="sm" onClick={() => openDialog("open", account, null)}><Banknote size={14} /> Abrir caixa</AdminButton>}
              {session && canSupply && <AdminButton size="sm" variant="secondary" onClick={() => openDialog("supply", account, session)}><Plus size={14} /> Suprimento</AdminButton>}
              {session && canWithdraw && <AdminButton size="sm" variant="secondary" onClick={() => openDialog("withdraw", account, session)}><Minus size={14} /> Sangria</AdminButton>}
              {session && canClose && <AdminButton size="sm" onClick={() => openDialog("close", account, session)}><LockKeyhole size={14} /> Fechar</AdminButton>}
            </div>
          </div>
        </div>;
      })}
      {cash.sessionsQuery.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cash.sessionsQuery.error instanceof Error ? cash.sessionsQuery.error.message : "Não foi possível carregar os caixas."}</div>}
    </AdminCardContent>

    {dialog && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-black text-[#0d1b2e]">{actionTitle(dialog.action)}</h2>
          <p className="mt-1 text-xs text-[#5a6a82]">{dialog.account.name}</p>
        </div>
        <div className="space-y-4 p-5">
          <FCurrencyInput
            label={dialog.action === "open" || dialog.action === "close" ? "Valor contado no caixa" : "Valor"}
            value={amount}
            onChange={(event: any) => setAmount(event.target.value)}
          />
          <FTextarea
            label={dialog.action === "supply" || dialog.action === "withdraw" ? "Motivo *" : "Observação / justificativa"}
            value={note}
            onChange={(event: any) => setNote(event.target.value)}
            rows={3}
            placeholder={dialog.action === "close" ? "Obrigatória apenas se houver diferença no fechamento" : undefined}
          />
          {(message || mutationError) && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message || (mutationError instanceof Error ? mutationError.message : "Não foi possível concluir a operação.")}</div>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">
          <AdminButton variant="secondary" onClick={closeDialog} disabled={pending}>Cancelar</AdminButton>
          <AdminButton onClick={() => void submit()} loading={pending} loadingText="Salvando...">Confirmar</AdminButton>
        </div>
      </div>
    </div>}
  </AdminCard>;
}
