import { useState } from "react";
import { formatCurrency } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import type { FinancialAccount, FinancialEntryDetail, FinancialPaymentMethod, FinancialSettlementDraft } from "../domain/finance.types";
import { FinanceCollectionsPanel } from "./FinanceCollectionsPanel";
import { FinanceDocumentsPanel } from "./FinanceDocumentsPanel";
import { FinanceEntrySourceBlock } from "./FinanceEntrySourceBlock";
import { FinanceSettlementPanel } from "./FinanceSettlementPanel";
import { FinanceSubsectionTabs } from "./FinanceSectionTabs";
import { formatFinancialDocument } from "./financeDisplay";

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
    collection_recorded: "Contato de cobrança registrado",
    recurring_generated: "Ocorrência recorrente gerada",
  } as Record<string, string>)[type] || type;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div></div>;
}


type EntryTab = "overview" | "settlements" | "documents" | "collections";

function EntryDetailContent({
  detail, accounts, paymentMethods, canEdit, canSettle, canReverseSettlement,
  settlementPending,
  reverseSettlementPending, settlementError, onEdit,
  onRegisterSettlement, onReverseSettlement, scrollContainerRef, initialSettlementOpen,
}: Parameters<typeof FinanceEntryDetail>[0]) {
  const [tab, setTab] = useState<EntryTab>(initialSettlementOpen ? "settlements" : "overview");
  const isReceivable = detail.entry_type === "receivable";
  const settledAmount = detail.installments.reduce((sum, item) => sum + Number(item.settled_amount || 0), 0);
  const remaining = detail.installments.reduce((sum, item) => sum + Math.max(0, Number(item.original_amount) - Number(item.settled_amount)), 0);
  const methods = [...new Set(detail.settlements.filter(item => item.settlement_status !== "reversed").map(item => item.payment_method_name_snapshot).filter(Boolean))];
  const plannedMethods = (Array.isArray(detail.source_details?.payment_plan) ? detail.source_details.payment_plan : []) as Array<{payment_method_id:string;amount:number}>;
  const plannedText = plannedMethods.map(item=>{const method=paymentMethods.find(m=>m.id===item.payment_method_id);return `${method?.name||"Forma cadastrada"}: ${formatCurrency(item.amount)}`;}).join(", ");
  const due = detail.installments.filter(item => Number(item.original_amount) - Number(item.settled_amount) > 0.0001).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const originLabel = detail.origin_type === "manual" ? "Cadastro manual" : detail.origin_type === "service_order" ? "Ordem de Serviço" : detail.origin_type === "inventory_purchase" ? "Compra de estoque" : detail.origin_type === "recurring" ? "Recorrência" : "Outros";
  const editable = canEdit && ["draft", "pending", "rejected", "approved"].includes(detail.approval_status) && detail.origin_type === "manual" && detail.settlements.length === 0;

  return <div className="space-y-4">
    <section aria-label="Identificação e saldos do extrato" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-5 py-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <h3 className="break-words text-lg font-bold leading-tight text-foreground">{detail.description}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{detail.counterpart_name_snapshot || (isReceivable ? "Cliente não informado" : "Favorecido não informado")}</p>
            {detail.counterpart_document_snapshot && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{formatFinancialDocument(detail.counterpart_document_snapshot)}</p>}
          </div>
          {editable && <AdminButton size="sm" variant="secondary" onClick={onEdit}>Editar lançamento</AdminButton>}
        </div>
        <div className="mt-5 grid gap-3 border-t border-border/70 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-muted-foreground">Emissão</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{formatDate(detail.issue_date)}</p></div>
          <div><p className="text-muted-foreground">Próximo vencimento</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{formatDate(due?.due_date)}</p></div>
          <div><p className="text-muted-foreground">Origem</p><p className="mt-0.5 font-semibold text-foreground">{originLabel}</p></div>
          <div><p className="text-muted-foreground">Parcelas</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{detail.installments.length}</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4"><p className="text-xs text-muted-foreground">Valor original</p><p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatCurrency(detail.original_amount)}</p></div>
        <div className="px-5 py-4"><p className="text-xs text-muted-foreground">{isReceivable ? "Total recebido" : "Total pago"}</p><p className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(settledAmount)}</p></div>
        <div className="bg-primary/5 px-5 py-4"><p className="text-xs text-muted-foreground">Saldo em aberto</p><p className="mt-1 text-xl font-bold tabular-nums text-primary">{formatCurrency(remaining)}</p></div>
      </div>
    </section>

    <FinanceSubsectionTabs<EntryTab>
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
        ...(isReceivable ? [{ id: "collections" as const, label: "Cobranças" }] : []),
      ]}
    />

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
            <Info label="Próximo vencimento" value={formatDate(due?.due_date)} />
            <Info label="Categoria" value={Array.from(new Set(detail.allocations.map(item => item.category_name_snapshot))).join(", ") || "—"} />
            <Info label="Origem" value={originLabel} />
            <Info label="Cadastrado por" value={detail.created_by_name || "Não identificado"} />
            <Info label="Cadastrado em" value={new Date(detail.created_at).toLocaleString("pt-BR")} />
            {detail.updated_by_name && <Info label="Última alteração por" value={detail.updated_by_name} />}
            {detail.last_settlement_by_name && <Info label="Última baixa registrada por" value={detail.last_settlement_by_name} />}
          </div>
          {detail.notes && <div className="mt-4 border-t border-border pt-4"><Info label="Observações" value={detail.notes} /></div>}
        </AdminCardContent>
      </AdminCard>

      {["service_order", "inventory_purchase"].includes(detail.origin_type)
        ? <FinanceEntrySourceBlock detail={detail} showIcon={false} />
        : <AdminCard><AdminCardHeader><h3 className="text-sm font-bold text-foreground">Origem</h3></AdminCardHeader>
          <AdminCardContent><div className="grid gap-4 sm:grid-cols-2"><Info label="Tipo" value={originLabel} />
            <Info label="Referência" value={detail.origin_reference || "—"} /></div></AdminCardContent></AdminCard>}

      <AdminCard>
        <AdminCardHeader><h3 className="text-sm font-bold text-foreground">Parcelas</h3></AdminCardHeader>
        <div className="overflow-x-auto">
          <table className="min-w-[620px] w-full"><thead><tr><th className="text-left">Parcela</th><th className="text-left">Vencimento</th><th className="text-right">Valor</th><th className="text-right">Recebido</th><th className="text-right">Em aberto</th></tr></thead>
            <tbody>{detail.installments.map(item => <tr key={item.id}><td className="font-semibold">{item.installment_number}/{item.total_installments}</td><td>{formatDate(item.due_date)}</td><td className="text-right tabular-nums">{formatCurrency(item.original_amount)}</td><td className="text-right tabular-nums">{formatCurrency(item.settled_amount)}</td><td className="text-right font-bold tabular-nums text-primary">{formatCurrency(Math.max(0, Number(item.original_amount) - Number(item.settled_amount)))}</td></tr>)}</tbody>
          </table>
        </div>
      </AdminCard>

      <AdminCard><AdminCardHeader><h3 className="text-sm font-bold text-foreground">Histórico</h3></AdminCardHeader>
        <AdminCardContent>
          {detail.events.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p> : <div className="divide-y divide-border">
            {detail.events.filter(event => !["submitted","resubmitted","approval_recorded","rejected"].includes(event.event_type)).map(event => <div key={event.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{eventLabel(event.event_type)}</p>
                <p className="text-xs text-muted-foreground">{event.created_by ? detail.actor_names?.[event.created_by] || "Responsável não identificado" : "Sistema"}</p></div>
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
    {tab === "documents" && <FinanceDocumentsPanel entryId={detail.id} />}
    {tab === "collections" && <FinanceCollectionsPanel detail={detail} />}
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
  confirmSettlementPending,
  reverseSettlementPending,
  settlementError,
  onBack,
  onEdit,
  onApprove,
  onReject,
  onRegisterSettlement,
  onConfirmSettlement,
  onReverseSettlement,
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
    onReverseSettlement={onReverseSettlement} initialSettlementOpen={initialSettlementOpen}
  />;
}
