import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, History, Printer, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminSearchPanel, AdminSearchClearButton } from "@/shared/ui/admin/AdminSearchPanel";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { printGeneralFinancialReceipt, type GeneralReceiptA4 } from "@/features/pdv/domain/pdv-a4-receipt";
import { FinanceTableSurface } from "./FinanceTableSurface";
import { formatFinancialDocument } from "./financeDisplay";

type Receipt = GeneralReceiptA4 & {
  service_order_id: string | null;
  entity_id: string | null;
  employee_id: string | null;
};
type DirectionFilter = "all" | "received" | "paid";

function receiptLabel(number: number) {
  return "REC-FIN-" + String(number).padStart(6, "0");
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function useDebouncedSearch(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), 300);
    return () => window.clearTimeout(timeout);
  }, [value]);
  return debounced;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0">
    <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold text-foreground">{value || "—"}</dd>
  </div>;
}

export function FinanceReceiptHistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const organizationId = activeOrganizationId || "";
  const canViewReceived = hasPermission("finance.receivables.view");
  const canViewPaid = hasPermission("finance.payables.view");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Receipt | null>(null);

  useEffect(() => { setPage(1); }, [search, direction, pageSize]);
  useEffect(() => { setSelected(null); }, [organizationId]);

  const effectiveDirection = canViewReceived && canViewPaid ? direction : canViewReceived ? "received" : "paid";
  const history = useQuery({
    queryKey: ["finance", "receipt-history", organizationId, page, pageSize, debouncedSearch, effectiveDirection],
    enabled: open && Boolean(organizationId) && (canViewReceived || canViewPaid),
    queryFn: async (): Promise<{ items: Receipt[]; total: number }> => {
      let request = supabase.from("financial_receipts")
        .select("id,receipt_number,direction,entity_id,employee_id,service_order_id,service_order_number,counterpart_name,counterpart_document,description,detail_description,items,total_amount,payment_method_name,notes,issuer_name,organization_name,organization_document,issued_at", { count: "exact" })
        .eq("organization_id", organizationId)
        .order("issued_at", { ascending: false })
        .order("receipt_number", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (effectiveDirection !== "all") request = request.eq("direction", effectiveDirection);

      const term = debouncedSearch.trim().replace(/[^a-zA-ZÀ-ÿ0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
      if (term) {
        const receiptNumber = term.match(/^(?:REC-FIN-?)?0*(\d+)$/i);
        if (receiptNumber) request = request.eq("receipt_number", Number(receiptNumber[1]));
        else {
          const termPattern = "%" + term.replace(/\s+/g, "%") + "%";
          request = request.or(
            "counterpart_name.ilike." + termPattern + ",counterpart_document.ilike." + termPattern
            + ",description.ilike." + termPattern + ",service_order_number.ilike." + termPattern,
          );
        }
      }
      const { data, count, error } = await request;
      if (error) throw error;
      return { items: (data || []) as unknown as Receipt[], total: Number(count || 0) };
    },
  });

  const close = () => {
    setSelected(null);
    onClose();
  };
  const reprint = (receipt: Receipt) => {
    try {
      printGeneralFinancialReceipt(receipt);
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível abrir a impressão do recibo."), "error");
    }
  };

  if (!open) return null;
  const records = history.data?.items || [];
  const total = history.data?.total || 0;
  const directionOptions = [
    { value: "all", label: "Todos os tipos" },
    ...(canViewReceived ? [{ value: "received", label: "Recebidos" }] : []),
    ...(canViewPaid ? [{ value: "paid", label: "Pagos" }] : []),
  ];

  return <AdminDialog open={open} onClose={close}
    title={selected ? receiptLabel(selected.receipt_number) : "Histórico de recibos"}
    description={selected ? "Documento emitido · somente leitura" : "Consulte e reimprima recibos já emitidos, sem gerar um novo documento."}
    className="max-w-5xl" bodyClassName="p-4 md:p-5"
    footer={<div className="flex items-center justify-end gap-2">
      {selected && <AdminButton variant="secondary" onClick={() => setSelected(null)}><ArrowLeft size={15} /> Voltar à lista</AdminButton>}
      <AdminButton variant="secondary" onClick={close}>Fechar</AdminButton>
      {selected && <AdminButton onClick={() => reprint(selected)}><Printer size={15} /> Imprimir / PDF</AdminButton>}
    </div>}
  >
    {selected ? <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 border-b border-border pb-4 sm:grid-cols-4">
        <DetailField label="Tipo" value={selected.direction === "received" ? "Recebido" : "Pago"} />
        <DetailField label="Emissão" value={dateTime(selected.issued_at)} />
        <DetailField label="Ordem de serviço" value={selected.service_order_number ? "OS " + selected.service_order_number : "—"} />
        <DetailField label="Total" value={formatCurrency(Number(selected.total_amount))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label="Cliente / favorecido" value={selected.counterpart_name} />
        <DetailField label="CPF / CNPJ" value={formatFinancialDocument(selected.counterpart_document)} />
        <DetailField label="Motivo" value={selected.description} />
        <DetailField label="Forma de pagamento" value={selected.payment_method_name} />
        <DetailField label="Emitido por" value={selected.issuer_name} />
        <DetailField label="Empresa emitente" value={selected.organization_name} />
      </div>
      {selected.detail_description && <div className="border-t border-border pt-4">
        <DetailField label="Descrição" value={<span className="whitespace-pre-wrap">{selected.detail_description}</span>} />
      </div>}
      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Itens do recibo</h3>
        <FinanceTableSurface>
          <table>
            <thead><tr><th>Descrição</th><th className="text-right">Qtd.</th><th className="text-right">Valor unitário</th><th className="text-right">Subtotal</th></tr></thead>
            <tbody>{(selected.items || []).map((item, index) => <tr key={index}>
              <td className="font-semibold">{item.description}</td>
              <td className="text-right tabular-nums">{Number(item.quantity).toLocaleString("pt-BR")}</td>
              <td className="text-right tabular-nums">{formatCurrency(Number(item.unit_price))}</td>
              <td className="text-right tabular-nums">{formatCurrency(Number(item.quantity) * Number(item.unit_price))}</td>
            </tr>)}</tbody>
          </table>
        </FinanceTableSurface>
        <p className="text-right text-sm font-black text-foreground">Total: {formatCurrency(Number(selected.total_amount))}</p>
      </section>
      {selected.notes && <div className="border-t border-border pt-4">
        <DetailField label="Observações" value={<span className="whitespace-pre-wrap">{selected.notes}</span>} />
      </div>}
      <p className="text-xs text-muted-foreground">Recibo não fiscal. Reimprimir não registra um novo pagamento nem altera o financeiro.</p>
    </div> : <div className="space-y-4">
      <AdminSearchPanel title="Buscar recibo" headerActions={
        (search || direction !== "all") && <AdminSearchClearButton onClick={() => { setSearch(""); setDirection("all"); setPage(1); }} />
      }>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="min-w-0">
            <label htmlFor="financial-receipt-history-search" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Número, cliente, CPF/CNPJ, OS ou motivo</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input id="financial-receipt-history-search" className={INPUT + " h-[42px] pl-9 text-sm"}
                placeholder="Buscar recibo emitido" value={search} onChange={event => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tipo</label>
            <AdminSelect value={direction} onValueChange={value => setDirection(value as DirectionFilter)}
              options={directionOptions} className="h-[42px]" ariaLabel="Filtrar recibos por tipo" />
          </div>
        </div>
      </AdminSearchPanel>
      <FinanceTableSurface pagination={<PaginationBar page={page} pageSize={pageSize}
        totalItems={total} defaultPageSize={10} pageSizeOptions={[10, 20, 50]}
        onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />}>
        {history.isPending ? <LoadingState text="Carregando recibos..." /> : history.isError
          ? <p role="alert" className="p-5 text-sm text-destructive">{systemErrorMessage(history.error, "Não foi possível carregar os recibos.")}</p>
          : records.length === 0 ? <div className="flex flex-col items-center gap-2 p-9 text-center text-muted-foreground">
            <History size={24} className="opacity-60" />
            <p className="text-sm">Nenhum recibo encontrado.</p>
          </div>
          : <table>
            <thead><tr><th>Recibo</th><th>Emissão</th><th>Cliente / favorecido</th><th>Tipo</th><th className="text-right">Valor</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{records.map(receipt => <tr key={receipt.id}>
              <td className="whitespace-nowrap font-bold">{receiptLabel(receipt.receipt_number)}</td>
              <td className="whitespace-nowrap text-xs">{dateTime(receipt.issued_at)}</td>
              <td><div className="max-w-[230px] truncate font-semibold" title={receipt.counterpart_name}>{receipt.counterpart_name}</div>
                {receipt.service_order_number && <span className="text-xs text-muted-foreground">OS {receipt.service_order_number}</span>}
              </td>
              <td><span className={receipt.direction === "received" ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-blue-600 dark:text-blue-400"}>
                {receipt.direction === "received" ? "Recebido" : "Pago"}</span></td>
              <td className="whitespace-nowrap text-right font-bold tabular-nums">{formatCurrency(Number(receipt.total_amount))}</td>
              <td><div className="flex justify-end gap-1">
                <AdminIconButton ariaLabel={"Ver detalhes do recibo " + receiptLabel(receipt.receipt_number)} title="Detalhes"
                  onClick={() => setSelected(receipt)}><Eye size={15} /></AdminIconButton>
                <AdminIconButton ariaLabel={"Reimprimir recibo " + receiptLabel(receipt.receipt_number)} title="Imprimir / PDF"
                  onClick={() => reprint(receipt)}><Printer size={15} /></AdminIconButton>
              </div></td>
            </tr>)}</tbody>
          </table>}
      </FinanceTableSurface>
      {!history.isPending && !history.isError && <p className="px-1 text-xs text-muted-foreground">{total} recibo{total === 1 ? "" : "s"} emitido{total === 1 ? "" : "s"}</p>}
    </div>}
  </AdminDialog>;
}
