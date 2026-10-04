import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Eye, Printer, ReceiptText, Search, ShoppingCart } from "lucide-react";
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
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminMobileSearchSwitch } from "@/shared/ui/admin/AdminMobileSearchSwitch";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  cancelPdvSale,
  loadPdvSaleDetail,
  loadPdvSalesPage,
  type PdvSaleDetail,
} from "../infrastructure/pdv.repository";
import { printPdvReceipt } from "../domain/pdv-receipt-print";

function useDebouncedValue(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function statusBadge(status: "completed" | "cancelled") {
  return status === "completed"
    ? <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">Concluída</span>
    : <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-700">Cancelada</span>;
}

export function PdvSalesHistory({
  onBack,
  onNewSale,
  canStartSale,
}: {
  onBack: () => void;
  onNewSale: () => void;
  canStartSale: boolean;
}) {
  const { activeOrganizationId, activeOrganization, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationName = activeOrganization?.organization_name || "Empresa";
  const canCancel = hasPermission("pdv.sales.cancel");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState<"" | "completed" | "cancelled">("");
  const [mobileSearchField, setMobileSearchField] = useState<"query" | "status">("query");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const salesQuery = useQuery({
    queryKey: queryKeys.pdv.salesPage(organizationId || "none", page, pageSize, debouncedSearch, status),
    queryFn: () => loadPdvSalesPage(organizationId, {
      page,
      pageSize,
      search: debouncedSearch,
      status,
    }),
    enabled: Boolean(organizationId),
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.pdv.saleDetail(organizationId || "none", selectedSaleId || "none"),
    queryFn: () => loadPdvSaleDetail(organizationId, selectedSaleId!),
    enabled: Boolean(organizationId && selectedSaleId),
  });

  useEffect(() => {
    if (!salesQuery.error) return;
    setToast({ msg: systemErrorMessage(salesQuery.error, "Não foi possível carregar as vendas do PDV."), type: "error" });
  }, [salesQuery.error]);

  useEffect(() => {
    if (!detailQuery.error) return;
    setToast({ msg: systemErrorMessage(detailQuery.error, "Não foi possível carregar os detalhes da venda."), type: "error" });
  }, [detailQuery.error]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSaleId) throw new Error("Venda não selecionada.");
      return cancelPdvSale(organizationId, selectedSaleId, cancelReason);
    },
    onSuccess: async () => {
      setCancelOpen(false);
      setCancelReason("");
      setToast({ msg: "Venda cancelada. Estoque e Financeiro foram estornados.", type: "success" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pdv.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ]);
    },
    onError: error => setToast({ msg: systemErrorMessage(error, "Não foi possível cancelar a venda."), type: "error" }),
  });

  const pageData = salesQuery.data;
  const sales = pageData?.items || [];
  const detail = detailQuery.data || null;

  const openCancel = () => {
    if (!detail || detail.status === "cancelled") return;
    setCancelReason("");
    setCancelOpen(true);
  };

  const handlePrint = () => {
    if (!detail) return;
    try {
      printPdvReceipt(detail, organizationName);
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível abrir a impressão do comprovante."), type: "error" });
    }
  };

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <PageHeader
      title="Vendas do PDV"
      subtitle="Consulte vendas concluídas e canceladas, abra o comprovante e faça estornos quando necessário."
      actions={<div className="flex flex-wrap justify-end gap-2">
        <AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={15} /> Voltar ao PDV</AdminButton>
        <AdminButton disabled={!canStartSale} onClick={onNewSale} title={!canStartSale ? "Abra e configure o caixa antes de iniciar a venda." : "Nova venda"}><ShoppingCart size={15} /> Nova venda</AdminButton>
      </div>}
    />

    <AdminSearchPanel title="Buscar vendas">
      <AdminMobileSearchSwitch
        value={mobileSearchField}
        options={[{ value: "query", label: "Venda / cliente / documento" }, { value: "status", label: "Situação" }]}
        onChange={setMobileSearchField}
      >
        {mobileSearchField === "query" ? <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Número da venda, cliente ou CPF/CNPJ"
            className={cn(INPUT, "h-[42px] w-full pl-9")}
          />
        </div> : <AdminSelect
          value={status}
          onValueChange={value => setStatus(value as "" | "completed" | "cancelled")}
          options={[
            { value: "", label: "Todas as situações" },
            { value: "completed", label: "Concluídas" },
            { value: "cancelled", label: "Canceladas" },
          ]}
          ariaLabel="Filtrar situação da venda"
        />}
      </AdminMobileSearchSwitch>
      <div className="hidden gap-3 md:grid md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Número da venda, cliente ou CPF/CNPJ"
            className={cn(INPUT, "pl-9")}
          />
        </div>
        <AdminSelect
          value={status}
          onValueChange={value => setStatus(value as "" | "completed" | "cancelled")}
          options={[
            { value: "", label: "Todas as situações" },
            { value: "completed", label: "Concluídas" },
            { value: "cancelled", label: "Canceladas" },
          ]}
          ariaLabel="Filtrar situação da venda"
        />
      </div>
    </AdminSearchPanel>

    <AdminCard>
      {salesQuery.isPending ? <LoadingState text="Carregando vendas..." /> : sales.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={debouncedSearch || status ? "Nenhuma venda encontrada" : "Nenhuma venda registrada"}
          message={debouncedSearch || status ? "Altere os filtros para tentar novamente." : "As vendas finalizadas no PDV aparecerão aqui."}
        />
      ) : <>
        <div className="overflow-x-auto">
          <table className="min-w-[900px]">
            <thead>
              <tr>
                <th className="text-left">Venda</th>
                <th className="text-left">Data</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">Pagamento</th>
                <th className="text-left">Operador</th>
                <th className="text-left">Situação</th>
                <th className="text-right">Total</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => <tr key={sale.id}>
                <td className="font-black text-[#0d1b2e]">#{sale.sale_number}</td>
                <td className="text-xs text-[#5a6a82]">{formatDateTime(sale.sold_at)}</td>
                <td>
                  <p className="max-w-[220px] truncate text-xs font-bold text-[#0d1b2e]">{sale.customer_name || "Consumidor não identificado"}</p>
                  {sale.customer_document && <p className="mt-0.5 text-[10px] text-[#7a8aa0]">{sale.customer_document}</p>}
                </td>
                <td className="text-xs text-[#5a6a82]">{sale.payment_methods.length ? sale.payment_methods.join(" + ") : "—"}</td>
                <td className="text-xs text-[#5a6a82]">{sale.sold_by_name || "—"}</td>
                <td>{statusBadge(sale.status)}</td>
                <td className="text-right text-sm font-black text-[#0d1b2e]">{formatCurrency(sale.total_amount)}</td>
                <td>
                  <div className="flex justify-end">
                    <AdminIconButton ariaLabel={"Abrir venda " + sale.sale_number} title="Detalhes" onClick={() => setSelectedSaleId(sale.id)}><Eye size={15} /></AdminIconButton>
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
      open={Boolean(selectedSaleId)}
      onClose={() => {
        if (cancelMutation.isPending) return;
        setSelectedSaleId(null);
      }}
      title={detail ? "Venda #" + detail.sale_number : "Detalhes da venda"}
      description={detail ? formatDateTime(detail.sold_at) : "Carregando informações da venda..."}
      className="max-w-4xl"
      footer={detail ? <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {detail.status === "cancelled" && <span className="text-xs font-bold text-red-700">Venda cancelada em {formatDateTime(detail.cancelled_at)}</span>}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {canCancel && detail.status === "completed" && <AdminButton variant="danger" onClick={openCancel}><Ban size={14} /> Cancelar venda</AdminButton>}
          <AdminButton variant="secondary" onClick={handlePrint}><Printer size={14} /> Imprimir comprovante</AdminButton>
        </div>
      </div> : undefined}
    >
      {detailQuery.isPending ? <LoadingState text="Carregando detalhes..." /> : detail ? <SaleDetail detail={detail} /> : null}
    </AdminDialog>

    <AdminDialog
      open={cancelOpen}
      onClose={() => {
        if (cancelMutation.isPending) return;
        setCancelOpen(false);
      }}
      title={detail ? "Cancelar venda #" + detail.sale_number : "Cancelar venda"}
      description="Esta ação devolve os produtos ao estoque e estorna todos os recebimentos vinculados à venda."
      className="max-w-lg"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <AdminButton variant="secondary" disabled={cancelMutation.isPending} onClick={() => setCancelOpen(false)}>Voltar</AdminButton>
        <AdminButton
          variant="danger"
          disabled={!cancelReason.trim()}
          loading={cancelMutation.isPending}
          loadingText="Cancelando..."
          onClick={() => cancelMutation.mutate()}
        >
          Confirmar cancelamento
        </AdminButton>
      </div>}
    >
      <FTextarea
        label="Motivo do cancelamento"
        rows={4}
        value={cancelReason}
        onChange={(event: any) => setCancelReason(event.target.value)}
        placeholder="Descreva o motivo do cancelamento"
      />
      {detail?.payments.some(payment => payment.method_type === "cash") && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">Como esta venda recebeu dinheiro, o caixa precisa estar aberto para registrar corretamente a saída do estorno.</p>}
    </AdminDialog>
  </div>;
}

