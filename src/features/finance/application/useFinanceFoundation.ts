import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import { useAuth } from "@/lib/auth";
import {
  loadFinanceFoundation,
  saveFinancialAccount,
  saveFinancialCategory,
  saveFinancialCostCenter,
  saveFinancialPaymentMethod,
  saveFinancialSettings,
  setFinancialAccountActive,
  setFinancialCategoryActive,
  setFinancialCostCenterActive,
  setFinancialPaymentMethodActive,
  type FinancialAccountInput,
  type FinancialCategoryInput,
  type FinancialCostCenterInput,
  type FinancialPaymentMethodInput,
  type FinancialSettingsInput,
} from "../infrastructure/finance-foundation.repository";

export function useFinanceFoundation() {
  const { activeOrganizationId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  const canReadAccounts = hasPermission("finance.accounts.view")
    || hasPermission("finance.accounts.manage")
    || hasPermission("finance.reports.cash_flow");

  const invalidate = async (queryKey: readonly unknown[]) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.foundation(organizationKey) }),
    ]);
  };

  const foundationQuery = useQuery({
    queryKey: queryKeys.finance.foundation(organizationKey),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => loadFinanceFoundation(organizationId),
    staleTime: REFERENCE_DATA_CACHE_TIME,
    gcTime: REFERENCE_DATA_CACHE_TIME,
  });

  const derivedQuery = <T,>(data: T) => ({
    data,
    error: foundationQuery.error,
    isLoading: foundationQuery.isLoading,
    isPending: foundationQuery.isPending,
    refetch: foundationQuery.refetch,
  });

  const accountsQuery = derivedQuery(
    canReadAccounts ? (foundationQuery.data?.accounts || []) : [],
  );
  const categoriesQuery = derivedQuery(foundationQuery.data?.categories || []);
  const costCentersQuery = derivedQuery(foundationQuery.data?.costCenters || []);
  const paymentMethodsQuery = derivedQuery(foundationQuery.data?.paymentMethods || []);
  const settingsQuery = derivedQuery(foundationQuery.data?.settings);

  const saveAccount = useMutation({
    mutationFn: (input: FinancialAccountInput) => saveFinancialAccount(organizationId, input),
    onSuccess: () => invalidate(queryKeys.finance.accounts(organizationKey)),
  });

  const toggleAccount = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setFinancialAccountActive(organizationId, id, isActive),
    onSuccess: () => invalidate(queryKeys.finance.accounts(organizationKey)),
  });

  const saveCategory = useMutation({
    mutationFn: (input: FinancialCategoryInput) => saveFinancialCategory(organizationId, input),
    onSuccess: () => invalidate(queryKeys.finance.categories(organizationKey)),
  });

  const toggleCategory = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setFinancialCategoryActive(organizationId, id, isActive),
    onSuccess: () => invalidate(queryKeys.finance.categories(organizationKey)),
  });

  const saveCostCenter = useMutation({
    mutationFn: (input: FinancialCostCenterInput) => saveFinancialCostCenter(organizationId, input),
    onSuccess: () => invalidate(queryKeys.finance.costCenters(organizationKey)),
  });

  const toggleCostCenter = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setFinancialCostCenterActive(organizationId, id, isActive),
    onSuccess: () => invalidate(queryKeys.finance.costCenters(organizationKey)),
  });

  const savePaymentMethod = useMutation({
    mutationFn: (input: FinancialPaymentMethodInput) => saveFinancialPaymentMethod(organizationId, input),
    onSuccess: () => invalidate(queryKeys.finance.paymentMethods(organizationKey)),
  });

  const togglePaymentMethod = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setFinancialPaymentMethodActive(organizationId, id, isActive),
    onSuccess: () => invalidate(queryKeys.finance.paymentMethods(organizationKey)),
  });

  const saveSettings = useMutation({
    mutationFn: (input: FinancialSettingsInput) => saveFinancialSettings(organizationId, input),
    onSuccess: () => invalidate(queryKeys.finance.settings(organizationKey)),
  });

  return {
    organizationId,
    accountsQuery,
    categoriesQuery,
    costCentersQuery,
    paymentMethodsQuery,
    settingsQuery,
    saveAccount,
    toggleAccount,
    saveCategory,
    toggleCategory,
    saveCostCenter,
    toggleCostCenter,
    savePaymentMethod,
    togglePaymentMethod,
    saveSettings,
  };
}

export type FinanceFoundationController = ReturnType<typeof useFinanceFoundation>;
