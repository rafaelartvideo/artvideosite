import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@/infrastructure/query/query-client";
import { QueryRealtimeSync } from "@/infrastructure/query/QueryRealtimeSync";

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);

  useEffect(() => {
    const clearOrganizationCache = () => queryClient.clear();
    window.addEventListener("artvideo:organization-changed", clearOrganizationCache);
    return () => window.removeEventListener("artvideo:organization-changed", clearOrganizationCache);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <QueryRealtimeSync />
      {children}
    </QueryClientProvider>
  );
}
