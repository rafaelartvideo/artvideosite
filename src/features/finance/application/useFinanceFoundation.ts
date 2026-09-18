import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import {
  getFinancialSettings,
  listFinancialAccounts,
  listFinancialCategories,
  listFinancialCostCenters,
  listFinancialPaymentMethods,
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
  const canReadAccounts = hasPermission("finance.accounts.view") || hasPermission("finance.accounts.manage") || hasPermission("finance.reports.cash_flow");

  const invalidate = async (queryKey: readonly unknown[]) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.foundation(organizationKey) }),
    ]);
  };

  const accountsQuery = useQuery({
    queryKey: queryKeys.finance.accounts(organizationKey),
    enabled: Boolean(activeOrganizationId) && canReadAccounts,
    queryFn: () => listFinancialAccounts(organizationId),
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.finance.categories(organizationKey),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listFinancialCategories(organizationId),
  });

  const costCentersQuery = useQuery({
    queryKey: queryKeys.finance.costCenters(organizationKey),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listFinancialCostCenters(organizationId),
  });

  const paymentMethodsQuery = useQuery({
    queryKey: queryKeys.finance.paymentMethods(organizationKey),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listFinancialPaymentMethods(organizationId),
  });

  const settingsQuery = useQuery({
    queryKey: queryKeys.finance.settings(organizationKey),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => getFinancialSettings(organizationId),
  });

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
