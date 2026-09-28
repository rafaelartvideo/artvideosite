import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@/infrastructure/query/query-client";
import { QueryRealtimeSync } from "@/infrastructure/query/QueryRealtimeSync";
import {
  ORGANIZATION_CHANGED_EVENT,
  LEGACY_ORGANIZATION_CHANGED_EVENT,
  addCompatibleEventListener,
} from "@/lib/platform-identifiers";

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);

  useEffect(() => {
    const clearOrganizationCache = () => queryClient.clear();
    return addCompatibleEventListener(
      ORGANIZATION_CHANGED_EVENT,
      LEGACY_ORGANIZATION_CHANGED_EVENT,
      clearOrganizationCache,
    );
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <QueryRealtimeSync />
      {children}
    </QueryClientProvider>
  );
}
