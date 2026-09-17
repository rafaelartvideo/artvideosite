import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { FinancialEntryDraft, FinancialEntryType } from "../domain/finance.types";
import {
  getFinancialEntryDetail,
  listFinancialCounterparties,
  listFinancialEntries,
  saveFinancialEntry,
} from "../infrastructure/finance-entries.repository";

export function financeEntriesKey(organizationId: string, entryType: FinancialEntryType) {
  return ["finance", organizationId, "entries", entryType] as const;
}

export function financeEntryKey(organizationId: string, id: string) {
  return ["finance", organizationId, "entry", id] as const;
}

export function useFinanceEntries(entryType: FinancialEntryType, selectedEntryId?: string | null) {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";

  const entriesQuery = useQuery({
    queryKey: financeEntriesKey(organizationKey, entryType),
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listFinancialEntries(organizationId, entryType),
  });

  const counterpartiesQuery = useQuery({
    queryKey: ["finance", organizationKey, "counterparties", entryType] as const,
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listFinancialCounterparties(organizationId, entryType),
  });

  const detailQuery = useQuery({
    queryKey: financeEntryKey(organizationKey, selectedEntryId || "none"),
    enabled: Boolean(activeOrganizationId && selectedEntryId),
    queryFn: () => getFinancialEntryDetail(organizationId, String(selectedEntryId)),
  });

  const saveMutation = useMutation({
    mutationFn: (draft: FinancialEntryDraft) => saveFinancialEntry(organizationId, draft),
    onSuccess: async id => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeEntriesKey(organizationKey, entryType) }),
        queryClient.invalidateQueries({ queryKey: financeEntryKey(organizationKey, id) }),
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
