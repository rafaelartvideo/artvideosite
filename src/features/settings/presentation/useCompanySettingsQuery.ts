import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCompanySettings,
  saveCompanySettings,
  type CompanySettings,
} from "../infrastructure/company-settings.repository";

export function useCompanySettingsQuery(organizationId?: string | null) {
  return useQuery({
    queryKey: ["company-settings", organizationId || "none"],
    enabled: Boolean(organizationId),
    queryFn: () => getCompanySettings(organizationId),
  });
}

export function useSaveCompanySettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      settings,
      updatedBy,
    }: {
      organizationId: string;
      settings: CompanySettings;
      updatedBy: string | null;
    }) => saveCompanySettings(settings, updatedBy, organizationId),
    onSuccess: (saved, variables) => {
      queryClient.setQueryData(["company-settings", variables.organizationId], saved);
    },
  });
}
