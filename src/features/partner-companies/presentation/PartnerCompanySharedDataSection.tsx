import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Package, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {
  listPartnerShares,
  type PartnerShareAccessLevel,
  type PartnerShareConfigLevel,
} from "../infrastructure/partner-companies.repository";

const TabCustomers = lazy(() => import("@/features/customers/presentation/TabCustomers").then(module => ({ default: module.TabCustomers })));
const TabOrders = lazy(() => import("@/features/orders/presentation/TabOrders").then(module => ({ default: module.TabOrders })));
const PartnerInventoryData = lazy(() => import("./PartnerInventoryData").then(module => ({ default: module.PartnerInventoryData })));

type SharedDataTab = "customers" | "orders" | "inventory";

const DATA_TABS: Array<{ key: SharedDataTab; label: string; icon: LucideIcon }> = [
  { key: "customers", label: "Clientes", icon: Users },
  { key: "orders", label: "Ordens de serviço", icon: ClipboardList },
  { key: "inventory", label: "Estoque", icon: Package },
];

function normalizeShareLevel(level?: PartnerShareAccessLevel): PartnerShareConfigLevel {
  return level === "manage" ? "read" : level || "none";
}

function ResourceAccessMessage({ access, title }: { access: PartnerShareConfigLevel; title: string }) {
  if (access === "none") return <div className="rounded-xl border border-[#0d1b2e]/8 bg-white p-5 text-sm text-[#5a6a82] shadow-sm"><span className="font-bold text-[#0d1b2e]">{title}:</span> esta empresa não compartilha este recurso com a ArtVideo.</div>;
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-[#0d1b2e]">{title} está disponível somente em resumo.</p><p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">Os registros individuais não podem ser abertos neste nível de compartilhamento.</p></div>;
}

function SharedTabFallback() {
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-white p-8 shadow-sm"><LoadingState text="Carregando módulo compartilhado..." /></div>;
}

export function PartnerCompanySharedDataSection({ organizationId }: { organizationId: string }) {
  const [activeTab, setActiveTab] = useState<SharedDataTab>("customers");
  const [customerRouteId, setCustomerRouteId] = useState<string | null>(null);
  const [customerRouteSubpage, setCustomerRouteSubpage] = useState<string | null>(null);
  const [orderRouteId, setOrderRouteId] = useState<string | null>(null);
  const [orderRouteSubpage, setOrderRouteSubpage] = useState<string | null>(null);

  const sharesQuery = useQuery({
    queryKey: ["partner-companies", "shared-data", organizationId],
    queryFn: async () => {
      const { data, error } = await listPartnerShares(organizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const shareByKey = useMemo(
    () => new Map((sharesQuery.data || []).map((item: any) => [item.resource_key, normalizeShareLevel(item.access_level as PartnerShareAccessLevel)])),
    [sharesQuery.data],
  );

  useEffect(() => {
    setCustomerRouteId(null);
    setCustomerRouteSubpage(null);
    setOrderRouteId(null);
    setOrderRouteSubpage(null);
  }, [organizationId, activeTab]);

  if (sharesQuery.isPending) return <LoadingState text="Carregando dados compartilhados..." />;
  if (sharesQuery.isError) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar os acessos aos dados: {(sharesQuery.error as any)?.message || "Erro desconhecido"}</div>;

  const customersAccess = shareByKey.get("customers") || "none";
  const ordersAccess = shareByKey.get("orders") || "none";
  const inventoryAccess = shareByKey.get("inventory") || "none";

  return <div className="min-w-0 space-y-4">
    <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white p-1.5 shadow-sm" aria-label="Seções dos dados compartilhados">
      {DATA_TABS.map(tab => {
        const Icon = tab.icon;
        const selected = activeTab === tab.key;
        return <button
          key={tab.key}
          type="button"
          aria-current={selected ? "page" : undefined}
          onClick={() => setActiveTab(tab.key)}
          className={cn(
            "inline-flex min-h-10 shrink-0 cursor-default items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40",
            selected ? "bg-[#0057e7] text-white shadow-sm" : "text-[#5a6a82] hover:bg-[#0057e7]/5 hover:text-[#0057e7]",
          )}
        >
          <Icon size={15} />
          {tab.label}
        </button>;
      })}
    </nav>

    <div className="min-w-0">
      <Suspense fallback={<SharedTabFallback />}>
        {activeTab === "customers" && (customersAccess === "read" ? <TabCustomers
          organizationIdOverride={organizationId}
          accessMode="read"
          routeResourceId={customerRouteId}
          routeSubpage={customerRouteSubpage}
          onRouteChange={(resourceId, subpage) => {
            setCustomerRouteId(resourceId || null);
            setCustomerRouteSubpage(subpage || null);
          }}
        /> : <ResourceAccessMessage access={customersAccess} title="Clientes" />)}

        {activeTab === "orders" && (ordersAccess === "read" ? <TabOrders
          organizationIdOverride={organizationId}
          accessMode="read"
          initialOrderId={orderRouteId}
          routeSubpage={orderRouteSubpage}
          onOrderRouteChange={(resourceId, subpage) => {
            setOrderRouteId(resourceId || null);
            setOrderRouteSubpage(subpage || null);
          }}
          onOrderRouteClose={() => {
            setOrderRouteId(null);
            setOrderRouteSubpage(null);
          }}
        /> : <ResourceAccessMessage access={ordersAccess} title="Ordens de serviço" />)}

        {activeTab === "inventory" && (inventoryAccess === "read" ? <PartnerInventoryData organizationId={organizationId} /> : <ResourceAccessMessage access={inventoryAccess} title="Estoque" />)}
      </Suspense>
    </div>
  </div>;
}
