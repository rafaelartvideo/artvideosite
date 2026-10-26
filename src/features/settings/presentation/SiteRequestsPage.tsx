import { ClipboardList, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { isAdminModuleEnabled } from "@/features/admin-shell/navigation-config";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { TabQuotes } from "@/features/quotes/presentation/TabQuotes";
import { SiteStoreOrdersPage } from "./SiteStoreOrdersPage";

type RequestsSection = "orcamentos" | "pedidos";
type SiteRequestsPageProps = {
  section: string | null;
  quoteId: string | null;
  onSelectSection: (section: RequestsSection) => void;
  onQuoteRouteChange: (id: string | null) => void;
  onNavigate: (tab: AdminTab) => void;
};

export function SiteRequestsPage({
  section, quoteId, onSelectSection, onQuoteRouteChange, onNavigate,
}: SiteRequestsPageProps) {
  const { hasPermission, hasModule, activeOrganization } = useAuth();
  const canQuotes = hasPermission("quotes.view") && isAdminModuleEnabled("quotes", hasModule);
  const canOrders = activeOrganization?.is_artvideo_tenant === true
    && hasPermission("site.view")
    && hasPermission("site_settings.view")
    && isAdminModuleEnabled("siteStoreOrders", hasModule);
  if (!canQuotes && !canOrders) return null;

  const activeSection: RequestsSection =
    section === "orcamentos" && canQuotes ? "orcamentos"
    : section === "pedidos" && canOrders ? "pedidos"
    : canQuotes ? "orcamentos" : "pedidos";

  const sections = [
    ...(canQuotes ? [{ id: "orcamentos" as const, label: "Orçamentos", Icon: FileText }] : []),
    ...(canOrders ? [{ id: "pedidos" as const, label: "Pedidos", Icon: ClipboardList }] : []),
  ];

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Solicitações"
      subtitle="Acompanhe os orçamentos solicitados e os pedidos realizados pelo site da Artvideo." />
    <nav aria-label="Subseções de solicitações" className="flex min-w-0 flex-wrap items-center gap-5 border-b border-border">
      {sections.map(({ id, label, Icon }) => (
        <button type="button" key={id}
          aria-current={activeSection === id ? "page" : undefined}
          onClick={() => onSelectSection(id)}
          className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-1 text-sm font-semibold transition-colors ${activeSection === id
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Icon size={17} className="shrink-0" />{label}
        </button>
      ))}
    </nav>
    {activeSection === "orcamentos"
      ? <TabQuotes embedded routeResourceId={section === "orcamentos" ? quoteId : null}
          onRouteChange={onQuoteRouteChange} onNavigate={onNavigate} />
      : <SiteStoreOrdersPage embedded onBack={() => onSelectSection("orcamentos")} />}
  </div>;
}
