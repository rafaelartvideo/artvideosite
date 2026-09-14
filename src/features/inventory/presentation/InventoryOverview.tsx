import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, PackageCheck, PackageX, ShoppingCart, TriangleAlert, Truck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { listInventoryItems } from "../infrastructure/inventory.repository";
import { listInventoryPurchaseAnalytics } from "../infrastructure/inventory-analytics.repository";

function supplierName(value: any) {
  const supplier = Array.isArray(value) ? value[0] : value;
  return supplier?.name || supplier?.trade_name || supplier?.legal_name || "Fornecedor não identificado";
}

function Stat({ icon: Icon, label, value, note }: { icon: any; label: string; value: string; note?: string }) {
  return <AdminCard className="p-4 shadow-none">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] text-[#0057e7]"><Icon size={17} /></div>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[#8a98aa]">{label}</p><p className="mt-1 break-words text-lg font-black text-[#0d1b2e]">{value}</p>{note && <p className="mt-1 text-[11px] text-[#5a6a82]">{note}</p>}</div>
    </div>
  </AdminCard>;
}

export function InventoryOverview() {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("inventory.view");
  const canViewCosts = hasPermission("inventory.costs.view");
  const canViewMovements = hasPermission("inventory.movements.view");
  const [periodDays, setPeriodDays] = useState(30);

  const itemsQuery = useQuery({
    queryKey: ["inventory", "overview", activeOrganizationId, canViewCosts ? "costs" : "safe"],
    queryFn: () => listInventoryItems(activeOrganizationId, canViewCosts),
    enabled: Boolean(activeOrganizationId && canView),
  });

  const purchasesQuery = useQuery({
    queryKey: ["inventory", "purchase-analytics", activeOrganizationId, periodDays],
    queryFn: () => listInventoryPurchaseAnalytics(activeOrganizationId!, periodDays),
    enabled: Boolean(activeOrganizationId && canViewCosts && canViewMovements),
  });

  const items = itemsQuery.data || [];
  const summary = useMemo(() => {
    const active = items.filter((item: any) => item.is_active !== false);
    const zero = active.filter((item: any) => Number(item.quantity || 0) === 0).length;
    const low = active.filter((item: any) => Number(item.quantity || 0) > 0 && Number(item.quantity || 0) <= Number(item.min_quantity || 0)).length;
    const stockValue = active.reduce((total: number, item: any) => total + Number(item.stock_value || 0), 0);
    return { active: active.length, zero, low, stockValue };
  }, [items]);

  const purchases = purchasesQuery.data || [];
  const purchaseSummary = useMemo(() => {
    const suppliers = new Map<string, { name: string; count: number; total: number }>();
    let total = 0;
    purchases.forEach(row => {
      const amount = Number(row.total_cost || 0);
      total += amount;
      const key = row.supplier_entity_id || "unknown";
      const current = suppliers.get(key) || { name: supplierName(row.supplier), count: 0, total: 0 };
      current.count += 1;
      current.total += amount;
      suppliers.set(key, current);
    });
    const bySupplier = Array.from(suppliers.values()).sort((a, b) => b.total - a.total || b.count - a.count);
    return { total, count: purchases.length, bySupplier };
  }, [purchases]);

  if (!canView || !activeOrganizationId) return null;

  return <div className="space-y-4">
    <div className={`grid gap-3 sm:grid-cols-2 ${canViewCosts ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      <Stat icon={PackageCheck} label="Itens ativos" value={formatNumber(summary.active)} />
      <Stat icon={PackageX} label="Itens zerados" value={formatNumber(summary.zero)} note="Itens ativos sem saldo" />
      <Stat icon={TriangleAlert} label="Abaixo do mínimo" value={formatNumber(summary.low)} note="Com saldo maior que zero" />
      {canViewCosts && <Stat icon={Boxes} label="Valor em estoque" value={formatCurrency(summary.stockValue)} note="Quantidade × custo médio" />}
    </div>

    {canViewCosts && canViewMovements && <AdminCard className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2"><ShoppingCart size={16} className="text-[#0057e7]" /><div><p className="text-sm font-black text-[#0d1b2e]">Compras por período e fornecedor</p><p className="text-xs text-[#5a6a82]">Somente entradas registradas como compra.</p></div></div>
        <div className="w-full sm:w-[180px]"><AdminSelect value={periodDays} onValueChange={value => setPeriodDays(Number(value))} ariaLabel="Período das compras" options={[{ value: 7, label: "Últimos 7 dias" }, { value: 30, label: "Últimos 30 dias" }, { value: 90, label: "Últimos 90 dias" }, { value: 365, label: "Últimos 12 meses" }]} /></div>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={ShoppingCart} label="Total comprado" value={formatCurrency(purchaseSummary.total)} />
          <Stat icon={Boxes} label="Entradas de compra" value={formatNumber(purchaseSummary.count)} />
          <Stat icon={Truck} label="Maior fornecedor" value={purchaseSummary.bySupplier[0]?.name || "—"} note={purchaseSummary.bySupplier[0] ? formatCurrency(purchaseSummary.bySupplier[0].total) : undefined} />
        </div>

        {purchasesQuery.isError ? <p className="text-xs font-semibold text-red-600">Não foi possível carregar o resumo de compras.</p> : purchaseSummary.bySupplier.length === 0 ? <p className="py-3 text-center text-sm text-[#5a6a82]">Nenhuma compra registrada neste período.</p> : <div className="overflow-x-auto rounded-xl border border-[#0d1b2e]/8">
          <table className="min-w-[560px]"><thead><tr><th className="text-left">Fornecedor</th><th className="text-right">Entradas</th><th className="text-right">Valor comprado</th></tr></thead><tbody>{purchaseSummary.bySupplier.map((supplier, index) => <tr key={`${supplier.name}-${index}`}><td className="font-semibold text-[#0d1b2e]">{supplier.name}</td><td className="text-right text-xs text-[#5a6a82]">{formatNumber(supplier.count)}</td><td className="text-right text-sm font-black text-[#0d1b2e]">{formatCurrency(supplier.total)}</td></tr>)}</tbody></table>
        </div>}
      </div>
    </AdminCard>}
  </div>;
}
