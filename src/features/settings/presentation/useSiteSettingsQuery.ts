import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  getSiteSettings,
  saveSiteSettings,
  type SiteSettings,
} from "@/infrastructure/supabase/site-settings.repository";

export function useSiteSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.publicSite.settings(),
    queryFn: getSiteSettings,
  });
}

export function useSaveSiteSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      settings,
      updatedBy,
    }: {
      settings: SiteSettings;
      updatedBy: string | null;
    }) => {
      await saveSiteSettings(settings, updatedBy);
      return settings;
    },
    onSuccess: (savedSettings) => {
      queryClient.setQueryData<SiteSettings>(
        queryKeys.publicSite.settings(),
        (current) => ({ ...current, ...savedSettings }),
      );
    },
  });
}
