import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { AdminCard, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { financeRoute } from "../domain/finance-foundation.mjs";
import type { FinanceSection } from "../domain/finance.types";
import { FinanceOverviewFoundation } from "./FinanceOverviewFoundation";
import { FinanceSectionTabs } from "./FinanceSectionTabs";

function placeholder(title: string, description: string) {
  return <AdminCard className="p-6">
    <h2 className="text-lg font-black text-[#0d1b2e]">{title}</h2>
    <p className="mt-2 text-sm leading-relaxed text-[#5a6a82]">{description}</p>
  </AdminCard>;
}

export function TabFinance({
  routeResourceId,
  routeSubpage,
  onRouteChange,
}: {
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
}) {
  const { hasPermission } = useAuth();
  const requested = financeRoute(routeResourceId || null, routeSubpage || null) as { section: FinanceSection; registry: string | null };
  const allowedSections = useMemo<FinanceSection[]>(() => {
    const sections: FinanceSection[] = [];
    if (hasPermission("finance.dashboard.view")) sections.push("overview");
    if (hasPermission("finance.accounts.view") || hasPermission("finance.accounts.manage")) sections.push("accounts");
    if (hasPermission("finance.view")) sections.push("registries");
    return sections;
  }, [hasPermission]);
  const section = allowedSections.includes(requested.section) ? requested.section : allowedSections[0] || "overview";

  useEffect(() => {
    if (section === requested.section || !onRouteChange) return;
    if (section === "overview") onRouteChange(null, null);
    else if (section === "accounts") onRouteChange("accounts", null);
    else onRouteChange("registries", "categories");
  }, [section, requested.section, onRouteChange]);

  const selectSection = (next: FinanceSection) => {
    if (next === "overview") onRouteChange?.(null, null);
    else if (next === "accounts") onRouteChange?.("accounts", null);
    else onRouteChange?.("registries", requested.registry || "categories");
  };

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Financeiro" subtitle="Gerencie a estrutura financeira da empresa em um único módulo." />
    <FinanceSectionTabs section={section} allowedSections={allowedSections} onSelect={selectSection} />

    {section === "overview" && <FinanceOverviewFoundation />}
    {section === "accounts" && placeholder("Caixas e contas", "Cadastre as contas financeiras e caixas utilizados pela empresa.")}
    {section === "registries" && placeholder("Cadastros financeiros", "Configure categorias, centros de custo, formas de pagamento e regras financeiras.")}
  </div>;
}
