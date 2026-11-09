import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Package, Users, type LucideIcon } from "lucide-react";
import { AdminSubsectionTabs } from "@/shared/ui/admin/AdminSubsectionTabs";

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
  return <AdminWorkspaceSkeleton variant="details" rows={3} columns={4} />;
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

  if (sharesQuery.isPending) return <AdminWorkspaceSkeleton variant="cards" rows={4} />;
  if (sharesQuery.isError) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar os acessos aos dados: {(sharesQuery.error as any)?.message || "Erro desconhecido"}</div>;

  const customersAccess = shareByKey.get("customers") || "none";
  const ordersAccess = shareByKey.get("orders") || "none";
  const inventoryAccess = shareByKey.get("inventory") || "none";

  return <div className="min-w-0 space-y-4">
    <AdminSubsectionTabs value={activeTab}
      items={DATA_TABS.map(tab => ({ id: tab.key, label: tab.label, Icon: tab.icon }))}
      onChange={setActiveTab} ariaLabel="Seções dos dados compartilhados" />

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
