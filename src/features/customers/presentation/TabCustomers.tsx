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
};

export function TabCustomers({
  onOpenOrder,
  routeResourceId,
  routeSubpage,
  onRouteChange,
  organizationIdOverride,
  accessMode = "default",
}: TabCustomersProps) {
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
    const registrationId = routeResourceId;
    return <LegacyTabCustomers
      onOpenOrder={onOpenOrder}
      routeResourceId={routeResourceId}
      routeSubpage={null}
      onRouteChange={(resourceId, subpage) => {
        if (!resourceId) {
          onRouteChange?.(registrationId || null, null);
          return;
        }
        if (subpage === "edit") {
          onRouteChange?.(registrationId || resourceId, "edit");
          return;
        }
        onRouteChange?.(registrationId || resourceId, "customer");
      }}
      organizationIdOverride={organizationIdOverride}
      accessMode="default"
    />;
  }

  return <TabRegistrations
    routeResourceId={routeResourceId}
    routeSubpage={routeSubpage}
    onRouteChange={onRouteChange}
    onOpenCustomerHistory={registrationId => onRouteChange?.(registrationId, "customer")}
  />;
}
