import { supabase } from "@/lib/supabase";

export const getServices = () =>
  supabase.from("services").select("*").eq("is_active", true).order("sort_order", { ascending: true });

export const getServiceById = (id: string) =>
  supabase.from("services").select("*").eq("id", id).eq("is_active", true).single();

const getServiceBySlug = (slug: string) =>
  supabase.from("services").select("*").eq("slug", slug).eq("is_active", true).single();

const getServiceVariants = (serviceId: string) =>
  supabase.from("service_variants").select("*").eq("service_id", serviceId).order("sort_order", { ascending: true });

const getServiceInclusions = (serviceId: string) =>
  supabase.from("service_inclusions").select("*").eq("service_id", serviceId).order("sort_order", { ascending: true });

const getServiceExclusions = (serviceId: string) =>
  supabase.from("service_exclusions").select("*").eq("service_id", serviceId).order("sort_order", { ascending: true });

const getServicePriceFactors = (serviceId: string) =>
  supabase.from("service_price_factors").select("*").eq("service_id", serviceId).order("sort_order", { ascending: true });

const getServiceFaqs = (serviceId: string) =>
  supabase.from("service_faqs").select("*").eq("service_id", serviceId).eq("is_active", true).order("sort_order", { ascending: true });

const getServiceSections = (serviceId: string) =>
  supabase.from("service_sections").select("*").eq("service_id", serviceId).order("sort_order", { ascending: true });

const getServiceFilters = (serviceId: string) =>
  supabase.from("service_filter_options").select("filter_option_id").eq("service_id", serviceId);

const getMediaById = (id: string) =>
  supabase.from("media").select("*").eq("id", id).maybeSingle();

export async function getServiceDetailBySlug(slug: string) {
  const { data: service, error } = await getServiceBySlug(slug);
  if (error || !service) return { data: null, error };

  const [variants, inclusions, exclusions, priceFactors, faqs, sections, filters, category, brand, product, media] = await Promise.all([
    getServiceVariants(service.id),
    getServiceInclusions(service.id),
    getServiceExclusions(service.id),
    getServicePriceFactors(service.id),
    getServiceFaqs(service.id),
    getServiceSections(service.id),
    getServiceFilters(service.id),
    service.category_id ? supabase.from("service_categories").select("*").eq("id", service.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    service.brand_id ? supabase.from("brands").select("*").eq("id", service.brand_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    service.product_id ? supabase.from("products").select("*").eq("id", service.product_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    service.cover_media_id ? getMediaById(service.cover_media_id) : Promise.resolve({ data: null, error: null }),
  ]);

  const relatedError = [variants, inclusions, exclusions, priceFactors, faqs, sections, filters, category, brand, product, media]
    .map(result => result.error)
    .find(Boolean);
  if (relatedError) return { data: null, error: relatedError };

  const filterOptionIds = (filters.data || []).map(filter => filter.filter_option_id);
  const { data: filterOptions, error: filterOptionsError } = filterOptionIds.length > 0
    ? await supabase.from("filter_options").select("id, name, value").in("id", filterOptionIds)
    : { data: [], error: null };
  if (filterOptionsError) return { data: null, error: filterOptionsError };

  return {
    data: {
      service,
      variants: variants.data || [],
      inclusions: inclusions.data || [],
      exclusions: exclusions.data || [],
      priceFactors: priceFactors.data || [],
      faqs: faqs.data || [],
      sections: sections.data || [],
      filters: filterOptions || [],
      category: category.data,
      brand: brand.data,
      product: product.data,
      media: media.data,
    },
    error: null,
  };
}

export const getServiceCategories = () =>
  supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order", { ascending: true });

export const getProducts = () =>
  supabase.from("products").select("*").eq("is_active", true).order("created_at", { ascending: false });

export const getFeaturedProducts = () =>
  supabase.from("products").select("*").eq("is_active", true).eq("is_featured", true).order("created_at", { ascending: false });

const getProductBySlug = (slug: string) =>
  supabase.from("products").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();

export async function getProductDetailBySlug(slug: string) {
  const { data: product, error } = await getProductBySlug(slug);
  if (error || !product) return { data: null, error };

  const [brand, media] = await Promise.all([
    product.brand_id ? supabase.from("brands").select("*").eq("id", product.brand_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    product.cover_media_id ? getMediaById(product.cover_media_id) : Promise.resolve({ data: null, error: null }),
  ]);
  if (brand.error) return { data: null, error: brand.error };
  if (media.error) return { data: null, error: media.error };

  return { data: { product, brand: brand.data, media: media.data }, error: null };
}

export const getBrands = () =>
  supabase.from("brands").select("*").eq("is_active", true).order("sort_order", { ascending: true });
