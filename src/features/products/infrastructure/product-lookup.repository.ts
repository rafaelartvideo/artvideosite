import { supabase } from "@/lib/supabase";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { getPublicStorageUrl } from "@/shared/infrastructure/media.repository";

export type ExternalProductLookup = {
  provider: "cosmos" | "upcitemdb" | string;
  external_id: string | null;
  name: string;
  description: string | null;
  gtin: string | null;
  brand: string | null;
  model: string | null;
  manufacturer_code: string | null;
  category_name: string | null;
  category_code: string | null;
  ncm: string | null;
  gross_weight_grams: number | null;
  net_weight_grams: number | null;
  width_mm: number | null;
  height_mm: number | null;
  length_mm: number | null;
  reference_price: number | null;
  min_price: number | null;
  max_price: number | null;
  currency: string | null;
  images: string[];
  source_url: string | null;
};

export type ImportedProductImage = {
  media_id: string;
  public_url: string;
};

export async function searchExternalProducts(
  organizationId: string,
  query: string,
): Promise<{ provider: string; results: ExternalProductLookup[]; warning?: string | null }> {
  const { data, error } = await supabase.functions.invoke("product-lookup", {
    body: {
      organization_id: organizationId,
      action: "search",
      query,
    },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "Não foi possível consultar o catálogo externo.");
  return {
    provider: String(data.provider || ""),
    results: Array.isArray(data.results) ? data.results : [],
    warning: data.warning ? String(data.warning) : null,
  };
}

export async function importExternalProductImage(
  organizationId: string,
  imageUrl: string,
  altText: string,
): Promise<ImportedProductImage> {
  const { data, error } = await supabase.functions.invoke("product-lookup", {
    body: {
      organization_id: organizationId,
      action: "import-image",
      image_url: imageUrl,
      alt_text: altText,
    },
  });
  if (error) throw error;
  if (!data?.success || !data?.media_id) {
    throw new Error(data?.error || "Não foi possível importar a imagem.");
  }
  return {
    media_id: String(data.media_id),
    public_url: String(data.public_url || ""),
  };
}

export async function findOrCreateInventoryCategory(
  organizationId: string,
  name: string,
  canCreate: boolean,
): Promise<{ id: string; name: string } | null> {
  const normalized = String(name || "").trim();
  if (!normalized) return null;

  const { data: existing, error: existingError } = await supabase
    .from("product_categories")
    .select("id,name")
    .eq("organization_id", organizationId)
    .ilike("name", normalized)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return { id: String(existing.id), name: String(existing.name) };
  if (!canCreate) return null;

  const slug = await generateUniqueSlug("product_categories", normalized);
  const { data, error } = await supabase
    .from("product_categories")
    .insert({
      organization_id: organizationId,
      name: normalized,
      slug,
      is_active: true,
    })
    .select("id,name")
    .single();
  if (error) throw error;
  return { id: String(data.id), name: String(data.name) };
}

export async function findOrCreateInventoryBrand(
  organizationId: string,
  name: string,
  canCreate: boolean,
): Promise<{ id: string; name: string } | null> {
  const normalized = String(name || "").trim();
  if (!normalized) return null;

  const { data: existing, error: existingError } = await supabase
    .from("brands")
    .select("id,name")
    .eq("organization_id", organizationId)
    .ilike("name", normalized)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return { id: String(existing.id), name: String(existing.name) };
  if (!canCreate) return null;

  const slug = await generateUniqueSlug("brands", normalized);
  const { data, error } = await supabase
    .from("brands")
    .insert({
      organization_id: organizationId,
      name: normalized,
      slug,
      is_active: true,
    })
    .select("id,name")
    .single();
  if (error) throw error;
  return { id: String(data.id), name: String(data.name) };
}

export async function loadProductGallery(
  organizationId: string,
  productId: string,
): Promise<Array<{ media_id: string; public_url: string; alt_text: string | null }>> {
  const { data: links, error: linkError } = await supabase
    .from("product_media")
    .select("media_id,sort_order")
    .eq("organization_id", organizationId)
    .eq("product_id", productId)
    .order("sort_order");
  if (linkError) throw linkError;
  const ids = (links || []).map((row: any) => String(row.media_id));
  if (ids.length === 0) return [];

  const { data: media, error: mediaError } = await supabase
    .from("media")
    .select("id,bucket_id,storage_path,alt_text")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (mediaError) throw mediaError;
  const mediaById = new Map((media || []).map((row: any) => [String(row.id), row]));

  return ids.flatMap(id => {
    const row: any = mediaById.get(id);
    if (!row) return [];
    return [{
      media_id: id,
      public_url: getPublicStorageUrl(String(row.bucket_id), String(row.storage_path)),
      alt_text: row.alt_text ? String(row.alt_text) : null,
    }];
  });
}
