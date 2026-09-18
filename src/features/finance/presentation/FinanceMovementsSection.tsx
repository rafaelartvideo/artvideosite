import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, RotateCcw, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminCardToolbar } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { useFinanceMovements } from "../application/useFinanceMovements";
import type { FinancialMovementType, FinancialTransferDraft } from "../domain/finance.types";
import { FinanceTransferDialog } from "./FinanceTransferDialog";

const MOVEMENT_LABELS: Record<FinancialMovementType, string> = {
  opening_balance: "Saldo inicial",
  receipt: "Recebimento",
  payment: "Pagamento",
  fee: "Taxa financeira",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
  reversal: "Estorno",
  supply: "Suprimento",
  withdraw: "Sangria",
  cash_adjustment: "Ajuste de caixa",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

export function FinanceMovementsSection() {
  const { hasPermission } = useAuth();
  const foundation = useFinanceFoundation();
  const finance = useFinanceMovements();
  const canTransfer = hasPermission("finance.transfers.create");
  const canConfirmSettlements = hasPermission("finance.settlements.create");
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [transferOpen, setTransferOpen] = useState(false);
  const [reverseTransferId, setReverseTransferId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [message, setMessage] = useState("");

  const balances = finance.balancesQuery.data || {};
  const accounts = (foundation.accountsQuery.data || []).map(item => ({ ...item, balance: Number(balances[item.id] || 0) }));
  const accountById = new Map(accounts.map(item => [item.id, item]));
  const movements = finance.movementsQuery.data || [];
  const transfers = finance.transfersQuery.data || [];
  const scheduledSettlements = finance.scheduledSettlementsQuery.data || [];
  const totalBalance = accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return movements.filter(item => {
      if (accountFilter !== "all" && item.financial_account_id !== accountFilter) return false;
      if (!term) return true;
      return [item.description_snapshot, MOVEMENT_LABELS[item.movement_type], accountById.get(item.financial_account_id)?.name]
        .some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [movements, search, accountFilter, accounts.length]);
  const error = finance.movementsQuery.error || finance.balancesQuery.error || finance.transfersQuery.error || finance.scheduledSettlementsQuery.error || finance.transferMutation.error || finance.reverseTransferMutation.error || finance.confirmScheduledSettlementMutation.error;
  const errorText = message || (error instanceof Error ? error.message : "");

  const saveTransfer = async (draft: FinancialTransferDraft) => {
    await finance.transferMutation.mutateAsync(draft);
  };

  const reverseTransfer = async () => {
    if (!reverseTransferId) return;
    if (!reverseReason.trim()) { setMessage("Informe o motivo do estorno da transferência."); return; }
    try {
      setMessage("");
      await finance.reverseTransferMutation.mutateAsync({ id: reverseTransferId, reason: reverseReason.trim() });
      setReverseTransferId(null);
      setReverseReason("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível estornar a transferência.");
    }
  };

  const loading = finance.movementsQuery.isLoading || finance.balancesQuery.isLoading || foundation.accountsQuery.isLoading;
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black text-[#0d1b2e]">Movimentações</h2><p className="mt-1 text-xs text-[#5a6a82]">Livro financeiro imutável de entradas, saídas, taxas, transferências e estornos.</p></div>{canTransfer && accounts.filter(item => item.is_active).length >= 2 && <AdminButton onClick={() => setTransferOpen(true)}><ArrowRightLeft size={16} /> Nova transferência</AdminButton>}</div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <AdminCard className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Saldo total</p><p className="mt-1 text-xl font-black text-[#0057e7]">{formatCurrency(totalBalance)}</p><p className="mt-1 text-xs text-[#5a6a82]">Soma dos movimentos registrados nas contas.</p></AdminCard>
      {accounts.slice(0, 2).map(account => <AdminCard key={account.id} className="p-4"><p className="truncate text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{account.name}</p><p className="mt-1 text-xl font-black text-[#0d1b2e]">{formatCurrency(account.balance || 0)}</p><p className="mt-1 text-xs text-[#5a6a82]">Saldo derivado do livro financeiro.</p></AdminCard>)}
    </div>

    {errorText && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</div>}

    <AdminCard>
      <AdminCardHeader>
        <div><h3 className="text-sm font-black text-[#0d1b2e]">Liquidações futuras</h3><p className="mt-1 text-xs text-[#5a6a82]">Valores previstos de cartão/adquirente. Só entram no saldo real quando a liquidação for confirmada.</p></div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-2">
        {finance.scheduledSettlementsQuery.isLoading ? <p className="text-sm text-[#5a6a82]">Carregando liquidações futuras...</p> : scheduledSettlements.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma liquidação futura pendente.</p> : scheduledSettlements.map(item => {
          const overdue = new Date(item.expected_settlement_at).getTime() < Date.now();
          return <div key={item.id} className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${overdue ? "border-red-200 bg-red-50/50" : "border-[#0d1b2e]/8"}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-[#0d1b2e]">{item.payment_method_name_snapshot}</p>{overdue && <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-black uppercase text-red-700">Repasse atrasado</span>}</div>
              <p className="mt-1 text-xs text-[#5a6a82]">{item.financial_account_name_snapshot} · previsto para {formatDateTime(item.expected_settlement_at)}</p>
              <p className="mt-1 text-xs text-[#5a6a82]">Bruto {formatCurrency(item.gross_amount)} · taxa {formatCurrency(item.fee_amount)} · <strong className="text-[#0d1b2e]">líquido {formatCurrency(item.net_amount)}</strong></p>
            </div>
            {canConfirmSettlements && <AdminButton size="sm" onClick={() => finance.confirmScheduledSettlementMutation.mutateAsync({ settlementId: item.id })} loading={finance.confirmScheduledSettlementMutation.isPending} loadingText="Confirmando...">Confirmar liquidação</AdminButton>}
          </div>;
        })}
      </AdminCardContent>
    </AdminCard>

    <AdminCard>
      <AdminCardToolbar><div className="grid w-full gap-3 sm:grid-cols-[1fr_260px_auto] sm:items-end"><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><FInput aria-label="Pesquisar movimentações" className="pl-9" value={search} onChange={(event: any) => setSearch(event.target.value)} placeholder="Descrição, tipo ou conta" /></div><FSelect label="Conta" value={accountFilter} onChange={(event: any) => setAccountFilter(event.target.value)} options={[{ value: "all", label: "Todas as contas" }, ...accounts.map(item => ({ value: item.id, label: item.name }))]} /><p className="pb-2 text-xs font-semibold text-[#5a6a82]">{filtered.length} movimentos</p></div></AdminCardToolbar>
      {loading ? <div className="p-10"><LoadingState text="Carregando movimentações..." /></div> : filtered.length === 0 ? <div className="p-10"><EmptyState icon={ArrowRightLeft} title="Nenhuma movimentação encontrada" /></div> : <>
        <div className="grid gap-2 p-3 md:hidden">{filtered.map(item => <div key={item.id} className="rounded-xl border border-[#0d1b2e]/8 p-3"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-2">{item.direction === "credit" ? <ArrowDownLeft size={17} className="mt-0.5 shrink-0 text-emerald-600" /> : <ArrowUpRight size={17} className="mt-0.5 shrink-0 text-red-600" />}<div className="min-w-0"><p className="truncate text-sm font-bold text-[#0d1b2e]">{item.description_snapshot}</p><p className="text-xs text-[#5a6a82]">{accountById.get(item.financial_account_id)?.name || "Conta"} · {MOVEMENT_LABELS[item.movement_type]}</p><p className="text-[11px] text-[#8a98aa]">{formatDateTime(item.occurred_at)}</p></div></div><p className={`shrink-0 text-sm font-black ${item.direction === "credit" ? "text-emerald-700" : "text-red-700"}`}>{item.direction === "credit" ? "+" : "-"}{formatCurrency(item.amount)}</p></div></div>)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="min-w-[900px]"><thead><tr><th className="text-left">Data</th><th className="text-left">Conta</th><th className="text-left">Tipo</th><th className="text-left">Descrição</th><th className="text-right">Valor</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td className="text-xs">{formatDateTime(item.occurred_at)}</td><td className="text-xs font-semibold">{accountById.get(item.financial_account_id)?.name || "—"}</td><td className="text-xs text-[#5a6a82]">{MOVEMENT_LABELS[item.movement_type]}</td><td className="text-xs text-[#5a6a82]">{item.description_snapshot}</td><td className={`text-right font-black ${item.direction === "credit" ? "text-emerald-700" : "text-red-700"}`}>{item.direction === "credit" ? "+" : "-"}{formatCurrency(item.amount)}</td></tr>)}</tbody></table></div>
      </>}
    </AdminCard>

    {canTransfer && transfers.length > 0 && <AdminCard><AdminCardHeader><h3 className="text-sm font-black text-[#0d1b2e]">Transferências</h3></AdminCardHeader><AdminCardContent className="space-y-2">{transfers.slice(0, 20).map(transfer => <div key={transfer.id} className="flex flex-col gap-3 rounded-xl border border-[#0d1b2e]/8 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-bold text-[#0d1b2e]">{accountById.get(transfer.from_account_id)?.name || "Conta"} → {accountById.get(transfer.to_account_id)?.name || "Conta"}</p><p className="mt-1 text-xs text-[#5a6a82]">{formatDateTime(transfer.occurred_at)} · {formatCurrency(transfer.amount)}{transfer.note ? ` · ${transfer.note}` : ""}</p>{transfer.reversal_reason && <p className="mt-1 text-xs font-semibold text-red-700">Estornada: {transfer.reversal_reason}</p>}</div>{transfer.transfer_status === "posted" && <AdminButton size="sm" variant="danger" onClick={() => { setReverseTransferId(transfer.id); setReverseReason(""); setMessage(""); }}><RotateCcw size={14} /> Estornar</AdminButton>}</div>)}</AdminCardContent></AdminCard>}

    <FinanceTransferDialog open={transferOpen} accounts={accounts} saving={finance.transferMutation.isPending} onClose={() => { if (!finance.transferMutation.isPending) setTransferOpen(false); }} onSave={saveTransfer} />

    {reverseTransferId && <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="border-b px-5 py-4"><h2 className="text-lg font-black text-[#0d1b2e]">Estornar transferência</h2><p className="mt-1 text-xs text-[#5a6a82]">Serão criados movimentos inversos nas duas contas.</p></div><div className="p-5"><FTextarea label="Motivo do estorno" required value={reverseReason} onChange={(event: any) => setReverseReason(event.target.value)} /></div><div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => { if (!finance.reverseTransferMutation.isPending) { setReverseTransferId(null); setReverseReason(""); } }}>Cancelar</AdminButton><AdminButton variant="danger" onClick={reverseTransfer} loading={finance.reverseTransferMutation.isPending} loadingText="Estornando...">Confirmar estorno</AdminButton></div></div></div>}
  </div>;
}
