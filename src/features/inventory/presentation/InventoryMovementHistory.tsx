import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listInventoryMovementsPage } from "../infrastructure/inventory.repository";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { formatCurrency, formatDateTime, formatNumber, cn } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { List } from "lucide-react";

type Props = {
  itemId: string;
  organizationId: string;
  unit: "un" | "cx";
  conversionFactor: number;
  canViewCosts: boolean;
};

function displayQuantity(value: unknown, unit: string, factor: number) {
  const quantity = Number(value ?? 0);
  return unit === "cx" ? quantity / Math.max(1, factor) : quantity;
}

function movementPresentation(value: unknown) {
  switch (String(value || "").toLowerCase()) {
    case "in": return { label: "Entrada", sign: "+", tone: "text-green-600", badge: "bg-green-100 text-green-700" };
    case "out": return { label: "Saída", sign: "-", tone: "text-red-600", badge: "bg-red-100 text-red-700" };
    case "use": return { label: "Uso", sign: "×", tone: "text-blue-600", badge: "bg-blue-100 text-blue-700" };
    case "adjust": return { label: "Ajuste", sign: "~", tone: "text-amber-600", badge: "bg-amber-100 text-amber-700" };
    default: return { label: "Movimentação", sign: "", tone: "text-foreground", badge: "bg-muted text-muted-foreground" };
  }
}

function movementOrigin(value: unknown) {
  switch (String(value || "")) {
    case "purchase": return "Compra";
    case "initial_balance": return "Saldo inicial";
    case "service_order": return "Ordem de serviço";
    case "return": return "Devolução";
    case "manual": return "Manual";
    default: return "Legado";
  }
}

function supplierName(entry: any) {
  const supplier = Array.isArray(entry.supplier) ? entry.supplier[0] : entry.supplier;
  return supplier?.name || supplier?.trade_name || supplier?.legal_name || "—";
}

function HistoryValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 break-words"><strong className="text-foreground">{label}:</strong> {value}</div>;
}

export function InventoryMovementHistory({ itemId, organizationId, unit, conversionFactor, canViewCosts }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const historyQuery = useQuery({
    queryKey: [...queryKeys.inventory.all, "item-history-modal", organizationId, itemId, canViewCosts, page, pageSize],
    queryFn: () => listInventoryMovementsPage(itemId, organizationId, canViewCosts, page, pageSize),
    enabled: Boolean(organizationId && itemId),
  });

  if (historyQuery.isPending) return <LoadingState text="Carregando histórico..." />;
  if (historyQuery.isError) return <EmptyState icon={List} title="Não foi possível carregar o histórico"
    message={systemErrorMessage(historyQuery.error, "Tente novamente.")} />;

  const history = historyQuery.data?.items || [];
  const total = historyQuery.data?.total || 0;
  if (!history.length && !total) return <EmptyState icon={List} title="Nenhuma movimentação registrada" />;

  return <div className="space-y-3" aria-label="Histórico de movimentações do item">
    {historyQuery.isFetching && <p className="text-xs text-muted-foreground" role="status">Atualizando histórico...</p>}
    {history.map((entry: any) => {
      const presentation = movementPresentation(entry.movement_type);
      const displayUnit = entry.display_unit || unit;
      const before = entry.previous_quantity == null ? null : displayQuantity(entry.previous_quantity, unit, conversionFactor);
      const after = entry.resulting_quantity == null ? null : displayQuantity(entry.resulting_quantity, unit, conversionFactor);
      const costFactor = unit === "cx" ? Math.max(1, conversionFactor) : 1;
      return <AdminCard key={entry.id} className="bg-muted/20 p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold", presentation.badge)}>{presentation.label}</span>
            <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{movementOrigin(entry.movement_origin)}</span>
          </div>
          <strong className={cn("text-sm", presentation.tone)}>{presentation.sign}{formatNumber(Number(entry.quantity || 0))} {displayUnit}</strong>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <HistoryValue label="Data" value={formatDateTime(entry.created_at)} />
          <HistoryValue label="Usuário" value={entry.created_by_profile?.full_name || "—"} />
          <HistoryValue label="OS" value={String(entry.service_order?.os_number || "—")} />
          {before !== null && <HistoryValue label="Saldo anterior" value={`${formatNumber(before)} ${unit}`} />}
          {after !== null && <HistoryValue label="Saldo posterior" value={`${formatNumber(after)} ${unit}`} />}
          {displayUnit === "cx" && Number(entry.conversion_factor_snapshot || 0) > 0 &&
            <HistoryValue label="Conversão" value={`${formatNumber(Number(entry.conversion_factor_snapshot))} un/cx`} />}
          {entry.supplier_entity_id && <HistoryValue label="Fornecedor" value={supplierName(entry)} />}
          {entry.purchase_reference && <HistoryValue label="Referência" value={entry.purchase_reference} />}
          {canViewCosts && entry.input_unit_cost != null && <HistoryValue label={`Valor por ${displayUnit}`} value={formatCurrency(entry.input_unit_cost)} />}
          {canViewCosts && entry.total_cost != null && <HistoryValue label="Total da compra" value={formatCurrency(entry.total_cost)} />}
          {canViewCosts && entry.average_cost_before != null &&
            <HistoryValue label="Custo médio anterior" value={formatCurrency(Number(entry.average_cost_before) * costFactor)} />}
          {canViewCosts && entry.average_cost_after != null &&
            <HistoryValue label="Custo médio posterior" value={formatCurrency(Number(entry.average_cost_after) * costFactor)} />}
        </div>
        {(entry.reason || entry.notes) && <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
          {entry.reason && <p><strong>Motivo:</strong> {entry.reason}</p>}
          {entry.notes && <p><strong>Observações:</strong> {entry.notes}</p>}
        </div>}
      </AdminCard>;
    })}
    <PaginationBar page={page} pageSize={pageSize} totalItems={total}
      onPageChange={setPage}
      onPageSizeChange={value => { setPageSize(value); setPage(1); }}
      defaultPageSize={10} pageSizeOptions={[10, 20, 50, 100]} />
  </div>;
}
