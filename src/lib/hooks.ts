import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { getSiteSettings } from "@/infrastructure/supabase/site-settings.repository";
import * as queries from "./queries";
import type { Service, ServiceCategory, Product, Brand } from "./database.types";

async function unwrapQuery<T>(
  request: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

function queryError(error: unknown, fallback: string) {
  if (!error) return null;
  return error instanceof Error ? error.message : fallback;
}

export function useServices() {
  const query = useQuery({
    queryKey: queryKeys.publicSite.services(),
    queryFn: () => unwrapQuery<Service[]>(queries.getServices()).then((data) => data ?? []),
  });
  return {
    services: query.data ?? [],
    loading: query.isPending,
    error: queryError(query.error, "Erro ao buscar serviços"),
  };
}

export function useServiceById(id: string) {
  const query = useQuery({
    queryKey: queryKeys.publicSite.serviceById(id),
    queryFn: () => unwrapQuery<Service | null>(queries.getServiceById(id)),
    enabled: Boolean(id),
  });
  return {
    service: query.data ?? null,
    loading: query.isPending,
    error: queryError(query.error, "Erro ao buscar serviço"),
  };
}

export function useServiceDetailBySlug(slug: string | null) {
  const query = useQuery({
    queryKey: queryKeys.publicSite.service(slug ?? ""),
    queryFn: () => unwrapQuery<any | null>(queries.getServiceDetailBySlug(slug!)),
    enabled: Boolean(slug),
  });
  return {
    detail: query.data ?? null,
    loading: Boolean(slug) && query.isPending,
    error: queryError(query.error, "Erro ao buscar serviço"),
  };
}

export function useServiceCategories() {
  const query = useQuery({
    queryKey: queryKeys.publicSite.categories(),
    queryFn: () => unwrapQuery<ServiceCategory[]>(queries.getServiceCategories()).then((data) => data ?? []),
  });
  return {
    categories: query.data ?? [],
    loading: query.isPending,
    error: queryError(query.error, "Erro ao buscar categorias"),
  };
}

export function useProducts() {
  const query = useQuery({
    queryKey: queryKeys.publicSite.products(),
    queryFn: () => unwrapQuery<Product[]>(queries.getProducts()).then((data) => data ?? []),
  });
  return {
    products: query.data ?? [],
    loading: query.isPending,
    error: queryError(query.error, "Erro ao buscar produtos"),
  };
}

export function useFeaturedProducts() {
  const query = useQuery({
    queryKey: queryKeys.publicSite.featuredProducts(),
    queryFn: () => unwrapQuery<Product[]>(queries.getFeaturedProducts()).then((data) => data ?? []),
  });
  return {
    products: query.data ?? [],
    loading: query.isPending,
    error: queryError(query.error, "Erro ao buscar produtos em destaque"),
  };
}

export function useProductDetailBySlug(slug: string | null) {
  const query = useQuery({
    queryKey: queryKeys.publicSite.product(slug ?? ""),
    queryFn: () => unwrapQuery<any | null>(queries.getProductDetailBySlug(slug!)),
    enabled: Boolean(slug),
  });
  return {
    detail: query.data ?? null,
    loading: Boolean(slug) && query.isPending,
    error: queryError(query.error, "Erro ao buscar produto"),
  };
}

export function useBrands() {
  const query = useQuery({
    queryKey: queryKeys.publicSite.brands(),
    queryFn: () => unwrapQuery<Brand[]>(queries.getBrands()).then((data) => data ?? []),
  });
  return {
    brands: query.data ?? [],
    loading: query.isPending,
    error: queryError(query.error, "Erro ao buscar marcas"),
  };
}

export function useSiteSettings() {
  const query = useQuery({
    queryKey: queryKeys.publicSite.settings(),
    queryFn: getSiteSettings,
  });
  return {
    settings: query.data ?? {},
    loading: query.isPending,
    error: queryError(query.error, "Erro ao buscar configurações do site"),
  };
}

export function useMediaUrl(mediaId: string | null | undefined) {
  const query = useQuery({
    queryKey: queryKeys.publicSite.media(mediaId ?? ""),
    queryFn: async () => {
      const media = await unwrapQuery<any | null>(queries.getMediaById(mediaId!));
      if (!media) throw new Error("Imagem não encontrada");
      const bucketName = media.bucket_id ?? media.bucket_name ?? null;
      const storagePath = media.storage_path ?? null;
      if (!bucketName || !storagePath) throw new Error("Imagem indisponível");
      const url = queries.getPublicStorageUrl(bucketName, storagePath);
      if (!url) throw new Error("Imagem indisponível");
      return url;
    },
    enabled: Boolean(mediaId),
    staleTime: 30 * 60_000,
  });
  return {
    url: query.data ?? null,
    loading: Boolean(mediaId) && query.isPending,
    error: queryError(query.error, "Erro ao buscar imagem"),
  };
}
