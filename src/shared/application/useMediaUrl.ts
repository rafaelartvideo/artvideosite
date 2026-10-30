import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { getMediaPreview, type MediaPreviewSource } from "@/shared/infrastructure/media.repository";

export function useMediaUrl(mediaId: string | null | undefined, knownMedia?: MediaPreviewSource | null) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.publicSite.media(mediaId ?? ""),
    queryFn: () => getMediaPreview(client, mediaId!, knownMedia),
    enabled: Boolean(mediaId),
    // A second observer can reuse a URL close to its deadline. Never mark it
    // fresh for another full interval measured from that observer's mount.
    staleTime: query => query.state.data?.expiresAt
      ? Math.max(0, query.state.data.expiresAt - query.state.dataUpdatedAt)
      : 30 * 60_000,
    refetchInterval: query => query.state.data?.expiresAt && !query.state.error
      ? Math.max(1_000, query.state.data.expiresAt - Date.now())
      : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return {
    url: query.data?.url ?? null,
    loading: Boolean(mediaId) && query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? "Erro ao buscar imagem" : null,
  };
}
