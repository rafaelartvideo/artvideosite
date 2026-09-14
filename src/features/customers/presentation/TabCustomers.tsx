import { useNavigate } from "react-router";
import { TabRegistrations } from "@/features/registrations/presentation/TabRegistrations";
import { LegacyTabCustomers } from "./LegacyTabCustomers";

type SharedAccessMode = "default" | "read";

type TabCustomersProps = {
  onOpenOrder?: (id: string, customerId?: string) => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId?: string | null, subpage?: string | null) => void;
  organizationIdOverride?: string | null;
  accessMode?: SharedAccessMode;
  onOpenAccessManagement?: () => void;
};

export function TabCustomers({
  onOpenOrder,
  routeResourceId,
  routeSubpage,
  onRouteChange,
  organizationIdOverride,
  accessMode = "default",
  onOpenAccessManagement,
}: TabCustomersProps) {
  const navigate = useNavigate();

  if (accessMode === "read") {
    return <LegacyTabCustomers
      onOpenOrder={onOpenOrder}
      routeResourceId={routeResourceId}
      routeSubpage={routeSubpage}
      onRouteChange={onRouteChange}
      organizationIdOverride={organizationIdOverride}
      accessMode={accessMode}
    />;
  }

  if (routeSubpage === "customer") {
    return <LegacyTabCustomers
      onOpenOrder={onOpenOrder}
      routeResourceId={routeResourceId}
      routeSubpage={null}
      onRouteChange={(resourceId, subpage) => {
        if (!resourceId) onRouteChange?.(null, null);
        else if (subpage === "edit") onRouteChange?.(resourceId, "edit");
        else onRouteChange?.(resourceId, "customer");
      }}
      organizationIdOverride={organizationIdOverride}
      accessMode="default"
    />;
  }

  return <TabRegistrations
    routeResourceId={routeResourceId}
    routeSubpage={routeSubpage}
    onRouteChange={onRouteChange}
    onOpenCustomerHistory={customerId => onRouteChange?.(customerId, "customer")}
    onOpenAccessManagement={onOpenAccessManagement ?? (() => navigate("/admin/operation/employees"))}
  />;
}
