import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  Eye,
  Printer,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { cn, formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  AdminButton,
  AdminCard,
  AdminDialog,
  AdminIconButton,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  loadPdvCashSessionReport,
  loadPdvCashSessionsPage,
  type PdvCashSessionReport,
} from "../infrastructure/pdv.repository";
import { printPdvCashReport } from "../domain/pdv-cash-report-print";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function statusPill(status: "open" | "closed") {
  return status === "open"
    ? <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">Aberto</span>
    : <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">Fechado</span>;
}

function movementLabel(type: string) {
  if (type === "receipt") return "Recebimento";
  if (type === "supply") return "Suprimento";
  if (type === "withdraw") return "Sangria";
  if (type === "reversal") return "Estorno";
  if (type === "fee") return "Taxa";
  if (type === "cash_adjustment") return "Ajuste";
  return "Movimentação";
}

export function PdvCashReports({
  onBack,
}: {
  onBack: () => void;
}) {
  const { activeOrganizationId, activeOrganization } = useAuth();
  const organizationId = activeOrganizationId || "";
  const organizationName = activeOrganization?.organization_name || "Empresa";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.pdv.cashSessions(organizationId || "none", page, pageSize),
    queryFn: () => loadPdvCashSessionsPage(organizationId, { page, pageSize }),
    enabled: Boolean(organizationId),
  });

  const reportQuery = useQuery({
    queryKey: queryKeys.pdv.cashSessionReport(organizationId || "none", selectedSessionId || "none"),
    queryFn: () => loadPdvCashSessionReport(organizationId, selectedSessionId!),
    enabled: Boolean(organizationId && selectedSessionId),
  });

  useEffect(() => {
    if (!sessionsQuery.error) return;
    setToast({
      msg: systemErrorMessage(sessionsQuery.error, "Não foi possível carregar os caixas do PDV."),
      type: "error",
    });
  }, [sessionsQuery.error]);

  useEffect(() => {
    if (!reportQuery.error) return;
    setToast({
      msg: systemErrorMessage(reportQuery.error, "Não foi possível carregar o relatório do caixa."),
      type: "error",
    });
  }, [reportQuery.error]);

  const pageData = sessionsQuery.data;
  const sessions = pageData?.items || [];
  const report = reportQuery.data || null;

  const handlePrint = () => {
    if (!report) return;
    try {
      printPdvCashReport(report, organizationName);
    } catch (error) {
      setToast({
        msg: systemErrorMessage(error, "Não foi possível abrir a impressão do relatório."),
        type: "error",
      });
    }
  };

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <PageHeader
      title="Caixas do PDV"
      subtitle="Acompanhe cada turno do caixa, vendas, recebimentos, sangrias, suprimentos e diferenças de fechamento."
      actions={<AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={15} /> Voltar ao PDV</AdminButton>}
    />

    <AdminCard>
      {sessionsQuery.isPending ? <LoadingState text="Carregando caixas..." /> : sessions.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Nenhum caixa registrado"
          message="Abra o primeiro caixa no PDV para iniciar o histórico de turnos."
        />
      ) : <>
        <div className="overflow-x-auto">
          <table className="min-w-[980px]">
            <thead>
              <tr>
                <th className="text-left">Abertura</th>
                <th className="text-left">Operador</th>
                <th className="text-left">Fechamento</th>
                <th className="text-left">Vendas</th>
                <th className="text-right">Esperado</th>
                <th className="text-right">Contado</th>
                <th className="text-right">Diferença</th>
                <th className="text-left">Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => <tr key={session.id}>
                <td className="text-xs text-[#34445b]">{formatDateTime(session.opened_at)}</td>
                <td className="text-xs font-bold text-[#0d1b2e]">{session.opened_by_name || "—"}</td>
                <td className="text-xs text-[#5a6a82]">{formatDateTime(session.closed_at)}</td>
                <td>
                  <p className="text-xs font-black text-[#0d1b2e]">{session.sales_count}</p>
                  <p className="mt-0.5 text-[10px] text-[#7a8aa0]">{formatCurrency(session.sales_total)}</p>
                </td>
                <td className="text-right text-xs font-bold text-[#0d1b2e]">{formatCurrency(session.expected_amount || 0)}</td>
                <td className="text-right text-xs text-[#34445b]">{session.closing_counted_amount == null ? "—" : formatCurrency(session.closing_counted_amount)}</td>
                <td className={cn(
                  "text-right text-xs font-black",
                  session.closing_difference == null
                    ? "text-[#8a98aa]"
                    : Number(session.closing_difference) === 0
                      ? "text-emerald-700"
                      : "text-amber-700",
                )}>
                  {session.closing_difference == null ? "—" : formatCurrency(session.closing_difference)}
                </td>
                <td>{statusPill(session.status)}</td>
                <td>
                  <div className="flex justify-end">
                    <AdminIconButton
                      ariaLabel="Abrir relatório do caixa"
                      title="Relatório"
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <Eye size={15} />
                    </AdminIconButton>
                  </div>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={pageData?.page || page}
          pageSize={pageData?.page_size || pageSize}
          totalItems={pageData?.total_count || 0}
          onPageChange={setPage}
          onPageSizeChange={size => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </>}
    </AdminCard>

    <AdminDialog
      open={Boolean(selectedSessionId)}
      onClose={() => setSelectedSessionId(null)}
      title={report ? (report.session.status === "open" ? "Caixa atual" : "Fechamento de caixa") : "Relatório de caixa"}
      description={report ? report.session.account_name + " · aberto em " + formatDateTime(report.session.opened_at) : "Carregando turno..."}
      className="max-w-5xl"
      footer={report ? <div className="flex justify-end">
        <AdminButton variant="secondary" onClick={handlePrint}><Printer size={14} /> Imprimir relatório</AdminButton>
      </div> : undefined}
    >
      {reportQuery.isPending ? <LoadingState text="Montando relatório..." /> : report ? <CashReportDetail report={report} /> : null}
    </AdminDialog>
  </div>;
}

