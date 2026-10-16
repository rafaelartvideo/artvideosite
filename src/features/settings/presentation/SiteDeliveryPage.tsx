import { Truck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { SiteShippingZones } from "./SiteShippingZones";

/** Módulo exclusivo da Artvideo; usa as permissões já existentes do site. */
export function SiteDeliveryPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  if (!activeOrganization?.is_artvideo_tenant || !hasPermission("site.view") || !hasPermission("site_settings.view")) return null;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Entrega" subtitle="Gerencie as regiões atendidas, os CEPs e os valores para compras no site." eyebrow="Site" />
    <div className="flex items-start gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-foreground">
      <Truck size={19} className="mt-0.5 shrink-0 text-primary" />
      <p>O valor é definido por CEP ou faixa, sem cálculo por peso. O CEP individual tem preferência quando está dentro de uma faixa maior.</p>
    </div>
    <SiteShippingZones onBack={onBack} canUpdate={hasPermission("site_settings.update")} />
  </div>;
}
