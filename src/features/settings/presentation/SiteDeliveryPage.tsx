import { useState } from "react";
import { MapPin, Store } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSubsectionButtons } from "@/shared/ui/admin/AdminSubsectionButtons";
import { SiteShippingZones } from "./SiteShippingZones";
import { SitePickupSettings } from "./SitePickupSettings";

/** Operação de entregas e retirada exclusiva da Artvideo. */
export function SiteDeliveryPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  const [section, setSection] = useState<"areas" | "pickup">("areas");
  if (!activeOrganization?.is_artvideo_tenant || !hasPermission("site.view") || !hasPermission("site_settings.view")) return null;
  return <div className="min-w-0 space-y-5">
    <PageHeader title="Entrega" subtitle="Controle as regiões atendidas, os valores e a retirada na loja." />
    <AdminSubsectionButtons value={section} ariaLabel="Modalidades de entrega"
      items={[{ id: "areas", label: "Entrega por CEP", Icon: MapPin },
        { id: "pickup", label: "Retirada na loja", Icon: Store }]}
      onChange={setSection} />
    {section === "areas"
      ? <SiteShippingZones onBack={onBack} canUpdate={hasPermission("site_settings.update")} />
      : <SitePickupSettings onBack={onBack} canUpdate={hasPermission("site_settings.update")} />}
  </div>;
}
