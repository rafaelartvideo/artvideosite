import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { getMediaById, resolveMediaStorageUrl } from "@/shared/infrastructure/media.repository";

export function useMediaUrl(mediaId: string | null | undefined) {
  const query = useQuery({
    queryKey: queryKeys.publicSite.media(mediaId ?? ""),
    queryFn: async () => {
      const media = await getMediaById(mediaId!);
      if (!media) throw new Error("Imagem não encontrada");
      const bucketName = media.bucket_id ?? media.bucket_name ?? null;
      const storagePath = media.storage_path ?? null;
      if (!bucketName || !storagePath) throw new Error("Imagem indisponível");
      const url = await resolveMediaStorageUrl(bucketName, storagePath);
      if (!url) throw new Error("Imagem indisponível");
      return url;
    },
    enabled: Boolean(mediaId),
    staleTime: 30 * 60_000,
  });
  return {
    url: query.data ?? null,
    loading: Boolean(mediaId) && query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? "Erro ao buscar imagem" : null,
  };
}
