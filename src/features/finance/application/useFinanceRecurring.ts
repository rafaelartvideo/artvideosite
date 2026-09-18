import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import {
  generateFinancialRecurringOccurrences,
  listFinancialRecurringRules,
  saveFinancialRecurringRule,
  setFinancialRecurringRuleActive,
} from "../infrastructure/finance-recurring.repository";

export function useFinanceRecurring() {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  const enabled = Boolean(activeOrganizationId);

  const rulesQuery = useQuery({
    queryKey: queryKeys.finance.recurring(organizationKey),
    enabled,
    queryFn: () => listFinancialRecurringRules(organizationId),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.recurring(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.pendingApprovals(organizationKey) }),
      queryClient.invalidateQueries({ queryKey: ["finance", organizationKey, "entries"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: ({ payload, id }: { payload: Record<string, unknown>; id?: string | null }) =>
      saveFinancialRecurringRule(organizationId, payload, id),
    onSuccess: invalidate,
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setFinancialRecurringRuleActive(organizationId, id, active),
    onSuccess: invalidate,
  });

  const generateMutation = useMutation({
    mutationFn: ({ id, untilDate }: { id: string; untilDate?: string | null }) =>
      generateFinancialRecurringOccurrences(organizationId, id, untilDate),
    onSuccess: invalidate,
  });

  return { rulesQuery, saveMutation, activeMutation, generateMutation };
}
