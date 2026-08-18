// Ready-to-use query helpers for existing Supabase tables.
// All queries respect RLS policies configured in Supabase.
import { supabase } from "./supabase";
import type { StorageBucket } from "./database.types";

// ── Services ──────────────────────────────────────────────────
export const getServices = () =>
  supabase
    .from("services")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

export const getServiceById = (id: string) =>
  supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

export const getServiceBySlug = (slug: string) =>
  supabase
    .from("services")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

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
    .map((result) => result.error)
    .find(Boolean);
  if (relatedError) return { data: null, error: relatedError };

  const filterOptionIds = (filters.data || []).map((filter) => filter.filter_option_id);
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

export const getServiceVariants = (serviceId: string) =>
  supabase
    .from("service_variants")
    .select("*")
    .eq("service_id", serviceId)
    .order("sort_order", { ascending: true });

export const getServiceInclusions = (serviceId: string) =>
  supabase
    .from("service_inclusions")
    .select("*")
    .eq("service_id", serviceId)
    .order("sort_order", { ascending: true });

export const getServiceExclusions = (serviceId: string) =>
  supabase
    .from("service_exclusions")
    .select("*")
    .eq("service_id", serviceId)
    .order("sort_order", { ascending: true });

export const getServicePriceFactors = (serviceId: string) =>
  supabase
    .from("service_price_factors")
    .select("*")
    .eq("service_id", serviceId)
    .order("sort_order", { ascending: true });

export const getServiceFaqs = (serviceId: string) =>
  supabase
    .from("service_faqs")
    .select("*")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

export const getServiceSections = (serviceId: string) =>
  supabase
    .from("service_sections")
    .select("*")
    .eq("service_id", serviceId)
    .order("sort_order", { ascending: true });

// ── Service Categories ────────────────────────────────────────
export const getServiceCategories = () =>
  supabase
    .from("service_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

export const getServiceCategoryBySlug = (slug: string) =>
  supabase
    .from("service_categories")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

// ── Products & Categories ────────────────────────────────────
export const getProducts = () =>
  supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

export const getFeaturedProducts = () =>
  supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: false });

export const getProductById = (id: string) =>
  supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

export const getProductBySlug = (slug: string) =>
  supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

export async function getProductDetailBySlug(slug: string) {
  const { data: product, error } = await getProductBySlug(slug);
  if (error || !product) return { data: null, error };

  const [brand, media] = await Promise.all([
    product.brand_id ? supabase.from("brands").select("*").eq("id", product.brand_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    product.cover_media_id ? getMediaById(product.cover_media_id) : Promise.resolve({ data: null, error: null }),
  ]);

  if (brand.error) return { data: null, error: brand.error };
  if (media.error) return { data: null, error: media.error };

  return {
    data: {
      product,
      brand: brand.data,
      media: media.data,
    },
    error: null,
  };
}

export const getProductCategories = () =>
  supabase
    .from("product_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

// ── Brands ────────────────────────────────────────────────────
export const getBrands = () =>
  supabase
    .from("brands")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

export const getBrandById = (id: string) =>
  supabase
    .from("brands")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

// ── Media ─────────────────────────────────────────────────────
export const getMediaById = (id: string) =>
  supabase
    .from("media")
    .select("*")
    .eq("id", id)
    .maybeSingle();

export const getMediaByPath = (bucket: string, path: string) =>
  supabase
    .from("media")
    .select("*")
    .eq("bucket_id", bucket)
    .eq("storage_path", path)
    .maybeSingle();

// ── Customers ────────────────────────────────────────────────
export const getCustomerByDocument = async (document: string) => {
  const { data, error } = await supabase.rpc(
    "find_customer_by_document",
    {
      p_document: document,
    }
  );

  if (error) {
    console.error("Erro ao buscar cliente por CPF:", error);
    throw error;
  }

  return data?.[0] ?? null;
};

export const updateCustomer = (id: string, payload: Partial<{
  full_name: string;
  whatsapp: string | null;
  email: string | null;
  phone: string | null;
  document: string | null;
}>) =>
  supabase
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

export const getCustomers = () =>
  supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

export const getCustomerById = (id: string) =>
  supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

// ── Request Statuses ──────────────────────────────────────────
export const getRequestStatuses = () =>
  supabase
    .from("request_statuses")
    .select("id, name, sort_order")
    .order("sort_order");

// ── Order Statuses ────────────────────────────────────────────
export const getOrderStatuses = () =>
  supabase
    .from("order_statuses")
    .select("id, name, sort_order")
    .order("sort_order");

// ── Quote Requests ────────────────────────────────────────────
export function generateProtocol(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORC-${year}${month}${day}-${rand}`;
}

export const createQuoteRequest = (payload: {
  customer_id: string;
  service_id?: string | null;
  brand_id?: string | null;
  product_id?: string | null;
  status_id?: string | null;
  customer_message?: string | null;
  protocol: string;
  estimated_price?: number | null;
}) =>
  supabase
    .from("quote_requests")
    .insert(payload)
    .select()
    .single();

export const getQuoteRequestById = (id: string) =>
  supabase
    .from("quote_requests")
    .select("*")
    .eq("id", id)
    .single();

// ── Service Orders ────────────────────────────────────────────
export const getServiceOrderById = (id: string) =>
  supabase
    .from("service_orders")
    .select("*")
    .eq("id", id)
    .single();

export const getServiceOrderStatus = (orderId: string) =>
  supabase
    .from("service_order_status_history")
    .select("*, order_status:order_statuses(*)")
    .eq("service_order_id", orderId)
    .eq("is_visible_to_customer", true)
    .order("created_at", { ascending: false });

// ── Contact & Site Settings ───────────────────────────────────
export const getContactField = (fieldKey: string) =>
  supabase
    .from("contact_fields")
    .select("*")
    .eq("field_key", fieldKey)
    .single();

export const getPublicContactFields = () =>
  supabase
    .from("contact_fields")
    .select("id, field_key, label, field_type, placeholder, is_required, validation_rules, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

export const getSiteSettings = () =>
  supabase
    .from("site_settings")
    .select("setting_key, setting_value");

export const getSiteSettingByKey = (key: string) =>
  supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .single();

// ── Filters ───────────────────────────────────────────────────
export const getFilters = () =>
  supabase
    .from("filters")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

export const getFilterById = (id: string) =>
  supabase
    .from("filters")
    .select("*")
    .eq("id", id)
    .single();

export const getFilterOptions = (filterId: string) =>
  supabase
    .from("filter_options")
    .select("*")
    .eq("filter_id", filterId)
    .order("sort_order", { ascending: true });

export const getServiceFilters = (serviceId: string) =>
  supabase
    .from("service_filter_options")
    .select("filter_option_id")
    .eq("service_id", serviceId);

// ── Storage helpers ───────────────────────────────────────────
export function getPublicStorageUrl(bucket: StorageBucket | string, path: string) {
  const normalizedBucket = String(bucket || "");
  if (!normalizedBucket || !path) return "";
  const { data } = supabase.storage.from(normalizedBucket).getPublicUrl(path);
  return data.publicUrl;
}
