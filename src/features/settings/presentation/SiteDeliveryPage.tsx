import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { SiteShippingZones } from "./SiteShippingZones";

/** Módulo exclusivo da Artvideo; usa as permissões já existentes do site. */
export function SiteDeliveryPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  if (!activeOrganization?.is_artvideo_tenant || !hasPermission("site.view") || !hasPermission("site_settings.view")) return null;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Entrega" subtitle="Gerencie os CEPs atendidos, as regiões, os valores e os prazos de entrega." />
    <SiteShippingZones onBack={onBack} canUpdate={hasPermission("site_settings.update")} />
  </div>;
}
