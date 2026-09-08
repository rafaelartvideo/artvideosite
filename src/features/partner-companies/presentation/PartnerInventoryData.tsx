import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eraser, History, MapPin, Package } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { listInventoryItems, listInventoryMovements } from "@/features/inventory/infrastructure/inventory.repository";
import { AdminButton, AdminCard, AdminDialog, AdminIconButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/shared/domain/formatters";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
const unitLabel = (unit?: string | null) => unit === "cx" ? "cx" : "un";
const conversionFactor = (item: any) => Math.max(1, Number(item?.conversion_factor ?? 1) || 1);
const storageAddress = (item: any) => [
  item?.storage_shelf ? `Estante ${item.storage_shelf}` : "",
  item?.storage_level ? `Prateleira ${item.storage_level}` : "",
  item?.storage_compartment ? `Compartimento ${item.storage_compartment}` : "",
].filter(Boolean).join(" · ");

function movementLabel(value: unknown) {
  const type = String(value || "").toLowerCase();
  if (type === "in") return "Entrada";
  if (type === "out") return "Saída";
  if (type === "adjust") return "Ajuste";
  if (type === "use") return "Uso em OS";
  return String(value || "Movimentação");
}

export function PartnerInventoryData({ organizationId }: { organizationId: string }) {
  const { hasPermission } = useAuth();
  const canViewTable = hasPermission("inventory.table.view");
  const canViewDetails = hasPermission("inventory.details.view");
  const canViewMovements = hasPermission("inventory.movements.view");
  const showName = hasPermission("inventory.table.name");
  const showSku = hasPermission("inventory.table.sku");
  const showUnit = hasPermission("inventory.table.unit");
  const showQuantity = hasPermission("inventory.table.quantity");
  const showMinQuantity = hasPermission("inventory.table.min_quantity");
  const showPurchasePrice = hasPermission("inventory.table.purchase_price");
  const showSalePrice = hasPermission("inventory.table.sale_price");
  const showStatus = hasPermission("inventory.table.status");
  const showActions = hasPermission("inventory.table.actions") && (canViewDetails || canViewMovements);

  const itemsQuery = useQuery({
    queryKey: [...queryKeys.inventory.lists(), "partner-read", organizationId],
    queryFn: () => listInventoryItems(organizationId),
    enabled: Boolean(organizationId && canViewTable),
  });
  const items = itemsQuery.data ?? [];

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setDetailItem(null);
    setHistoryItem(null);
    setPage(1);
  }, [organizationId]);
  useEffect(() => {
    if (itemsQuery.error) setToast({ msg: `Erro ao carregar estoque: ${supabaseErrorMessage(itemsQuery.error)}`, type: "error" });
  }, [itemsQuery.error]);

  const filtered = useMemo(() => items.filter((item: any) => {
    if (nameSearch && !normalize(item.name).includes(normalize(nameSearch))) return false;
    if (skuSearch && !normalize(item.sku).includes(normalize(skuSearch))) return false;
    if (addressSearch && !normalize(`${storageAddress(item)} ${item.storage_shelf || ""} ${item.storage_level || ""} ${item.storage_compartment || ""}`).includes(normalize(addressSearch))) return false;
    return true;
  }), [items, nameSearch, skuSearch, addressSearch]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = Boolean(nameSearch || skuSearch || addressSearch);

  useEffect(() => setPage(1), [nameSearch, skuSearch, addressSearch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const clearFilters = () => {
    setNameSearch("");
    setSkuSearch("");
    setAddressSearch("");
    setPage(1);
  };

  const openHistory = async (item: any) => {
    if (!canViewMovements) return;
    setHistoryItem(item);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await listInventoryMovements(item.id, organizationId));
    } catch (error) {
      setToast({ msg: `Erro ao carregar histórico: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!canViewTable) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">Seu perfil não possui permissão para visualizar a tabela de estoque.</div>;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Estoque" subtitle={`${items.length} item${items.length !== 1 ? "s" : ""} cadastrado${items.length !== 1 ? "s" : ""}`} />

    <AdminSearchPanel title="Buscar estoque">
      <div className="grid gap-3 md:grid-cols-3">
        <FInput label="Nome" value={nameSearch} onChange={(e: any) => setNameSearch(e.target.value)} placeholder="Digite o nome da peça" />
        <FInput label="SKU" value={skuSearch} onChange={(e: any) => setSkuSearch(e.target.value)} placeholder="Digite o SKU" />
        <FInput label="Endereço" value={addressSearch} onChange={(e: any) => setAddressSearch(e.target.value)} placeholder="Estante, prateleira ou compartimento" />
      </div>
      {hasFilters && <div className="mt-3 flex justify-end"><AdminButton variant="danger" size="sm" onClick={clearFilters} className="bg-white text-red-600 hover:bg-red-50"><Eraser size={14} /> Limpar filtros</AdminButton></div>}
    </AdminSearchPanel>

    <AdminCard>
      {itemsQuery.isPending ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Package} title={items.length ? "Nenhum item encontrado" : "Nenhum item em estoque"} message={items.length ? "Ajuste os filtros para encontrar o item." : "Não há itens cadastrados nesta empresa."} /> : <>
        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">
          {paged.map((item: any) => {
            const quantity = Number(item.quantity ?? 0);
            const minQuantity = Number(item.min_quantity ?? 0);
            return <article key={item.id} className="space-y-3 p-4">
              <button type="button" onClick={() => canViewDetails && setDetailItem(item)} className="flex w-full items-start justify-between gap-3 text-left">
                <div className="min-w-0">{showName && <p className="break-words text-sm font-black text-[#0d1b2e]">{item.name}</p>}{showSku && <p className="mt-1 font-mono text-[10px] font-semibold text-[#5a6a82]">SKU {item.sku || "—"}</p>}</div>
                {showStatus && <StatusBadge status={item.is_active !== false ? "Ativo" : "Inativo"} />}
              </button>
              {storageAddress(item) && <div className="flex items-start gap-2 rounded-lg bg-[#f5f7fa] px-3 py-2 text-xs font-semibold text-[#34445b]"><MapPin size={14} className="mt-0.5 shrink-0 text-[#0057e7]" /><span>{storageAddress(item)}</span></div>}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {showQuantity && <Info label="Quantidade" value={`${formatNumber(quantity)} ${showUnit ? unitLabel(item.unit) : ""}`} valueClass={quantity <= 0 ? "text-red-700" : quantity <= minQuantity ? "text-amber-700" : "text-emerald-700"} />}
                {showMinQuantity && <Info label="Mínimo" value={`${formatNumber(minQuantity)} ${showUnit ? unitLabel(item.unit) : ""}`} />}
                {showPurchasePrice && <Info label="Compra" value={formatCurrency(item.purchase_price)} />}
                {showSalePrice && <Info label="Venda" value={formatCurrency(item.sale_price)} />}
              </div>
              {showActions && <div className="flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 pt-3">
                {canViewDetails && <AdminButton variant="secondary" size="sm" onClick={() => setDetailItem(item)}>Detalhes</AdminButton>}
                {canViewMovements && <AdminIconButton ariaLabel="Histórico de movimentações" onClick={() => void openHistory(item)}><History size={15} /></AdminIconButton>}
              </div>}
            </article>;
          })}
        </div>
        <div className="hidden overflow-x-auto md:block"><table className="min-w-[860px]"><thead><tr>{showName && <th className="text-left">Nome</th>}{showSku && <th className="text-left">SKU</th>}<th className="text-left">Endereço</th>{showQuantity && <th className="text-left">Quantidade</th>}{showMinQuantity && <th className="text-left">Mínimo</th>}{showPurchasePrice && <th className="text-left">Compra</th>}{showSalePrice && <th className="text-left">Venda</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>
          {paged.map((item: any) => <tr key={item.id} onClick={() => canViewDetails && setDetailItem(item)}>
            {showName && <td><p className="font-semibold text-[#0d1b2e]">{item.name}</p>{item.description && <p className="max-w-xs truncate text-[11px] text-[#5a6a82]">{item.description}</p>}</td>}
            {showSku && <td className="font-mono text-xs text-[#5a6a82]">{item.sku || "—"}</td>}
            <td className="text-xs text-[#5a6a82]">{storageAddress(item) || "—"}</td>
            {showQuantity && <td className="font-black text-[#0d1b2e]">{formatNumber(item.quantity)} {showUnit ? unitLabel(item.unit) : ""}</td>}
            {showMinQuantity && <td className="text-xs text-[#5a6a82]">{formatNumber(item.min_quantity)} {showUnit ? unitLabel(item.unit) : ""}</td>}
            {showPurchasePrice && <td className="text-xs font-semibold text-[#0d1b2e]">{formatCurrency(item.purchase_price)}</td>}
            {showSalePrice && <td className="text-xs font-semibold text-[#0d1b2e]">{formatCurrency(item.sale_price)}</td>}
            {showStatus && <td><StatusBadge status={item.is_active !== false ? "Ativo" : "Inativo"} /></td>}
            {showActions && <td onClick={event => event.stopPropagation()}><div className="flex justify-end gap-1.5">{canViewDetails && <AdminButton variant="secondary" size="sm" onClick={() => setDetailItem(item)}>Detalhes</AdminButton>}{canViewMovements && <AdminIconButton ariaLabel="Histórico de movimentações" onClick={() => void openHistory(item)}><History size={15} /></AdminIconButton>}</div></td>}
          </tr>)}
        </tbody></table></div>
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={next => { setPageSize(next); setPage(1); }} defaultPageSize={5} />
      </>}
    </AdminCard>

    <AdminDialog open={Boolean(detailItem)} onClose={() => setDetailItem(null)} title={detailItem?.name || "Detalhes do item"} description="Informações do estoque desta empresa.">
      {detailItem && <div className="grid gap-4 sm:grid-cols-2"><Info label="Nome" value={detailItem.name || "—"} /><Info label="SKU" value={detailItem.sku || "—"} /><Info label="Status" value={detailItem.is_active !== false ? "Ativo" : "Inativo"} /><Info label="Unidade" value={`${unitLabel(detailItem.unit)}${detailItem.unit === "cx" ? ` · ${conversionFactor(detailItem)} un/cx` : ""}`} /><Info label="Quantidade" value={`${formatNumber(detailItem.quantity)} ${unitLabel(detailItem.unit)}`} /><Info label="Quantidade mínima" value={`${formatNumber(detailItem.min_quantity)} ${unitLabel(detailItem.unit)}`} />{showPurchasePrice && <Info label="Preço de compra" value={formatCurrency(detailItem.purchase_price)} />}{showSalePrice && <Info label="Preço de venda" value={formatCurrency(detailItem.sale_price)} />}<div className="sm:col-span-2"><Info label="Endereço no estoque" value={storageAddress(detailItem) || "—"} /></div>{detailItem.description && <div className="sm:col-span-2"><Info label="Descrição" value={detailItem.description} /></div>}</div>}
    </AdminDialog>

    <AdminDialog open={Boolean(historyItem)} onClose={() => setHistoryItem(null)} title={historyItem ? `Movimentações · ${historyItem.name}` : "Movimentações"} description="Histórico do item nesta empresa." className="max-w-2xl">
      {historyLoading ? <LoadingState /> : history.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma movimentação registrada.</p> : <div className="divide-y divide-[#0d1b2e]/8">{history.map((movement: any) => <div key={movement.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-black text-[#0d1b2e]">{movementLabel(movement.movement_type)} · {formatNumber(movement.quantity)} {movement.display_unit || unitLabel(historyItem?.unit)}</p><p className="mt-1 text-xs text-[#5a6a82]">{movement.reason || "Sem motivo informado"}</p>{movement.service_order?.os_number && <p className="mt-1 text-[11px] font-semibold text-[#0057e7]">OS #{movement.service_order.os_number}</p>}</div><div className="shrink-0 text-xs text-[#5a6a82] sm:text-right"><p>{formatDateTime(movement.created_at)}</p><p className="mt-1">{movement.created_by_profile?.full_name || "Sistema"}</p></div></div>)}</div>}
    </AdminDialog>
  </div>;
}

function Info({ label, value, valueClass = "text-[#0d1b2e]" }: { label: string; value: string; valueClass?: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p><p className={cn("mt-1 break-words text-sm font-semibold", valueClass)}>{value}</p></div>;
}
