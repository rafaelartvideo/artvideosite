import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import {
  closeFinancialCashSession,
  listFinancialCashSessions,
  openFinancialCashSession,
  recordFinancialCashAdjustment,
} from "../infrastructure/finance-cash.repository";

export function useFinanceCash() {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  const enabled = Boolean(activeOrganizationId);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.finance.cashSessions(organizationKey),
    enabled,
    queryFn: () => listFinancialCashSessions(organizationId),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.cashSessions(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.balances(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.movements(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.accounts(organizationKey) }),
    ]);
  };

  const openMutation = useMutation({
    mutationFn: ({ accountId, countedAmount, note }: { accountId: string; countedAmount: number; note?: string | null }) =>
      openFinancialCashSession(organizationId, accountId, countedAmount, note),
    onSuccess: invalidate,
  });

  const adjustmentMutation = useMutation({
    mutationFn: ({ sessionId, action, amount, note }: { sessionId: string; action: "supply" | "withdraw"; amount: number; note: string }) =>
      recordFinancialCashAdjustment(organizationId, sessionId, action, amount, note),
    onSuccess: invalidate,
  });

  const closeMutation = useMutation({
    mutationFn: ({ sessionId, countedAmount, reason }: { sessionId: string; countedAmount: number; reason?: string | null }) =>
      closeFinancialCashSession(organizationId, sessionId, countedAmount, reason),
    onSuccess: invalidate,
  });

  return { sessionsQuery, openMutation, adjustmentMutation, closeMutation };
}
