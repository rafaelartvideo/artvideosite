import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";
import { Fragment, useRef, useState } from "react";
import { ArrowLeft, History, Pencil } from "lucide-react";
import { FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import type { FinancialAccount, FinancialEntryDetail, FinancialPaymentMethod, FinancialSettlementDraft } from "../domain/finance.types";
import { FinanceDocumentsPanel } from "./FinanceDocumentsPanel";
import { FinanceEntrySourceBlock } from "./FinanceEntrySourceBlock";
import { FinanceServiceOrderLink } from "./FinanceServiceOrderLink";
import { FinanceSettlementPanel } from "./FinanceSettlementPanel";
import { FinanceSubsectionTabs } from "./FinanceSectionTabs";
import { formatFinancialDocument } from "./financeDisplay";
import { financialDueUrgency } from "../domain/finance-due-urgency.mjs";
import { getOrderReportedReceipts } from "../domain/finance-reported-receipts";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function eventLabel(type: string) {
  return ({
    created: "Lançamento criado",
    submitted: "Registro de fluxo anterior",
    updated: "Lançamento alterado",
    resubmitted: "Registro de fluxo anterior",
    integrated_created: "Lançamento criado pela integração",
    approval_recorded: "Registro de fluxo anterior",
    approved: "Lançamento liberado para baixa",
    rejected: "Lançamento rejeitado",
    settlement_registered: "Baixa registrada",
    settlement_posted: "Liquidação confirmada",
    settlement_reversed: "Baixa estornada",
    document_attached: "Documento anexado",
    document_archived: "Documento arquivado",
    recurring_generated: "Ocorrência recorrente gerada",
    installment_amount_adjusted: "Previsão mensal ajustada",
    recurring_cancelled: "Ocorrência cancelada após encerramento da assinatura",
  } as Record<string, string>)[type] || type;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div></div>;
}


type EntryTab = "overview" | "settlements" | "documents" | "history";

function EntryDetailContent({
  detail, accounts, paymentMethods, canEdit, canSettle, canReverseSettlement,
  settlementPending,
  reverseSettlementPending, settlementError, onEdit,
  onRegisterSettlement, onReverseSettlement, scrollContainerRef, initialSettlementOpen,
  forecastPending, onAdjustInstallment,
}: Parameters<typeof FinanceEntryDetail>[0]) {
  const [tab, setTab] = useState<EntryTab>(initialSettlementOpen ? "settlements" : "overview");
  const [forecastEdit, setForecastEdit] = useState<{ id: string; amount: string } | null>(null);
  const [forecastError, setForecastError] = useState("");
  const [forecastSaving, setForecastSaving] = useState(false);
  const forecastSavingRef = useRef(false);
  const forecastBusy = forecastSaving || Boolean(forecastPending);
  const isReceivable = detail.entry_type === "receivable";
  const settledAmount = detail.installments.reduce((sum, item) => sum + Number(item.settled_amount || 0), 0);
  const remaining = ["cancelled", "reversed"].includes(detail.approval_status)
    ? 0
    : detail.installments.reduce((sum, item) => sum + Math.max(0, Number(item.original_amount) - Number(item.settled_amount)), 0);
  const methods = [...new Set(detail.settlements.filter(item => item.settlement_status !== "reversed").map(item => item.payment_method_name_snapshot).filter(Boolean))];
  const reportedReceipts = getOrderReportedReceipts(detail.source_details);
  const plannedMethods = (Array.isArray(detail.source_details?.payment_plan) ? detail.source_details.payment_plan : []) as Array<{payment_method_id:string;amount:number}>;
  const plannedText = plannedMethods.map(item=>{const method=paymentMethods.find(m=>m.id===item.payment_method_id);return `${method?.name||"Forma cadastrada"}: ${formatCurrency(item.amount)}`;}).join(", ");
  const due = detail.installments.filter(item => Number(item.original_amount) - Number(item.settled_amount) > 0.0001).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const dueUrgency = financialDueUrgency(due?.due_date);
  const dueTone = dueUrgency === "today" || dueUrgency === "overdue"
    ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
    : dueUrgency === "urgent"
      ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400"
      : dueUrgency === "soon"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-border bg-background text-foreground";
  const dueMessage = dueUrgency === "today" ? " · Vence hoje" : dueUrgency === "overdue" ? " · Vencido" : "";
  const originLabel = detail.origin_type === "manual" ? "Cadastro manual" : detail.origin_type === "service_order" ? "Ordem de Serviço" : detail.origin_type === "inventory_purchase" ? "Compra de estoque" : detail.origin_type === "recurring" ? "Recorrência" : "Outros";
  const editable = canEdit && ["draft", "pending", "rejected", "approved"].includes(detail.approval_status) && detail.origin_type === "manual" && detail.settlements.length === 0;
  const canAdjustForecast = !isReceivable && canEdit && Boolean(onAdjustInstallment)
    && ["manual", "recurring"].includes(detail.origin_type)
    && ["pending", "approved"].includes(detail.approval_status);
  const saveForecast = async () => {
    if (!forecastEdit || !onAdjustInstallment || forecastPending || forecastSavingRef.current) return;
    const amount = Number(forecastEdit.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setForecastError("Informe o valor atualizado da parcela.");
      return;
    }
    forecastSavingRef.current = true;
    setForecastSaving(true);
    try {
      setForecastError("");
      // Só fecha a linha depois de o banco confirmar e o extrato ser atualizado.
      await onAdjustInstallment(forecastEdit.id, amount, "Valor previsto atualizado pelo operador.");
      setForecastEdit(null);
      notifyAdmin("Previsão atualizada e registrada no histórico.", "success");
    } catch (error) {
      setForecastError(systemErrorMessage(error, "Não foi possível atualizar a previsão."));
    } finally {
      forecastSavingRef.current = false;
      setForecastSaving(false);
    }
  };

  return <div className="space-y-4">
    <section aria-label="Identificação e saldos do extrato" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-5 py-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className="min-w-0 break-words text-lg font-bold leading-tight text-foreground">{detail.description}</h3>
              {due && <span role="status" className={`inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-sm font-bold tabular-nums ${dueTone}`}>
                Próximo vencimento: {formatDate(due.due_date)}{dueMessage}
              </span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{detail.counterpart_name_snapshot || (isReceivable ? "Cliente não informado" : "Favorecido não informado")}</p>
            {detail.counterpart_document_snapshot && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{formatFinancialDocument(detail.counterpart_document_snapshot)}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {editable && <AdminIconButton ariaLabel="Editar lançamento" title="Editar lançamento" onClick={onEdit}>
              <Pencil size={16} />
            </AdminIconButton>}
            <AdminIconButton ariaLabel={tab === "history" ? "Voltar ao resumo" : "Ver histórico"}
              title={tab === "history" ? "Voltar ao resumo" : "Histórico"}
              variant={tab === "history" ? "tertiary" : "secondary"}
              onClick={() => { setTab(current => current === "history" ? "overview" : "history"); if (scrollContainerRef?.current) scrollContainerRef.current.scrollTop = 0; }}>
              <History size={16} />
            </AdminIconButton>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-border/70 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div><p className="text-muted-foreground">Emissão</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{formatDate(detail.issue_date)}</p></div>
          <div><p className="text-muted-foreground">Origem</p><p className="mt-0.5 font-semibold text-foreground">{detail.origin_type === "service_order" ? <FinanceServiceOrderLink orderId={detail.origin_reference} number={detail.source_details?.os_number} /> : originLabel}</p></div>
          <div><p className="text-muted-foreground">Parcelas</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{detail.installments.length}</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4 text-center"><p className="text-xs text-muted-foreground">Valor original</p><p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatCurrency(detail.original_amount)}</p></div>
        <div className="bg-emerald-500/10 px-5 py-4 text-center"><p className="text-xs text-muted-foreground">{isReceivable ? "Total recebido" : "Total pago"}</p><p className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(settledAmount)}</p></div>
        <div className="bg-amber-500/10 px-5 py-4 text-center"><p className="text-xs text-muted-foreground">Saldo em aberto</p><p className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(remaining)}</p></div>
      </div>
    </section>

    {tab !== "history" && <FinanceSubsectionTabs<EntryTab>
      value={tab}
      onSelect={nextTab => {
        setTab(nextTab);
        // The header and tab buttons stay focused; only the dialog body resets.
        // Never scroll the page behind the dialog when a shorter tab is opened.
        if (scrollContainerRef?.current) scrollContainerRef.current.scrollTop = 0;
      }}
      ariaLabel={`Subseções da conta a ${isReceivable ? "receber" : "pagar"}`}
      items={[
        { id: "overview", label: "Resumo" },
        { id: "settlements", label: "Baixas" },
        { id: "documents", label: "Documentos" },
      ]}
    />}

    {tab === "overview" && <div className="space-y-4">
      <AdminCard>
        <AdminCardHeader><h3 className="text-sm font-bold text-foreground">Resumo</h3></AdminCardHeader>
        <AdminCardContent>
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label={isReceivable ? "Cliente / pagador" : "Favorecido"} value={detail.counterpart_name_snapshot || "—"} />
            <Info label="CPF / CNPJ" value={formatFinancialDocument(detail.counterpart_document_snapshot)} />
            <Info label="Forma de pagamento" value={methods.length ? methods.join(", ") : plannedText ? `${plannedText} (previsto)` : "A definir (sem baixa)"} />
            <Info label="Emissão" value={formatDate(detail.issue_date)} />
            <Info label="Competência" value={formatDate(detail.competence_date)} />
            <Info label="Categoria" value={Array.from(new Set(detail.allocations.map(item => item.category_name_snapshot))).join(", ") || "—"} />
            <Info label="Cadastrado por" value={detail.created_by_name || "Não identificado"} />
            <Info label="Cadastrado em" value={new Date(detail.created_at).toLocaleString("pt-BR")} />
            {detail.updated_by_name && <Info label="Última alteração por" value={detail.updated_by_name} />}
            {detail.last_settlement_by_name && <Info label="Última baixa registrada por" value={detail.last_settlement_by_name} />}
          </div>
          {detail.notes && <div className="mt-4 border-t border-border pt-4"><Info label="Observações" value={detail.notes} /></div>}
        </AdminCardContent>
      </AdminCard>

      {["service_order", "inventory_purchase"].includes(detail.origin_type)
        && <FinanceEntrySourceBlock detail={detail} showIcon={false} />}

      <AdminCard>
        <AdminCardHeader><h3 className="text-sm font-bold text-foreground">Parcelas</h3></AdminCardHeader>
        <div className="overflow-x-auto"><TopTableScrollbar />
          <table className="min-w-[620px] w-full"><thead><tr><th className="text-left">Parcela</th><th className="text-left">Vencimento</th><th className="text-right">Valor previsto</th><th className="text-right">{isReceivable ? "Recebido" : "Pago"}</th><th className="text-right">Em aberto</th>{canAdjustForecast && <th className="text-right">Ação</th>}</tr></thead>
            <tbody>{detail.installments.map(item => <Fragment key={item.id}>
              <tr><td className="font-semibold">{item.installment_number}/{item.total_installments}
                {reportedReceipts.some(receipt => receipt.installment_number === item.installment_number) && <span className="mt-1 block text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {Number(item.settled_amount) + 0.005 >= Number(item.original_amount) ? "Informado na OS · baixa confirmada" : "Informado como recebido na OS · aguardando baixa"}
                </span>}</td><td>{formatDate(item.due_date)}</td><td className="text-right tabular-nums">{formatCurrency(item.original_amount)}</td><td className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(item.settled_amount)}</td><td className={`text-right font-bold tabular-nums ${["cancelled", "reversed"].includes(detail.approval_status) ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>{["cancelled", "reversed"].includes(detail.approval_status) ? "—" : formatCurrency(Math.max(0, Number(item.original_amount) - Number(item.settled_amount)))}</td>
                {canAdjustForecast && <td className="text-right">{Number(item.original_amount) - Number(item.settled_amount) > 0.005 && <button
                  type="button" disabled={forecastBusy} aria-label={`Ajustar valor da parcela ${item.installment_number}`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                  onClick={() => { setForecastEdit({ id: item.id, amount: String(item.original_amount) }); setForecastError(""); }}
                ><Pencil size={13} /> Ajustar</button>}</td>}
              </tr>
              {forecastEdit?.id === item.id && canAdjustForecast && <tr className="bg-muted/25">
                <td colSpan={6} className="px-4 py-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[160px] flex-1 sm:max-w-[280px]">
                      <FCurrencyInput label="Novo valor previsto" value={forecastEdit.amount} disabled={forecastBusy}
                        className="!h-[42px]" onChange={(event: any) => setForecastEdit(current => current && ({ ...current, amount: event.target.value }))} />
                    </div>
                    <AdminButton variant="secondary" className="!h-[42px]" disabled={forecastBusy}
                      onClick={() => { setForecastEdit(null); setForecastError(""); }}>Cancelar</AdminButton>
                    <AdminButton className="!h-[42px]" loading={forecastBusy} loadingText="Aplicando..."
                      disabled={forecastBusy} onClick={() => void saveForecast()}>Aplicar</AdminButton>
                  </div>
                  {forecastError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{forecastError}</p>}
                </td>
              </tr>}
            </Fragment>)}</tbody>
          </table>
        </div>
      </AdminCard>

    </div>}

    {tab === "history" && <div className="space-y-4">
      <div><AdminButton variant="secondary" size="sm" onClick={() => setTab("overview")}><ArrowLeft size={15} /> Voltar ao resumo</AdminButton></div>
      <AdminCard><AdminCardHeader><h3 className="text-sm font-bold text-foreground">Histórico</h3></AdminCardHeader>
        <AdminCardContent>
          {detail.events.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p> : <div className="divide-y divide-border">
            {detail.events.filter(event => !["submitted","resubmitted","approval_recorded","rejected","collection_recorded"].includes(event.event_type)).map(event => <div key={event.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{eventLabel(event.event_type)}</p>
                <p className="text-xs text-muted-foreground">{event.created_by ? detail.actor_names?.[event.created_by] || "Responsável não identificado" : "Sistema"}</p>
                {event.event_type === "installment_amount_adjusted" && <p className="text-xs text-muted-foreground">
                  Parcela {String(event.event_data?.installment_number || "")}: {formatCurrency(Number(event.event_data?.old_amount || 0))}
                  {" → "}{formatCurrency(Number(event.event_data?.new_amount || 0))} · {String(event.event_data?.reason || "")}
                </p>}</div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</span>
            </div>)}
          </div>}
        </AdminCardContent>
      </AdminCard>
    </div>}

    {tab === "settlements" && <FinanceSettlementPanel
      detail={detail} canReverse={canReverseSettlement}
      reversePending={reverseSettlementPending}
      error={settlementError} onReverse={onReverseSettlement}
    />}
    {tab === "documents" && <FinanceDocumentsPanel entryId={detail.id} orderId={detail.origin_type === "service_order" ? detail.origin_reference : null} orderNumber={detail.source_details?.os_number} />}
  </div>;
}

export function FinanceEntryDetail({
  detail,
  scrollContainerRef,
  accounts,
  paymentMethods,
  canEdit,
  canApprove,
  canSettle,
  canReverseSettlement,
  currentUserId,
  decisionPending,
  decisionError,
  settlementPending,
  reverseSettlementPending,
  settlementError,
  onBack,
  onEdit,
  onApprove,
  onReject,
  onRegisterSettlement,
  onReverseSettlement,
  onAdjustInstallment,
  forecastPending = false,
  initialSettlementOpen = false,
}: {
  detail: FinancialEntryDetail;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  accounts: FinancialAccount[];
  paymentMethods: FinancialPaymentMethod[];
  canEdit: boolean;
  canApprove: boolean;
  canSettle: boolean;
  canReverseSettlement: boolean;
  currentUserId: string | null;
  decisionPending: boolean;
  decisionError?: unknown;
  settlementPending: boolean;
  reverseSettlementPending: boolean;
  settlementError?: unknown;
  onBack: () => void;
  onEdit: () => void;
  onApprove: () => Promise<void>;
  onReject: (note: string) => Promise<void>;
  onRegisterSettlement: (draft: FinancialSettlementDraft) => Promise<void>;
  onReverseSettlement: (settlementId: string, reason: string) => Promise<void>;
  onAdjustInstallment?: (installmentId: string, newAmount: number, reason: string) => Promise<void>;
  forecastPending?: boolean;
  initialSettlementOpen?: boolean;
}) {
  return <EntryDetailContent
    detail={detail} accounts={accounts} paymentMethods={paymentMethods}
    scrollContainerRef={scrollContainerRef}
    canEdit={canEdit} canApprove={canApprove} canSettle={canSettle} canReverseSettlement={canReverseSettlement}
    currentUserId={currentUserId} decisionPending={decisionPending} decisionError={decisionError}
    settlementPending={settlementPending}
    reverseSettlementPending={reverseSettlementPending} settlementError={settlementError}
    onBack={onBack} onEdit={onEdit} onApprove={onApprove} onReject={onReject}
    onRegisterSettlement={onRegisterSettlement}
    onReverseSettlement={onReverseSettlement}
    onAdjustInstallment={onAdjustInstallment} forecastPending={forecastPending}
    initialSettlementOpen={initialSettlementOpen}
  />;
}
