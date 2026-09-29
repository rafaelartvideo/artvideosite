import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import type { FinancialTransferDraft } from "../domain/finance.types";
import {
  configureFinancialOpeningBalance,
  confirmFinancialSettlement,
  getFinancialAccountBalances,
  listFinancialMovementsPage,
  listScheduledFinancialSettlementsPage,
  listFinancialTransfers,
  reverseFinancialTransfer,
  transferFinancialFunds,
} from "../infrastructure/finance-movements.repository";

export type UseFinanceMovementsOptions = {
  loadMovements?: boolean;
  loadScheduledSettlements?: boolean;
  loadTransfers?: boolean;
  movementPage?: number;
  movementPageSize?: number;
  movementSearch?: string;
  movementAccountId?: string;
  settlementPage?: number;
  settlementPageSize?: number;
};

export function useFinanceMovements(options: UseFinanceMovementsOptions = {}) {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  const enabled = Boolean(activeOrganizationId);
  const loadMovements = options.loadMovements !== false;
  const loadScheduledSettlements = options.loadScheduledSettlements !== false;
  const loadTransfers = options.loadTransfers !== false;
  const movementPage = Math.max(1, options.movementPage || 1);
  const movementPageSize = Math.max(1, options.movementPageSize || 20);
  const movementSearch = options.movementSearch || "";
  const movementAccountId = options.movementAccountId || "";
  const settlementPage = Math.max(1, options.settlementPage || 1);
  const settlementPageSize = Math.max(1, options.settlementPageSize || 10);

  const balancesQuery = useQuery({
    queryKey: queryKeys.finance.balances(organizationKey),
    enabled,
    queryFn: () => getFinancialAccountBalances(organizationId),
  });

  const movementsQuery = useQuery({
    queryKey: [
      ...queryKeys.finance.movements(organizationKey),
      {
        page: movementPage,
        pageSize: movementPageSize,
        search: movementSearch,
        accountId: movementAccountId,
      },
    ] as const,
    enabled: enabled && loadMovements,
    queryFn: () => listFinancialMovementsPage(
      organizationId,
      movementPage,
      movementPageSize,
      movementSearch,
      movementAccountId,
    ),
    placeholderData: previous => previous,
  });

  const scheduledSettlementsQuery = useQuery({
    queryKey: [
      ...queryKeys.finance.scheduledSettlements(organizationKey),
      { page: settlementPage, pageSize: settlementPageSize },
    ] as const,
    enabled: enabled && loadScheduledSettlements,
    queryFn: () => listScheduledFinancialSettlementsPage(
      organizationId,
      settlementPage,
      settlementPageSize,
    ),
    placeholderData: previous => previous,
  });

  const transfersQuery = useQuery({
    queryKey: queryKeys.finance.transfers(organizationKey),
    enabled: enabled && loadTransfers,
    queryFn: () => listFinancialTransfers(organizationId),
  });

  const invalidateMoney = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.balances(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.movements(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.transfers(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.scheduledSettlements(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.accounts(organizationKey) }),
    ]);
  };

  const transferMutation = useMutation({
    mutationFn: (draft: FinancialTransferDraft) => transferFinancialFunds(organizationId, draft),
    onSuccess: invalidateMoney,
  });

  const reverseTransferMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reverseFinancialTransfer(organizationId, id, reason),
    onSuccess: invalidateMoney,
  });

  const confirmScheduledSettlementMutation = useMutation({
    mutationFn: ({ settlementId, postedAt }: { settlementId: string; postedAt?: string }) =>
      confirmFinancialSettlement(organizationId, settlementId, postedAt || new Date().toISOString()),
    onSuccess: invalidateMoney,
  });

  const openingBalanceMutation = useMutation({
    mutationFn: ({ accountId, amount, note }: { accountId: string; amount: number; note?: string | null }) =>
      configureFinancialOpeningBalance(organizationId, accountId, amount, note),
    onSuccess: invalidateMoney,
  });

  return {
    organizationId,
    balancesQuery,
    movementsQuery,
    transfersQuery,
    scheduledSettlementsQuery,
    transferMutation,
    confirmScheduledSettlementMutation,
    reverseTransferMutation,
    openingBalanceMutation,
  };
}

export type FinanceMovementsController = ReturnType<typeof useFinanceMovements>;
