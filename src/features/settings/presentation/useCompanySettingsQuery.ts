import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import {
  getCompanySettings,
  saveCompanySettings,
  type CompanySettings,
  type SaveCompanySettingsScope,
} from "../infrastructure/company-settings.repository";

export function useCompanySettingsQuery(organizationId?: string | null) {
  return useQuery({
    queryKey: ["company-settings", organizationId || "none"],
    enabled: Boolean(organizationId),
    queryFn: () => getCompanySettings(organizationId),
    staleTime: REFERENCE_DATA_CACHE_TIME,
    gcTime: REFERENCE_DATA_CACHE_TIME,
  });
}

export function useSaveCompanySettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      settings,
      updatedBy,
      scope,
    }: {
      organizationId: string;
      settings: CompanySettings;
      updatedBy: string | null;
      scope?: SaveCompanySettingsScope;
    }) => saveCompanySettings(settings, updatedBy, organizationId, scope),
    onSuccess: (saved, variables) => {
      queryClient.setQueryData(["company-settings", variables.organizationId], saved);
    },
  });
}
