import { useState } from "react";
import { MapPin, Store } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { SiteShippingZones } from "./SiteShippingZones";
import { SitePickupSettings } from "./SitePickupSettings";

/** Operação de entregas e retirada exclusiva da Artvideo. */
export function SiteDeliveryPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  const [section, setSection] = useState<"areas" | "pickup">("areas");
  if (!activeOrganization?.is_artvideo_tenant || !hasPermission("site.view") || !hasPermission("site_settings.view")) return null;
  return <div className="min-w-0 space-y-5">
    <PageHeader title="Entrega" subtitle="Controle as regiões atendidas, os valores e a retirada na loja." />
    <nav aria-label="Modalidades de entrega" className="flex flex-wrap gap-2 border-b border-border pb-3">
      <button type="button" onClick={() => setSection("areas")}
        aria-current={section === "areas" ? "page" : undefined}
        className={"inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-xs font-bold transition-colors " +
          (section === "areas" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
        <MapPin size={16}/> Entrega por CEP
      </button>
      <button type="button" onClick={() => setSection("pickup")}
        aria-current={section === "pickup" ? "page" : undefined}
        className={"inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-xs font-bold transition-colors " +
          (section === "pickup" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
        <Store size={16}/> Retirada na loja
      </button>
    </nav>
    {section === "areas"
      ? <SiteShippingZones onBack={onBack} canUpdate={hasPermission("site_settings.update")} />
      : <SitePickupSettings onBack={onBack} canUpdate={hasPermission("site_settings.update")} />}
  </div>;
}
