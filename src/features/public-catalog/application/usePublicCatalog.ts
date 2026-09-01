import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import * as publicCatalog from "../infrastructure/public-catalog.repository";
import type { Service, ServiceCategory, Product, Brand } from "@/lib/database.types";

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
    queryFn: () => unwrapQuery<Service[]>(publicCatalog.getServices()).then((data) => data ?? []),
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
    queryFn: () => unwrapQuery<Service | null>(publicCatalog.getServiceById(id)),
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
    queryFn: () => unwrapQuery<any | null>(publicCatalog.getServiceDetailBySlug(slug!)),
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
    queryFn: () => unwrapQuery<ServiceCategory[]>(publicCatalog.getServiceCategories()).then((data) => data ?? []),
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
    queryFn: () => unwrapQuery<Product[]>(publicCatalog.getProducts()).then((data) => data ?? []),
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
    queryFn: () => unwrapQuery<Product[]>(publicCatalog.getFeaturedProducts()).then((data) => data ?? []),
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
    queryFn: () => unwrapQuery<any | null>(publicCatalog.getProductDetailBySlug(slug!)),
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
    queryFn: () => unwrapQuery<Brand[]>(publicCatalog.getBrands()).then((data) => data ?? []),
  });
  return {
    brands: query.data ?? [],
    loading: query.isPending,
    error: queryError(query.error, "Erro ao buscar marcas"),
  };
}