export function CashReportDetail({
  report,
  compact = false,
}: {
  report: PdvCashSessionReport;
  compact?: boolean;
}) {
  const session = report.session;
  const difference = session.closing_difference;
  const movementItems = compact ? report.movements.slice(0, 6) : report.movements;

  return <div className="space-y-5">
    <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
      <Metric label="Contado na abertura" value={formatCurrency(session.opening_counted_amount)} />
      <Metric label="Esperado agora" value={formatCurrency(session.expected_amount)} emphasis />
      {!compact && <Metric label="Vendas concluídas" value={String(report.sales.completed_count)} detail={formatCurrency(report.sales.completed_total)} />}
      {!compact && <Metric label="Vendas canceladas" value={String(report.sales.cancelled_count)} detail={formatCurrency(report.sales.cancelled_total)} />}
    </div>

    <section>
      <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">Movimento físico do caixa</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MovementMetric icon={TrendingUp} label="Recebimentos" value={report.cash_movements.receipts} positive />
        <MovementMetric icon={TrendingUp} label="Suprimentos" value={report.cash_movements.supplies} positive />
        <MovementMetric icon={TrendingDown} label="Sangrias" value={report.cash_movements.withdrawals} />
        <MovementMetric icon={TrendingDown} label="Estornos" value={report.cash_movements.reversals} />
      </div>
    </section>

    {!compact && <section>
      <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">Vendas por forma de pagamento</h3>
      {report.payment_breakdown.length === 0 ? <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4 text-xs text-[#5a6a82]">Nenhuma venda concluída neste turno.</div> : <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/8">
        <div className="divide-y divide-[#0d1b2e]/6">
          {report.payment_breakdown.map(payment => <div key={payment.payment_method_id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_100px_140px_110px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-[#0d1b2e]">{payment.payment_method_name}</p>
              <p className="mt-0.5 text-[10px] text-[#7a8aa0]">{payment.sales_count} venda{payment.sales_count === 1 ? "" : "s"}</p>
            </div>
            <p className="text-xs text-[#5a6a82]">{payment.method_type}</p>
            <p className="text-sm font-black text-[#0d1b2e] sm:text-right">{formatCurrency(payment.amount)}</p>
            <p className="text-[10px] text-[#7a8aa0] sm:text-right">{Number(payment.fee_amount || 0) > 0 ? "Taxa " + formatCurrency(payment.fee_amount) : "Sem taxa"}</p>
          </div>)}
        </div>
      </div>}
    </section>}

    {session.status === "closed" && !compact && <section>
      <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">Conferência do fechamento</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Esperado" value={formatCurrency(session.closing_expected_amount ?? session.expected_amount)} />
        <Metric label="Contado" value={formatCurrency(session.closing_counted_amount || 0)} />
        <Metric
          label="Diferença"
          value={formatCurrency(difference || 0)}
          tone={Number(difference || 0) === 0 ? "success" : "warning"}
        />
      </div>
      {session.closing_reason && <div className="mt-3 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a8aa0]">Justificativa</p>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#34445b]">{session.closing_reason}</p>
      </div>}
    </section>}

    {!compact && <section>
      <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">Movimentações do turno</h3>
      {movementItems.length === 0 ? <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4 text-xs text-[#5a6a82]">Nenhuma movimentação registrada neste caixa.</div> : <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/8">
        <div className="divide-y divide-[#0d1b2e]/6">
          {movementItems.map(movement => <div key={movement.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[130px_110px_minmax(0,1fr)_120px] sm:items-center">
            <p className="text-[10px] text-[#7a8aa0]">{formatDateTime(movement.occurred_at)}</p>
            <p className="text-[10px] font-black uppercase tracking-wide text-[#5a6a82]">{movementLabel(movement.movement_type)}</p>
            <div className="min-w-0">
              <p className="truncate text-xs text-[#34445b]">{movement.description}</p>
              {movement.created_by_name && <p className="mt-0.5 truncate text-[9px] text-[#8a98aa]">{movement.created_by_name}</p>}
            </div>
            <p className={cn(
              "text-sm font-black sm:text-right",
              movement.direction === "credit" ? "text-emerald-700" : "text-red-700",
            )}>
              {movement.direction === "credit" ? "+ " : "- "}{formatCurrency(movement.amount)}
            </p>
          </div>)}
        </div>
      </div>}
    </section>}
  </div>;
}

function Metric({
  label,
  value,
  detail,
  emphasis = false,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasis?: boolean;
  tone?: "success" | "warning";
}) {
  const valueClass = tone === "success"
    ? "text-emerald-700"
    : tone === "warning"
      ? "text-amber-700"
      : "text-[#0d1b2e]";

  return <div className={cn(
    "rounded-xl border p-3",
    emphasis ? "border-primary/20 bg-primary-soft" : "border-[#0d1b2e]/8 bg-[#f8fafc]",
  )}>
    <p className="text-[9px] font-bold uppercase tracking-wider text-[#8a98aa]">{label}</p>
    <p className={cn("mt-1 text-base font-black", valueClass)}>{value}</p>
    {detail && <p className="mt-0.5 text-[10px] text-[#7a8aa0]">{detail}</p>}
  </div>;
}

function MovementMetric({
  icon: Icon,
  label,
  value,
  positive = false,
}: {
  icon: typeof ReceiptText;
  label: string;
  value: number;
  positive?: boolean;
}) {
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-white p-3">
    <div className="flex items-center gap-2">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
        <Icon size={14} />
      </span>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-[#8a98aa]">{label}</p>
        <p className={cn("mt-0.5 text-sm font-black", positive ? "text-emerald-700" : "text-red-700")}>{formatCurrency(value)}</p>
      </div>
    </div>
  </div>;
}
