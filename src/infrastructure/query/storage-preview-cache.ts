import type { QueryClient } from '@tanstack/react-query';

export type StoragePreviewUrl = { url: string; expiresAt: number };

export function getStoragePreviewUrl(
  client: QueryClient,
  bucket: string,
  path: string,
  sign: () => Promise<string>,
  expiresIn = 600,
): Promise<StoragePreviewUrl> {
  // AppQueryProvider isolates clients by organization and clears them on logout.
  // Never use a process-global cache for private signed URLs. Preserve each
  // flow's server lifetime and refresh two minutes before expiration.
  // Different lifetimes must not reuse a URL with an earlier deadline.
  const queryKey = expiresIn === 600
    ? ['storage-preview-url', bucket, path] as const
    : ['storage-preview-url', bucket, path, expiresIn] as const;
  const freshFor = Math.max(1_000, expiresIn * 1_000 - 120_000);
  const previous = client.getQueryState<StoragePreviewUrl>(queryKey);
  if (previous?.status === 'error' && Date.now() - previous.errorUpdatedAt < 120_000) {
    return Promise.reject(previous.error);
  }
  return client.fetchQuery({
    queryKey,
    queryFn: async () => ({ url: await sign(), expiresAt: Date.now() + freshFor }),
    staleTime: freshFor,
    gcTime: Math.max(600_000, expiresIn * 1_000),
    retry: false,
  });
}
