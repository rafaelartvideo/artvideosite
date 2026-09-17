import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import type { FinancialTransferDraft } from "../domain/finance.types";
import {
  configureFinancialOpeningBalance,
  getFinancialAccountBalances,
  listFinancialMovements,
  listFinancialTransfers,
  reverseFinancialTransfer,
  transferFinancialFunds,
} from "../infrastructure/finance-movements.repository";

export function useFinanceMovements() {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  const enabled = Boolean(activeOrganizationId);

  const balancesQuery = useQuery({
    queryKey: queryKeys.finance.balances(organizationKey),
    enabled,
    queryFn: () => getFinancialAccountBalances(organizationId),
  });

  const movementsQuery = useQuery({
    queryKey: queryKeys.finance.movements(organizationKey),
    enabled,
    queryFn: () => listFinancialMovements(organizationId),
  });

  const transfersQuery = useQuery({
    queryKey: queryKeys.finance.transfers(organizationKey),
    enabled,
    queryFn: () => listFinancialTransfers(organizationId),
  });

  const invalidateMoney = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.balances(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.movements(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.transfers(organizationKey) }),
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
    transferMutation,
    reverseTransferMutation,
    openingBalanceMutation,
  };
}

export type FinanceMovementsController = ReturnType<typeof useFinanceMovements>;
