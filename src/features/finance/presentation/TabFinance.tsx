import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { History, Plus, ReceiptText } from "lucide-react";
import { financeRoute } from "../domain/finance-foundation.mjs";
import type { FinanceRegistrySection, FinanceSection } from "../domain/finance.types";
import { FinanceAccountsSection } from "./FinanceAccountsSection";
import { FinanceEntriesSection } from "./FinanceEntriesSection";
import { FinanceMovementsSection } from "./FinanceMovementsSection";
import { FinanceOverviewFoundation } from "./FinanceOverviewFoundation";
import { FinanceRegistriesSection } from "./FinanceRegistriesSection";
import { FinanceReportsSection } from "./FinanceReportsSection";
import { FinanceReceiptDialog } from "./FinanceReceiptDialog";
import { FinanceReceiptHistoryDialog } from "./FinanceReceiptHistoryDialog";
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
  const { hasPermission, activeOrganizationId } = useAuth();
  // Contagens leves (HEAD/COUNT), por empresa e permissão: não carrega lançamentos inteiros.
  const organizationId = activeOrganizationId || "";
  const receivableCount = useQuery({
    queryKey: [...queryKeys.finance.entries(organizationId || "none", "receivable"), "tab-count"],
    enabled: Boolean(activeOrganizationId && hasPermission("finance.receivables.view")),
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase.from("financial_entries").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("entry_type", "receivable");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const payableCount = useQuery({
    queryKey: [...queryKeys.finance.entries(organizationId || "none", "payable"), "tab-count"],
    enabled: Boolean(activeOrganizationId && hasPermission("finance.payables.view")),
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase.from("financial_entries").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("entry_type", "payable");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const accountsCount = useQuery({
    queryKey: [...queryKeys.finance.accounts(organizationId || "none"), "tab-count"],
    enabled: Boolean(activeOrganizationId && hasPermission("finance.accounts.view")),
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase.from("financial_accounts").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const tabCounts: Partial<Record<FinanceSection, number>> = {
    ...(receivableCount.data !== undefined ? { receivables: receivableCount.data } : {}),
    ...(payableCount.data !== undefined ? { payables: payableCount.data } : {}),
    ...(accountsCount.data !== undefined ? { accounts: accountsCount.data } : {}),
  };
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptHistoryOpen, setReceiptHistoryOpen] = useState(false);
  const [newEntrySignal, setNewEntrySignal] = useState(0);
  const canIssueReceipt = hasPermission("finance.receivables.create") || hasPermission("finance.payables.create");
  const canViewReceiptHistory = hasPermission("finance.receivables.view") || hasPermission("finance.payables.view");
  const requested = financeRoute(routeResourceId || null, routeSubpage || null) as { section: FinanceSection; registry: FinanceRegistrySection | null; entryId?: string | null };
  const allowedSections = useMemo<FinanceSection[]>(() => {
    const sections: FinanceSection[] = [];
    const canViewAccounts = hasPermission("finance.accounts.view");
    if (hasPermission("finance.dashboard.view")) sections.push("overview");
    if (hasPermission("finance.receivables.view")) sections.push("receivables");
    if (hasPermission("finance.payables.view")) sections.push("payables");
    if (canViewAccounts) sections.push("movements");
    if (canViewAccounts) sections.push("accounts");
    if (hasPermission("finance.reports.view") && (hasPermission("finance.reports.dre") || hasPermission("finance.reports.cash_flow"))) sections.push("reports");
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
    setNewEntrySignal(0);
    if (next === "overview") onRouteChange?.(null, null);
    else if (next === "registries") onRouteChange?.("registries", requested.registry || "categories");
    else onRouteChange?.(next, null);
  };

  const canCreateInSection = section === "receivables" ? hasPermission("finance.receivables.create")
    : section === "payables" ? hasPermission("finance.payables.create")
    : section === "accounts" ? hasPermission("finance.accounts.manage")
    : section === "movements" ? hasPermission("finance.transfers.create")
    : section === "registries" ? (requested.registry === "payment-methods" ? hasPermission("finance.payment_methods.manage") : requested.registry === "settings" ? false : hasPermission("finance.categories.manage"))
    : false;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Financeiro" subtitle="Controle simples das entradas, saídas e contas da empresa."
      actions={canIssueReceipt || canViewReceiptHistory || canCreateInSection ? <div className="flex flex-wrap items-center justify-end gap-2">
        {(canIssueReceipt || canViewReceiptHistory) && <div className="inline-flex max-w-full items-center overflow-hidden rounded-lg border admin-action-blue-outline">
          {canIssueReceipt && <button type="button" onClick={() => setReceiptOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Gerar recibo"><ReceiptText size={16} /> Gerar recibo</button>}
          {canIssueReceipt && canViewReceiptHistory && <span className="h-6 w-px shrink-0 bg-primary/25" aria-hidden="true" />}
          {canViewReceiptHistory && <button type="button" onClick={() => setReceiptHistoryOpen(true)}
            title="Histórico de recibos" aria-label="Histórico de recibos"
            className="inline-flex min-h-10 items-center justify-center gap-2 px-3 py-2.5 text-sm font-bold transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <History size={17} /><span className={canIssueReceipt ? "sr-only" : ""}>Histórico de recibos</span>
          </button>}
        </div>}
        {canCreateInSection && <button type="button" onClick={() => setNewEntrySignal(current => current + 1)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg admin-primary-gradient px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={section === "payables" ? "Nova conta a pagar" : section === "receivables" ? "Nova conta a receber" : section === "movements" ? "Nova transferência" : section === "accounts" ? "Nova conta financeira" : "Novo cadastro financeiro"}>
          <Plus size={17} /> Novo
        </button>}
      </div> : undefined} />
    <FinanceSectionTabs section={section} allowedSections={allowedSections} onSelect={selectSection} counts={tabCounts} />
    {canIssueReceipt && <FinanceReceiptDialog open={receiptOpen} onClose={() => setReceiptOpen(false)} />}
    {canViewReceiptHistory && <FinanceReceiptHistoryDialog open={receiptHistoryOpen} onClose={() => setReceiptHistoryOpen(false)} />}

    {section === "overview" && <FinanceOverviewFoundation onSelectEntry={(type, id) => onRouteChange?.(type === "receivable" ? "receivables" : "payables", id)} />}
    {section === "receivables" && <FinanceEntriesSection newEntrySignal={newEntrySignal} entryType="receivable" selectedEntryId={requested.entryId || null} onSelectEntry={id => onRouteChange?.("receivables", id)} />}
    {section === "payables" && <FinanceEntriesSection newEntrySignal={newEntrySignal} entryType="payable" selectedEntryId={requested.entryId || null} onSelectEntry={id => onRouteChange?.("payables", id)} />}
    {section === "movements" && <FinanceMovementsSection createSignal={newEntrySignal} />}
    {section === "accounts" && <FinanceAccountsSection createSignal={newEntrySignal} />}
    {section === "reports" && <FinanceReportsSection />}
    {section === "registries" && <FinanceRegistriesSection createSignal={newEntrySignal} registry={requested.registry} onSelect={registry => { setNewEntrySignal(0); onRouteChange?.("registries", registry); }} />}
  </div>;
}
