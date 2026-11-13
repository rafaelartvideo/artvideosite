import { initialPageSize, ADMIN_PAGE_SIZE_STORAGE_KEY } from "@/shared/domain/pagination-preferences";
import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { FinanceTableRow } from "./FinanceTableRow";
import { FinanceTableSurface } from "./FinanceTableSurface";
import { AdminSearchPanel, AdminSearchClearButton } from "@/shared/ui/admin/AdminSearchPanel";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { useFinanceMovements } from "../application/useFinanceMovements";
import type { FinancialMovement, FinancialMovementType, FinancialTransferDraft } from "../domain/finance.types";
import { FinanceTransferDialog } from "./FinanceTransferDialog";
import { formatFinanceOriginLabel } from "../domain/finance-origin-label.mjs";
import { FinanceServiceOrderLink } from "./FinanceServiceOrderLink";
import { FinanceOrderEvidenceGallery } from "./FinanceOrderEvidenceGallery";

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

// O limite final é exclusivo. Converter no fuso local evita perder o último dia pesquisado.
function localDateBoundary(value: string, nextDay = false) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day + (nextDay ? 1 : 0)).toISOString();
}

export function FinanceMovementsSection({ createSignal = 0, onInitialReady }: { createSignal?: number; onInitialReady?: () => void } = {}) {
  const { hasPermission } = useAuth();
  const foundation = useFinanceFoundation();
  const canTransfer = hasPermission("finance.transfers.create");
  const [accountFilter, setAccountFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => initialPageSize([20, 50, 100], ADMIN_PAGE_SIZE_STORAGE_KEY, 20));
  const [transferOpen, setTransferOpen] = useState(false);
  useEffect(() => { if (createSignal > 0) setTransferOpen(true); }, [createSignal]);
  const [selectedMovement, setSelectedMovement] = useState<FinancialMovement | null>(null);
  const [reverseTransferId, setReverseTransferId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseReasonError, setReverseReasonError] = useState("");
  const finance = useFinanceMovements({
    movementPage: page,
    movementPageSize: pageSize,
    movementAccountId: accountFilter === "all" ? "" : accountFilter,
    movementStartAt: localDateBoundary(dateFrom),
    movementEndAt: localDateBoundary(dateTo, true),
  });

  useEffect(() => {
    setPage(1);
  }, [accountFilter, dateFrom, dateTo, pageSize]);

  const balances = finance.balancesQuery.data || {};
  const accounts = (foundation.accountsQuery.data || []).map(item => ({ ...item, balance: Number(balances[item.id] || 0) }));
  const accountById = new Map(accounts.map(item => [item.id, item]));
  const movements = finance.movementsQuery.data?.items || [];
  const totalMovements = finance.movementsQuery.data?.total || 0;
  const transfers = finance.transfersQuery.data || [];
  const totalBalance = accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0);

  const error = finance.movementsQuery.error || finance.balancesQuery.error || finance.transfersQuery.error || finance.transferMutation.error || finance.reverseTransferMutation.error;
  useEffect(() => {
    if (error) notifyAdmin(systemErrorMessage(error), "error");
  }, [error]);

  const saveTransfer = async (draft: FinancialTransferDraft) => {
    await finance.transferMutation.mutateAsync(draft);
  };

  const reverseTransfer = async () => {
    if (!reverseTransferId) return;
    if (!reverseReason.trim()) { setReverseReasonError("Informe o motivo do estorno da transferência."); return; }
    try {
      setReverseReasonError("");
      await finance.reverseTransferMutation.mutateAsync({ id: reverseTransferId, reason: reverseReason.trim() });
      setReverseTransferId(null);
      setReverseReason("");
    } catch (caught) {
      notifyAdmin(systemErrorMessage(caught, "Não foi possível estornar a transferência."), "error");
    }
  };

  const loading = finance.movementsQuery.isLoading || finance.balancesQuery.isLoading || foundation.accountsQuery.isLoading;
  useEffect(() => {
    if (!finance.movementsQuery.isPending && !finance.balancesQuery.isPending && !foundation.accountsQuery.isPending && !finance.transfersQuery.isPending) onInitialReady?.();
  }, [onInitialReady, finance.movementsQuery.isPending, finance.balancesQuery.isPending, foundation.accountsQuery.isPending, finance.transfersQuery.isPending]);


  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-muted-foreground">{totalMovements} {totalMovements === 1 ? "movimentação registrada" : "movimentações registradas"}</p>

    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <AdminCard className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Saldo total</p><p className="mt-1 text-xl font-black text-[#0057e7]">{formatCurrency(totalBalance)}</p><p className="mt-1 text-xs text-[#5a6a82]">Soma dos movimentos registrados nas contas.</p></AdminCard>
      {accounts.slice(0, 2).map(account => <AdminCard key={account.id} className="p-4"><p className="truncate text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{account.name}</p><p className="mt-1 text-xl font-black text-[#0d1b2e]">{formatCurrency(account.balance || 0)}</p><p className="mt-1 text-xs text-[#5a6a82]">Saldo derivado do livro financeiro.</p></AdminCard>)}
    </div>

    

    {loading ? <AdminWorkspaceSkeleton searchFields={3} columns={7} rows={pageSize} /> : <>
    <AdminSearchPanel title="Buscar movimentações" headerActions={(accountFilter !== "all" || dateFrom || dateTo) ? <AdminSearchClearButton onClick={() => {
      setAccountFilter("all"); setDateFrom(""); setDateTo(""); setPage(1);
    }} /> : null}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FSelect label="Conta" value={accountFilter} onChange={(event: any) => setAccountFilter(event.target.value)} options={[{ value: "all", label: "Todas as contas" }, ...accounts.map(item => ({ value: item.id, label: item.name }))]} />
        <FInput label="Data inicial" type="date" value={dateFrom} onChange={(event: any) => {
          const next = event.target.value;
          setDateFrom(next);
          if (dateTo && next && next > dateTo) setDateTo(next);
        }} />
        <FInput label="Data final" type="date" value={dateTo} onChange={(event: any) => {
          const next = event.target.value;
          setDateTo(next);
          if (dateFrom && next && next < dateFrom) setDateFrom(next);
        }} />
      </div>
    </AdminSearchPanel>
      {movements.length === 0 ? <div className="p-10"><EmptyState icon={ArrowRightLeft} title="Nenhuma movimentação encontrada" /></div> : <>
        <div className="grid gap-2 p-3 md:hidden">{movements.map(item => <div role="button" tabIndex={0} key={item.id} aria-label={`Abrir movimentação ${item.description_snapshot}`} onClick={event => { if (!(event.target instanceof Element && event.target.closest("a, button"))) setSelectedMovement(item); }} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedMovement(item); } }} className="w-full cursor-pointer rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/60"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-2">{item.direction === "credit" ? <ArrowDownLeft size={17} className="mt-0.5 shrink-0 text-emerald-600" /> : <ArrowUpRight size={17} className="mt-0.5 shrink-0 text-red-600" />}<div className="min-w-0"><p className="truncate text-sm font-bold text-[#0d1b2e]">{item.description_snapshot}</p><p className="text-xs text-[#5a6a82]">{item.origin_order_id ? <FinanceServiceOrderLink orderId={item.origin_order_id} label={formatFinanceOriginLabel(item.origin_label || "Ordem de Serviço")} /> : formatFinanceOriginLabel(item.origin_label || "Movimentação financeira")} · {accountById.get(item.financial_account_id)?.name || "Conta"}</p><p className="text-[11px] text-[#8a98aa]">{formatDateTime(item.occurred_at)}</p></div></div><p className={`shrink-0 text-sm font-black ${item.direction === "credit" ? "text-emerald-700" : "text-red-700"}`}>{item.direction === "credit" ? "+" : "-"}{formatCurrency(item.amount)}</p></div></div>)}</div>
        <FinanceTableSurface className="hidden md:block"><table className="min-w-[1100px]"><thead><tr><th className="text-left">Data</th><th className="text-left">Origem</th><th className="text-left">Descrição</th><th className="text-left">Conta</th><th className="text-left">Tipo</th><th className="text-right">Entrada</th><th className="text-right">Saída</th></tr></thead><tbody>{movements.map(item => <FinanceTableRow key={item.id} label={`Abrir movimentação ${item.description_snapshot}`} onOpen={() => setSelectedMovement(item)}><td className="text-xs">{formatDateTime(item.occurred_at)}</td><td className="text-xs font-semibold">{item.origin_order_id ? <FinanceServiceOrderLink orderId={item.origin_order_id} label={formatFinanceOriginLabel(item.origin_label || "Ordem de Serviço")} /> : formatFinanceOriginLabel(item.origin_label || "Movimentação financeira")}</td><td className="text-xs text-muted-foreground">{item.description_snapshot}</td><td className="text-xs">{accountById.get(item.financial_account_id)?.name || "—"}</td><td className="text-xs text-muted-foreground">{MOVEMENT_LABELS[item.movement_type]}</td><td className="text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{item.direction === "credit" ? formatCurrency(item.amount) : "—"}</td><td className="text-right font-bold tabular-nums text-red-600 dark:text-red-400">{item.direction === "debit" ? formatCurrency(item.amount) : "—"}</td></FinanceTableRow>)}</tbody></table></FinanceTableSurface>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalItems={totalMovements}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          defaultPageSize={20}
          pageSizeOptions={[20, 50, 100]}
        />
      </>}
    </>}

    {canTransfer && transfers.length > 0 && <section className="space-y-2 border-t border-border pt-5"><h3 className="text-sm font-bold text-foreground">Transferências</h3>{transfers.slice(0, 20).map(transfer => <div key={transfer.id} className="flex flex-col gap-3 rounded-xl border border-[#0d1b2e]/8 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-bold text-[#0d1b2e]">{accountById.get(transfer.from_account_id)?.name || "Conta"} → {accountById.get(transfer.to_account_id)?.name || "Conta"}</p><p className="mt-1 text-xs text-[#5a6a82]">{formatDateTime(transfer.occurred_at)} · {formatCurrency(transfer.amount)}{transfer.note ? ` · ${transfer.note}` : ""}</p>{transfer.reversal_reason && <p className="mt-1 text-xs font-semibold text-red-700">Estornada: {transfer.reversal_reason}</p>}</div>{transfer.transfer_status === "posted" && <AdminButton size="sm" variant="danger" onClick={() => { setReverseTransferId(transfer.id); setReverseReason(""); setReverseReasonError(""); }}><RotateCcw size={14} /> Estornar</AdminButton>}</div>)}</section>}

    <AdminDialog open={Boolean(selectedMovement)} onClose={() => setSelectedMovement(null)} title="Detalhes da movimentação" className="max-w-lg"
      footer={<div className="flex justify-end"><AdminButton variant="secondary" onClick={() => setSelectedMovement(null)}>Fechar</AdminButton></div>}>
      {selectedMovement && <div className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Data</dt><dd className="text-sm font-semibold text-foreground">{formatDateTime(selectedMovement.occurred_at)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Conta</dt><dd className="text-sm font-semibold text-foreground">{accountById.get(selectedMovement.financial_account_id)?.name || "—"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Tipo</dt><dd className="text-sm font-semibold text-foreground">{MOVEMENT_LABELS[selectedMovement.movement_type]}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Origem</dt><dd className="text-sm font-semibold text-foreground">{selectedMovement.origin_order_id ? <FinanceServiceOrderLink orderId={selectedMovement.origin_order_id} label={formatFinanceOriginLabel(selectedMovement.origin_label || "Ordem de Serviço")} /> : formatFinanceOriginLabel(selectedMovement.origin_label || "Movimentação financeira")}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Valor</dt><dd className={`text-sm font-semibold ${selectedMovement.direction === "credit" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{selectedMovement.direction === "credit" ? "+" : "-"}{formatCurrency(selectedMovement.amount)}</dd></div>
        {selectedMovement.origin_order_id && <div>
          <dt className="text-xs text-muted-foreground">OS concluída por</dt>
          <dd className="text-sm font-semibold text-foreground">{selectedMovement.completed_by_name || "Não identificado"}</dd>
        </div>}
        {["receipt", "payment"].includes(selectedMovement.movement_type) && selectedMovement.source_type === "settlement" && <div>
          <dt className="text-xs text-muted-foreground">Baixa registrada por</dt>
          <dd className="text-sm font-semibold text-foreground">{selectedMovement.settlement_by_name || "Não identificado"}</dd>
        </div>}
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Descrição</dt><dd className="break-words text-sm font-semibold text-foreground">{selectedMovement.description_snapshot}</dd></div>
      </dl>
        {selectedMovement.movement_type === "receipt" && selectedMovement.origin_order_id && selectedMovement.origin_entry_id &&
          <FinanceOrderEvidenceGallery entryId={selectedMovement.origin_entry_id} kind="payment_proof" />}
      </div>}
    </AdminDialog>

    <FinanceTransferDialog open={transferOpen} accounts={accounts} saving={finance.transferMutation.isPending} onClose={() => { if (!finance.transferMutation.isPending) setTransferOpen(false); }} onSave={saveTransfer} />

    {reverseTransferId && <AdminDialog open onClose={() => { if (!finance.reverseTransferMutation.isPending) { setReverseTransferId(null); setReverseReason(""); } }} title="Estornar transferência" description="Serão criados movimentos inversos nas duas contas." className="max-w-lg" footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => { if (!finance.reverseTransferMutation.isPending) { setReverseTransferId(null); setReverseReason(""); } }}>Cancelar</AdminButton><AdminButton variant="danger" onClick={reverseTransfer} loading={finance.reverseTransferMutation.isPending} loadingText="Estornando...">Confirmar estorno</AdminButton></div>}><FTextarea label="Motivo do estorno" required error={reverseReasonError} value={reverseReason} onChange={(event: any) => { setReverseReasonError(""); setReverseReason(event.target.value); }} /></AdminDialog>}
  </div>;
}
