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
    submitted: "Enviado para aprovação",
    updated: "Lançamento alterado",
    resubmitted: "Reenviado para aprovação",
    integrated_created: "Lançamento criado pela integração",
    approval_recorded: "Aprovação parcial registrada",
    approved: "Lançamento aprovado",
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
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p><div className="mt-1 break-words text-sm font-semibold text-[#0d1b2e]">{value}</div></div>;
}


type EntryTab = "overview" | "settlements" | "documents" | "collections";

function EntryDetailContent({
  detail, accounts, paymentMethods, canEdit, canApprove, canSettle, canReverseSettlement,
  currentUserId, decisionPending, decisionError, settlementPending, confirmSettlementPending,
  reverseSettlementPending, settlementError, onBack, onEdit, onApprove, onReject,
  onRegisterSettlement, onConfirmSettlement, onReverseSettlement, scrollContainerRef, initialSettlementOpen,
}: Parameters<typeof FinanceEntryDetail>[0]) {
  const [tab, setTab] = useState<EntryTab>(initialSettlementOpen ? "settlements" : "overview");
  const isReceivable = detail.entry_type === "receivable";
  const settledAmount = detail.installments.reduce((sum, item) => sum + Number(item.settled_amount || 0), 0);
  const remaining = detail.installments.reduce((sum, item) => sum + Math.max(0, Number(item.original_amount) - Number(item.settled_amount)), 0);
  const methods = [...new Set(detail.settlements.filter(item => item.settlement_status !== "reversed").map(item => item.payment_method_name_snapshot).filter(Boolean))];
  const due = detail.installments.filter(item => Number(item.original_amount) - Number(item.settled_amount) > 0.0001).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const originLabel = detail.origin_type === "manual" ? "Cadastro manual" : detail.origin_type === "service_order" ? "Ordem de Serviço" : detail.origin_type === "inventory_purchase" ? "Compra de estoque" : detail.origin_type === "recurring" ? "Recorrência" : "Outros";
  const postedEvent = detail.events.find(event => event.event_type === "settlement_posted" && event.created_by);
  const concludedBy = postedEvent?.created_by ? detail.actor_names?.[postedEvent.created_by] : null;
  const editable = canEdit && ["draft", "pending", "rejected", "approved"].includes(detail.approval_status) && detail.origin_type === "manual" && detail.settlements.length === 0;

  return <div className="space-y-4">
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/40 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Extrato da conta a {isReceivable ? "receber" : "pagar"}</p>
          <h3 className="mt-1 break-words text-lg font-bold text-foreground">{detail.description}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{detail.counterpart_name_snapshot || "Cliente não informado"}</p>
        </div>
        {editable && <AdminButton size="sm" variant="secondary" onClick={onEdit}>Editar</AdminButton>}
      </div>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-4"><p className="text-xs text-muted-foreground">Valor da conta</p><p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatCurrency(detail.original_amount)}</p></div>
        <div className="p-4"><p className="text-xs text-muted-foreground">{isReceivable ? "Recebido / baixado" : "Pago / baixado"}</p><p className="mt-1 text-xl font-bold tabular-nums text-emerald-600">{formatCurrency(settledAmount)}</p></div>
        <div className="p-4"><p className="text-xs text-muted-foreground">Saldo em aberto</p><p className="mt-1 text-xl font-bold tabular-nums text-primary">{formatCurrency(remaining)}</p></div>
      </div>
    </div>

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
            <Info label="Forma de pagamento" value={methods.length ? methods.join(", ") : "A definir (sem baixa)"} />
            <Info label="Emissão" value={formatDate(detail.issue_date)} />
            <Info label="Competência" value={formatDate(detail.competence_date)} />
            <Info label="Próximo vencimento" value={formatDate(due?.due_date)} />
            <Info label="Categoria" value={Array.from(new Set(detail.allocations.map(item => item.category_name_snapshot))).join(", ") || "—"} />
            <Info label="Origem" value={originLabel} />
            <Info label="Cadastrado por" value={detail.created_by_name || "Não identificado"} />
            <Info label="Cadastrado em" value={new Date(detail.created_at).toLocaleString("pt-BR")} />
            {detail.updated_by_name && <Info label="Última alteração por" value={detail.updated_by_name} />}
            {detail.last_settlement_by_name && <Info label="Última baixa registrada por" value={detail.last_settlement_by_name} />}
            {concludedBy && <Info label="Liquidação confirmada por" value={concludedBy} />}
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
            {detail.events.map(event => <div key={event.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{eventLabel(event.event_type)}</p>
                <p className="text-xs text-muted-foreground">{event.created_by ? detail.actor_names?.[event.created_by] || "Responsável não identificado" : "Sistema"}</p></div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</span>
            </div>)}
          </div>}
        </AdminCardContent>
      </AdminCard>
    </div>}

    {tab === "settlements" && <FinanceSettlementPanel
      detail={detail} accounts={accounts} paymentMethods={paymentMethods}
      canSettle={canSettle} canReverse={canReverseSettlement} showIcon={false}
      settlementPending={settlementPending} confirmPending={confirmSettlementPending}
      reversePending={reverseSettlementPending} error={settlementError}
      onRegister={onRegisterSettlement} onConfirm={onConfirmSettlement} onReverse={onReverseSettlement}
      initialOpen={initialSettlementOpen}
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
  confirmSettlementPending: boolean;
  reverseSettlementPending: boolean;
  settlementError?: unknown;
  onBack: () => void;
  onEdit: () => void;
  onApprove: () => Promise<void>;
  onReject: (note: string) => Promise<void>;
  onRegisterSettlement: (draft: FinancialSettlementDraft) => Promise<void>;
  onConfirmSettlement: (settlementId: string) => Promise<void>;
  onReverseSettlement: (settlementId: string, reason: string) => Promise<void>;
  initialSettlementOpen?: boolean;
}) {
  return <EntryDetailContent
    detail={detail} accounts={accounts} paymentMethods={paymentMethods}
    scrollContainerRef={scrollContainerRef}
    canEdit={canEdit} canApprove={canApprove} canSettle={canSettle} canReverseSettlement={canReverseSettlement}
    currentUserId={currentUserId} decisionPending={decisionPending} decisionError={decisionError}
    settlementPending={settlementPending} confirmSettlementPending={confirmSettlementPending}
    reverseSettlementPending={reverseSettlementPending} settlementError={settlementError}
    onBack={onBack} onEdit={onEdit} onApprove={onApprove} onReject={onReject}
    onRegisterSettlement={onRegisterSettlement} onConfirmSettlement={onConfirmSettlement}
    onReverseSettlement={onReverseSettlement} initialSettlementOpen={initialSettlementOpen}
  />;
}
