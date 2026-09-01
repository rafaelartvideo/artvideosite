import { QueryClient } from "@tanstack/react-query";

const ONE_MINUTE = 60_000;
const FIFTEEN_MINUTES = 15 * ONE_MINUTE;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: ONE_MINUTE,
        gcTime: FIFTEEN_MINUTES,
        retry: 1,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
