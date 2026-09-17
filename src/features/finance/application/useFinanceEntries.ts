import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import type { FinancialEntryDraft, FinancialEntryType } from "../domain/finance.types";
import {
  getFinancialEntryDetail,
  listFinancialCounterparties,
  listFinancialEntries,
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

  const saveMutation = useMutation({
    mutationFn: (draft: FinancialEntryDraft) => saveFinancialEntry(organizationId, draft),
    onSuccess: async id => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.entries(organizationKey, entryType) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.entry(organizationKey, id) }),
      ]);
    },
  });

  return {
    organizationId,
    entriesQuery,
    counterpartiesQuery,
    detailQuery,
    saveMutation,
  };
}

export type FinanceEntriesController = ReturnType<typeof useFinanceEntries>;
