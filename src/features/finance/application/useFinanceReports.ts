import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import type { FinancialReportFilters } from "../domain/finance.types";
import {
  getFinancialCashFlow,
  getFinancialDashboard,
  getFinancialDre,
} from "../infrastructure/finance-reports.repository";

export function useFinanceReports(filters: FinancialReportFilters) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  const hasPeriod = Boolean(filters.from && filters.to);
  const canDashboard = hasPermission("finance.dashboard.view");
  const canReports = hasPermission("finance.reports.view");
  const canDre = canReports && hasPermission("finance.reports.dre");
  const canCashFlow = canReports && hasPermission("finance.reports.cash_flow");

  const categoryId = filters.category_id || "all";
  const costCenterId = filters.cost_center_id || "all";
  const originType = filters.origin_type || "all";
  const accountId = filters.account_id || "all";
  const paymentMethodId = filters.payment_method_id || "all";

  const dashboardQuery = useQuery({
    queryKey: queryKeys.finance.dashboard(organizationKey, filters.from, filters.to),
    enabled: Boolean(activeOrganizationId) && canDashboard && hasPeriod,
    queryFn: () => getFinancialDashboard(organizationId, filters.from, filters.to),
  });

  const dreQuery = useQuery({
    queryKey: queryKeys.finance.dre(
      organizationKey,
      filters.from,
      filters.to,
      categoryId,
      costCenterId,
      originType,
    ),
    enabled: Boolean(activeOrganizationId) && canDre && hasPeriod,
    queryFn: () => getFinancialDre(organizationId, filters),
  });

  const cashFlowQuery = useQuery({
    queryKey: queryKeys.finance.cashFlow(
      organizationKey,
      filters.from,
      filters.to,
      accountId,
      categoryId,
      costCenterId,
      originType,
      paymentMethodId,
    ),
    enabled: Boolean(activeOrganizationId) && canCashFlow && hasPeriod,
    queryFn: () => getFinancialCashFlow(organizationId, filters),
  });

  return {
    organizationId,
    canDashboard,
    canDre,
    canCashFlow,
    dashboardQuery,
    dreQuery,
    cashFlowQuery,
  };
}

export type FinanceReportsController = ReturnType<typeof useFinanceReports>;
