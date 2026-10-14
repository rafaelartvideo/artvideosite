import { supabase } from "@/lib/supabase";

export type MarketplaceStore = {
  organization_id: string;
  slug: string;
  display_name: string;
  description: string;
  city: string;
  state: string;
  logo_url: string | null;
  banner_url: string | null;
  status: "pending" | "approved" | "suspended";
};

export type MarketplaceCategory = { id: string; name: string; slug: string; is_active: boolean; sort_order: number };
export type MarketplaceListing = {
  id: string;
  organization_id: string;
  source_kind: "service" | "product";
  source_id: string;
  category_id: string | null;
  title: string;
  description: string;
  price_type: "fixed" | "quote" | "appointment";
  price: number | null;
  cover_image_url: string | null;
  status: "draft" | "pending" | "approved" | "rejected" | "paused";
};
export type MarketplaceSource = { id: string; name: string; price: number | null; kind: "service" | "product" };
export type MarketplaceStoreInput = Pick<MarketplaceStore, "organization_id" | "slug" | "display_name" | "description" | "city" | "state" | "logo_url" | "banner_url">;
export type MarketplaceListingInput = Pick<MarketplaceListing, "organization_id" | "source_kind" | "source_id" | "category_id" | "title" | "description" | "price_type" | "price" | "cover_image_url">;

const STORE_COLUMNS = "organization_id,slug,display_name,description,city,state,logo_url,banner_url,status";
const LISTING_COLUMNS = "id,organization_id,source_kind,source_id,category_id,title,description,price_type,price,cover_image_url,status";

export async function loadMarketplaceManagement(organizationId: string, platform: boolean) {
  const [storesResult, listingsResult, categoriesResult] = await Promise.all([
    supabase.from("marketplace_stores").select(STORE_COLUMNS).order("display_name"),
    supabase.from("marketplace_listings").select(LISTING_COLUMNS).order("created_at", { ascending: false }),
    supabase.from("marketplace_categories").select("id,name,slug,is_active,sort_order").order("sort_order"),
  ]);
  if (storesResult.error) throw storesResult.error;
  if (listingsResult.error) throw listingsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  return {
    stores: ((storesResult.data || []) as MarketplaceStore[]).filter(s => platform || s.organization_id === organizationId),
    listings: ((listingsResult.data || []) as MarketplaceListing[]).filter(s => platform || s.organization_id === organizationId),
    categories: (categoriesResult.data || []) as MarketplaceCategory[],
  };
}

export async function loadMarketplaceSourceCatalog(organizationId: string): Promise<MarketplaceSource[]> {
  const [services, products] = await Promise.all([
    supabase.from("general_services").select("id,name,price,is_active")
      .eq("organization_id", organizationId).eq("is_active", true).order("name"),
    supabase.from("products").select("id,name,price,is_active")
      .eq("organization_id", organizationId).eq("is_active", true).order("name"),
  ]);
  // Acesso aos cadastros depende das permissoes independentes de Servicos e Estoque.
  // Nao expor dados de outros tenants, nem elevar acesso pela interface.
  const serviceItems = services.error ? [] : (services.data || []).map(x => ({
    id: String(x.id), name: String(x.name), price: x.price == null ? null : Number(x.price), kind: "service" as const,
  }));
  const productItems = products.error ? [] : (products.data || []).map(x => ({
    id: String(x.id), name: String(x.name), price: x.price == null ? null : Number(x.price), kind: "product" as const,
  }));
  return [...serviceItems, ...productItems];
}

export async function saveMarketplaceStore(data: MarketplaceStoreInput, exists: boolean) {
  const result = exists
    ? await supabase.from("marketplace_stores").update({
      slug: data.slug, display_name: data.display_name, description: data.description,
      city: data.city, state: data.state, logo_url: data.logo_url, banner_url: data.banner_url,
    }).eq("organization_id", data.organization_id).select("organization_id").single()
    : await supabase.from("marketplace_stores").insert(data).select("organization_id").single();
  if (result.error) throw result.error;
}

export async function saveMarketplaceListing(data: MarketplaceListingInput, id?: string) {
  const result = id
    ? await supabase.from("marketplace_listings").update({
      category_id: data.category_id, title: data.title, description: data.description,
      price_type: data.price_type, price: data.price, cover_image_url: data.cover_image_url,
    }).eq("id", id).eq("organization_id", data.organization_id).select("id").single()
    : await supabase.from("marketplace_listings").insert({ ...data, status: "draft" }).select("id").single();
  if (result.error) throw result.error;
}

