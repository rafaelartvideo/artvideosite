import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@/infrastructure/query/query-client";

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
