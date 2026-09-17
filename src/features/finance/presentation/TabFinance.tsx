import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { financeRoute } from "../domain/finance-foundation.mjs";
import type { FinanceRegistrySection, FinanceSection } from "../domain/finance.types";
import { FinanceAccountsSection } from "./FinanceAccountsSection";
import { FinanceEntriesSection } from "./FinanceEntriesSection";
import { FinanceMovementsSection } from "./FinanceMovementsSection";
import { FinanceOverviewFoundation } from "./FinanceOverviewFoundation";
import { FinanceRegistriesSection } from "./FinanceRegistriesSection";
import { FinanceSectionTabs } from "./FinanceSectionTabs";

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
  const requested = financeRoute(routeResourceId || null, routeSubpage || null) as { section: FinanceSection; registry: FinanceRegistrySection | null; entryId?: string | null };
  const allowedSections = useMemo<FinanceSection[]>(() => {
    const sections: FinanceSection[] = [];
    const canViewAccounts = hasPermission("finance.accounts.view") || hasPermission("finance.accounts.manage");
    if (hasPermission("finance.dashboard.view")) sections.push("overview");
    if (hasPermission("finance.receivables.view")) sections.push("receivables");
    if (hasPermission("finance.payables.view")) sections.push("payables");
    if (canViewAccounts) sections.push("movements");
    if (canViewAccounts) sections.push("accounts");
    if (hasPermission("finance.view")) sections.push("registries");
    return sections;
  }, [hasPermission]);
  const section = allowedSections.includes(requested.section) ? requested.section : allowedSections[0] || "overview";

  useEffect(() => {
    if (section === requested.section || !onRouteChange) return;
    if (section === "overview") onRouteChange(null, null);
    else if (section === "registries") onRouteChange("registries", "categories");
    else onRouteChange(section, null);
  }, [section, requested.section, onRouteChange]);

  const selectSection = (next: FinanceSection) => {
    if (next === "overview") onRouteChange?.(null, null);
    else if (next === "registries") onRouteChange?.("registries", requested.registry || "categories");
    else onRouteChange?.(next, null);
  };

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Financeiro" subtitle="Contas a pagar e receber, movimentações, caixas, cadastros e gestão financeira em um único módulo." />
    <FinanceSectionTabs section={section} allowedSections={allowedSections} onSelect={selectSection} />

    {section === "overview" && <FinanceOverviewFoundation onSelectEntry={(type, id) => onRouteChange?.(type === "receivable" ? "receivables" : "payables", id)} />}
    {section === "receivables" && <FinanceEntriesSection entryType="receivable" selectedEntryId={requested.entryId || null} onSelectEntry={id => onRouteChange?.("receivables", id)} />}
    {section === "payables" && <FinanceEntriesSection entryType="payable" selectedEntryId={requested.entryId || null} onSelectEntry={id => onRouteChange?.("payables", id)} />}
    {section === "movements" && <FinanceMovementsSection />}
    {section === "accounts" && <FinanceAccountsSection />}
    {section === "registries" && <FinanceRegistriesSection registry={requested.registry} onSelect={registry => onRouteChange?.("registries", registry)} />}
  </div>;
}
