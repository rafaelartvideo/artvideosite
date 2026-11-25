import { QueryClient } from "@tanstack/react-query";

const ONE_MINUTE = 60_000;
const FIVE_MINUTES = 5 * ONE_MINUTE;
const THIRTY_MINUTES = 30 * ONE_MINUTE;

export const REFERENCE_DATA_CACHE_TIME = 24 * 60 * ONE_MINUTE;

function retryTransportFailure(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1 || !error || typeof error !== "object") return false;
  const detail = error as Record<string, unknown>;
  // A completed HTTP error, database cancellation or deadline must surface
  // immediately. Replaying expensive reads worsens an overloaded server.
  if (Number(detail.status) >= 400) return false;
  if (detail.name === "AbortError" || detail.name === "TimeoutError") return false;
  const message = String(detail.message || "");
  if (/timeout|timed\s*out|aborted/i.test(message)) return false;
  const code = String(detail.code || "").toUpperCase();
  if (code) return ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH"].includes(code);
  // Supabase may wrap a fetch TypeError in a plain PostgREST error object.
  // Keep one recovery attempt only for recognizable connectivity failures.
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|connection (?:reset|refused)/i.test(message);
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FIVE_MINUTES,
        gcTime: THIRTY_MINUTES,
        retry: retryTransportFailure,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