function SaleDetail({ detail }: { detail: PdvSaleDetail }) {
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Info label="Situação" value={detail.status === "completed" ? "Concluída" : "Cancelada"} />
      <Info label="Operador" value={detail.sold_by_name || "—"} />
      <Info label="Cliente" value={detail.customer_name || "Consumidor não identificado"} />
      <Info label="Total" value={formatCurrency(detail.total_amount)} strong />
    </div>

    {detail.status === "cancelled" && <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-xs font-black text-red-800">Venda cancelada</p>
      <p className="mt-1 text-xs text-red-700">{detail.cancellation_reason || "Sem motivo informado."}</p>
      <p className="mt-2 text-[10px] text-red-600">{formatDateTime(detail.cancelled_at)} · {detail.cancelled_by_name || "Usuário"}</p>
    </div>}

    <section>
      <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">Produtos</h3>
      <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/8">
        <div className="divide-y divide-[#0d1b2e]/6">
          {detail.items.map(item => <div key={item.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_90px_120px_120px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-[#0d1b2e]">{item.product_name}</p>
              <p className="mt-0.5 text-[10px] text-[#7a8aa0]">{item.sku || item.barcode || "Sem SKU"}</p>
            </div>
            <p className="text-xs text-[#5a6a82]">{item.quantity} {item.unit}</p>
            <p className="text-xs text-[#5a6a82]">{formatCurrency(item.unit_price)}</p>
            <div className="sm:text-right">
              <p className="text-sm font-black text-[#0d1b2e]">{formatCurrency(item.line_total)}</p>
              {Number(item.discount_amount || 0) > 0 && <p className="mt-0.5 text-[10px] font-bold text-emerald-700">- {formatCurrency(item.discount_amount)}</p>}
            </div>
          </div>)}
        </div>
      </div>
    </section>

    <section>
      <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">Pagamentos</h3>
      <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/8">
        <div className="divide-y divide-[#0d1b2e]/6">
          {detail.payments.map(payment => <div key={payment.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:items-center">
            <div>
              <p className="text-xs font-black text-[#0d1b2e]">{payment.payment_method_name}</p>
              <p className="mt-0.5 text-[10px] text-[#7a8aa0]">{payment.financial_account_name}</p>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#5a6a82]">{payment.settlement_status === "reversed" ? "Estornado" : payment.settlement_status === "scheduled" ? "Agendado" : "Recebido"}</p>
            <div className="sm:text-right">
              <p className="text-sm font-black text-[#0d1b2e]">{formatCurrency(payment.amount)}</p>
              {Number(payment.change_amount || 0) > 0 && <p className="mt-0.5 text-[10px] text-[#5a6a82]">Troco {formatCurrency(payment.change_amount)}</p>}
            </div>
          </div>)}
        </div>
      </div>
    </section>

    <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4">
      <div className="space-y-2 text-xs">
        <div className="flex justify-between gap-3"><span className="text-[#5a6a82]">Subtotal</span><strong>{formatCurrency(detail.subtotal)}</strong></div>
        {Number(detail.discount_amount || 0) > 0 && <div className="flex justify-between gap-3 text-emerald-700"><span>Desconto</span><strong>- {formatCurrency(detail.discount_amount)}</strong></div>}
        {Number(detail.surcharge_amount || 0) > 0 && <div className="flex justify-between gap-3 text-amber-700"><span>Acréscimo</span><strong>+ {formatCurrency(detail.surcharge_amount)}</strong></div>}
        <div className="flex justify-between gap-3 border-t border-[#0d1b2e]/8 pt-2 text-sm"><span className="font-black text-[#0d1b2e]">Total</span><strong className="text-lg text-[#0d1b2e]">{formatCurrency(detail.total_amount)}</strong></div>
        {Number(detail.change_amount || 0) > 0 && <div className="flex justify-between gap-3 text-primary"><span>Troco</span><strong>{formatCurrency(detail.change_amount)}</strong></div>}
      </div>
    </div>

    {detail.notes && <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a8aa0]">Observação</p>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#34445b]">{detail.notes}</p>
    </div>}
  </div>;
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
    <p className="text-[9px] font-bold uppercase tracking-wider text-[#8a98aa]">{label}</p>
    <p className={cn("mt-1 break-words text-xs text-[#0d1b2e]", strong ? "text-base font-black" : "font-bold")}>{value}</p>
  </div>;
}
