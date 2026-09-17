import { ArrowLeft, Pencil } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import type { FinancialAccount, FinancialEntryDetail, FinancialPaymentMethod, FinancialSettlementDraft } from "../domain/finance.types";
import { FinanceApprovalPanel } from "./FinanceApprovalPanel";
import { FinanceSettlementPanel } from "./FinanceSettlementPanel";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function approvalLabel(status: string) {
  return ({ draft: "Rascunho", pending: "Pendente de aprovação", approved: "Aprovado", rejected: "Rejeitado", cancelled: "Cancelado", reversed: "Estornado" } as Record<string, string>)[status] || status;
}

function eventLabel(type: string) {
  return ({
    created: "Lançamento criado",
    submitted: "Enviado para aprovação",
    updated: "Lançamento alterado",
    resubmitted: "Reenviado para aprovação",
    approval_recorded: "Aprovação parcial registrada",
    approved: "Lançamento aprovado",
    rejected: "Lançamento rejeitado",
    settlement_registered: "Baixa registrada",
    settlement_posted: "Liquidação confirmada",
    settlement_reversed: "Baixa estornada",
  } as Record<string, string>)[type] || type;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p><div className="mt-1 break-words text-sm font-semibold text-[#0d1b2e]">{value}</div></div>;
}

export function FinanceEntryDetail({
  detail,
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
}: {
  detail: FinancialEntryDetail;
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
}) {
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><AdminButton variant="secondary" size="sm" onClick={onBack}><ArrowLeft size={15} /> Voltar</AdminButton><div className="min-w-0"><h2 className="truncate text-lg font-black text-[#0d1b2e]">{detail.description}</h2><p className="text-xs text-[#5a6a82]">{detail.entry_type === "receivable" ? "Conta a receber" : "Conta a pagar"} · {approvalLabel(detail.approval_status)}</p></div></div>{canEdit && ["draft", "pending", "rejected"].includes(detail.approval_status) && detail.origin_type === "manual" && <AdminButton onClick={onEdit}><Pencil size={15} /> Editar</AdminButton>}</div>

    <AdminCard><AdminCardHeader><h3 className="text-sm font-black text-[#0d1b2e]">Resumo</h3></AdminCardHeader><AdminCardContent><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Info label="Valor original" value={<span className="text-base font-black text-[#0057e7]">{formatCurrency(detail.original_amount)}</span>} /><Info label="Contraparte" value={detail.counterpart_name_snapshot || "Sem contraparte"} /><Info label="Emissão" value={formatDate(detail.issue_date)} /><Info label="Competência" value={formatDate(detail.competence_date)} /><Info label="Aprovação" value={approvalLabel(detail.approval_status)} /><Info label="Aprovações" value={`${detail.approval_count || 0}/${detail.required_approvals}`} /><Info label="Origem" value={detail.origin_type === "manual" ? "Manual" : detail.origin_type} /><Info label="Documento" value={detail.counterpart_document_snapshot || "—"} /></div>{detail.notes && <div className="mt-4 border-t border-[#0d1b2e]/8 pt-4"><Info label="Observações" value={detail.notes} /></div>}</AdminCardContent></AdminCard>

    <FinanceApprovalPanel detail={detail} canApprove={canApprove} currentUserId={currentUserId} pending={decisionPending} error={decisionError} onApprove={onApprove} onReject={onReject} />

    <FinanceSettlementPanel
      detail={detail}
      accounts={accounts}
      paymentMethods={paymentMethods}
      canSettle={canSettle}
      canReverse={canReverseSettlement}
      settlementPending={settlementPending}
      confirmPending={confirmSettlementPending}
      reversePending={reverseSettlementPending}
      error={settlementError}
      onRegister={onRegisterSettlement}
      onConfirm={onConfirmSettlement}
      onReverse={onReverseSettlement}
    />

    <AdminCard><AdminCardHeader><h3 className="text-sm font-black text-[#0d1b2e]">Parcelas</h3></AdminCardHeader><div className="overflow-x-auto"><table className="min-w-[620px]"><thead><tr><th className="text-left">Parcela</th><th className="text-left">Vencimento</th><th className="text-right">Valor original</th><th className="text-right">Liquidado</th><th className="text-right">Saldo</th></tr></thead><tbody>{detail.installments.map(item => <tr key={item.id}><td className="font-bold">{item.installment_number}/{item.total_installments}</td><td>{formatDate(item.due_date)}</td><td className="text-right font-semibold">{formatCurrency(item.original_amount)}</td><td className="text-right">{formatCurrency(item.settled_amount)}</td><td className="text-right font-black text-[#0057e7]">{formatCurrency(Math.max(0, Number(item.original_amount) - Number(item.settled_amount)))}</td></tr>)}</tbody></table></div></AdminCard>

    <AdminCard><AdminCardHeader><h3 className="text-sm font-black text-[#0d1b2e]">Rateio</h3></AdminCardHeader><div className="overflow-x-auto"><table className="min-w-[620px]"><thead><tr><th className="text-left">Categoria</th><th className="text-left">Centro de custo</th><th className="text-left">Percentual</th><th className="text-right">Valor</th></tr></thead><tbody>{detail.allocations.map(item => <tr key={item.id}><td className="font-bold">{item.category_name_snapshot}</td><td>{item.cost_center_name_snapshot || "—"}</td><td>{Number(item.percentage || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</td><td className="text-right font-black">{formatCurrency(item.amount)}</td></tr>)}</tbody></table></div></AdminCard>

    <AdminCard><AdminCardHeader><h3 className="text-sm font-black text-[#0d1b2e]">Histórico</h3></AdminCardHeader><AdminCardContent className="space-y-3">{detail.events.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhum evento registrado.</p> : detail.events.map(event => <div key={event.id} className="flex gap-3 border-b border-[#0d1b2e]/6 pb-3 last:border-0 last:pb-0"><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0057e7]" /><div><p className="text-sm font-bold text-[#0d1b2e]">{eventLabel(event.event_type)}</p><p className="text-xs text-[#5a6a82]">{new Date(event.created_at).toLocaleString("pt-BR")}</p></div></div>)}</AdminCardContent></AdminCard>
  </div>;
}
