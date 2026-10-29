import type { QueryClient } from '@tanstack/react-query';

export type StoragePreviewUrl = { url: string; expiresAt: number };

export function getStoragePreviewUrl(
  client: QueryClient,
  bucket: string,
  path: string,
  sign: () => Promise<string>,
): Promise<StoragePreviewUrl> {
  // AppQueryProvider isolates clients by organization and clears them on logout.
  // Never use a process-global cache for private signed URLs. All callers sign
  // for 600 seconds; refresh at eight minutes to leave a safety margin.
  const queryKey = ['storage-preview-url', bucket, path] as const;
  const previous = client.getQueryState<StoragePreviewUrl>(queryKey);
  if (previous?.status === 'error' && Date.now() - previous.errorUpdatedAt < 120_000) {
    return Promise.reject(previous.error);
  }
  return client.fetchQuery({
    queryKey,
    queryFn: async () => ({ url: await sign(), expiresAt: Date.now() + 480_000 }),
    staleTime: 480_000,
    gcTime: 600_000,
    retry: false,
  });
}
