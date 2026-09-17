import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import type { FinancialApprovalAction, FinancialEntryDraft, FinancialEntryType } from "../domain/finance.types";
import {
  decideFinancialEntry,
  getFinancialEntryDetail,
  listFinancialCounterparties,
  listFinancialEntries,
  listPendingFinancialApprovals,
  saveFinancialEntry,
} from "../infrastructure/finance-entries.repository";

export function useFinanceEntries(entryType: FinancialEntryType, selectedEntryId?: string | null) {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";

  const entriesQuery = useQuery({
    queryKey: queryKeys.finance.entries(organizationKey, entryType),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listFinancialEntries(organizationId, entryType),
  });

  const counterpartiesQuery = useQuery({
    queryKey: queryKeys.finance.counterparties(organizationKey, entryType),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listFinancialCounterparties(organizationId, entryType),
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.finance.entry(organizationKey, selectedEntryId || "none"),
    enabled: Boolean(activeOrganizationId && selectedEntryId),
    queryFn: () => getFinancialEntryDetail(organizationId, String(selectedEntryId)),
  });

  const invalidateDecision = async (entryId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.entries(organizationKey, entryType) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.entry(organizationKey, entryId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.approvals(organizationKey, entryId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.pendingApprovals(organizationKey) }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (draft: FinancialEntryDraft) => saveFinancialEntry(organizationId, draft),
    onSuccess: async id => {
      await invalidateDecision(id);
    },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: FinancialApprovalAction; note?: string | null }) =>
      decideFinancialEntry(organizationId, id, action, note),
    onSuccess: async (_result, variables) => {
      await invalidateDecision(variables.id);
    },
  });

  return {
    organizationId,
    entriesQuery,
    counterpartiesQuery,
    detailQuery,
    saveMutation,
    decisionMutation,
  };
}

export function useFinancePendingApprovals() {
  const { activeOrganizationId } = useAuth();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  return useQuery({
    queryKey: queryKeys.finance.pendingApprovals(organizationKey),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listPendingFinancialApprovals(organizationId),
  });
}

export type FinanceEntriesController = ReturnType<typeof useFinanceEntries>;
