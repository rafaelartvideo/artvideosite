import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { getSiteSettings } from "@/infrastructure/supabase/site-settings.repository";

function queryError(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error.message : "Erro ao buscar configurações do site";
}

export function useSiteSettings() {
  const query = useQuery({
    queryKey: queryKeys.publicSite.settings(),
    queryFn: getSiteSettings,
  });
  return {
    settings: query.data ?? {},
    loading: query.isPending,
    error: queryError(query.error),
  };
}