export async function changeMarketplaceStoreStatus(organizationId: string, status: MarketplaceStore["status"]) {
  const { data, error } = await supabase.from("marketplace_stores")
    .update({ status }).eq("organization_id", organizationId).select("organization_id").single();
  if (error) throw error;
  if (!data) throw new Error("Loja não encontrada.");
}

export async function changeMarketplaceListingStatus(id: string, organizationId: string, status: MarketplaceListing["status"]) {
  const { data, error } = await supabase.from("marketplace_listings")
    .update({ status }).eq("organization_id", organizationId).eq("id", id).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Anúncio não encontrado.");
}

export async function saveMarketplaceCategory(input: { name: string; slug: string }) {
  const { error } = await supabase.from("marketplace_categories").insert(input);
  if (error) throw error;
}


export type MarketplaceCatalogFilters = {
  query?: string;
  kind?: "all" | "service" | "product";
  categoryId?: string;
  state?: string;
  city?: string;
  priceMode?: "all" | "fixed" | "quote" | "appointment";
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
  storeId?: string | null;
};

export async function loadPublicMarketplaceShell() {
  const [stores, categories] = await Promise.all([
    supabase.from("marketplace_stores").select(STORE_COLUMNS).eq("status", "approved").order("display_name"),
    supabase.from("marketplace_categories").select("id,name,slug,is_active,sort_order").eq("is_active", true).order("sort_order"),
  ]);
  if (stores.error) throw stores.error;
  if (categories.error) throw categories.error;
  return {
    stores: (stores.data || []) as MarketplaceStore[],
    categories: (categories.data || []) as MarketplaceCategory[],
  };
}

export async function loadPublicMarketplaceListing(id: string): Promise<MarketplaceListing | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) return null;
  const { data, error } = await supabase.from("marketplace_listings")
    .select(LISTING_COLUMNS).eq("id", id).eq("status", "approved").maybeSingle();
  if (error) throw error;
  return (data as MarketplaceListing | null) || null;
}

export async function searchPublicMarketplaceListings(
  filters: MarketplaceCatalogFilters,
  approvedStores: MarketplaceStore[],
): Promise<{ listings: MarketplaceListing[]; total: number }> {
  // Filtrar sempre dentro das lojas publicamente aprovadas. As policies RLS
  // continuam sendo a barreira de segurança em toda consulta anonima.
  const allowed = approvedStores.filter(store =>
    (!filters.storeId || store.organization_id === filters.storeId)
    && (!filters.state || store.state.toLocaleUpperCase("pt-BR") === filters.state.toLocaleUpperCase("pt-BR"))
    && (!filters.city || store.city.toLocaleLowerCase("pt-BR") === filters.city.toLocaleLowerCase("pt-BR"))
  );
  if (!allowed.length) return { listings: [], total: 0 };
  const pageSize = Math.min(48, Math.max(1, Math.floor(filters.pageSize || 12)));
  const page = Math.max(1, Math.floor(filters.page || 1));
  let request = supabase.from("marketplace_listings")
    .select(LISTING_COLUMNS, { count: "exact" })
    .eq("status", "approved")
    .in("organization_id", allowed.map(store => store.organization_id));

  if (filters.kind && filters.kind !== "all") request = request.eq("source_kind", filters.kind);
  if (filters.categoryId) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(filters.categoryId)) return { listings: [], total: 0 };
    request = request.eq("category_id", filters.categoryId);
  }
  if (filters.priceMode && filters.priceMode !== "all") request = request.eq("price_type", filters.priceMode);
  if (filters.minPrice != null && Number.isFinite(filters.minPrice)) request = request.gte("price", Math.max(0, filters.minPrice));
  if (filters.maxPrice != null && Number.isFinite(filters.maxPrice)) request = request.lte("price", Math.max(0, filters.maxPrice));

  // Normalizar caracteres especiais antes de construir os dois predicados OR.
  // Nunca concatenar sintaxe PostgREST fornecida diretamente pelo visitante.
  const term = (filters.query || "").normalize("NFC")
    .replace(/[^a-zA-ZÀ-ÿ0-9\s-]/g, " ").replace(/\s+/g, " ").trim().slice(0,100);
  if (term) request = request.or("title.ilike.%" + term + "%,description.ilike.%" + term + "%");

  if (filters.sort === "price_asc") request = request.order("price", { ascending: true, nullsFirst: false });
  else if (filters.sort === "price_desc") request = request.order("price", { ascending: false, nullsFirst: false });
  else request = request.order("created_at", { ascending: false });
  const { data, count, error } = await request.order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { listings: (data || []) as MarketplaceListing[], total: count || 0 };
}
