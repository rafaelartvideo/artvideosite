import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import {
  defaultQueueIntegrationSettings,
  getQueueIntegrationSettings,
} from "../infrastructure/queue-integration.repository";

export function useQueueIntegrationSettings(organizationId?: string | null) {
  const normalizedOrganizationId = organizationId || "";

  return useQuery({
    queryKey: queryKeys.queueIntegration.settings(normalizedOrganizationId || "none"),
    enabled: Boolean(normalizedOrganizationId),
    queryFn: () => getQueueIntegrationSettings(normalizedOrganizationId),
    staleTime: REFERENCE_DATA_CACHE_TIME,
    gcTime: REFERENCE_DATA_CACHE_TIME,
    placeholderData: normalizedOrganizationId
      ? defaultQueueIntegrationSettings(normalizedOrganizationId)
      : undefined,
  });
}
