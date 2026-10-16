import { supabase } from "@/lib/supabase";
import { publicMediaUrl, type PublicMedia } from "@/features/public-catalog/infrastructure/public-media";

export type StoreProductImage = { url: string; alt: string };
export type StoreProductReview = {
  id: string;
  author: string;
  rating: number;
  body: string;
  created_at: string;
  verified_purchase: boolean;
};
export type StoreProductExtras = {
  stock: number | null;
  images: StoreProductImage[];
  rating: number;
  reviewCount: number;
  reviews: StoreProductReview[];
};
type ServerProductExtras = {
  stock?: number | null;
  gallery?: { media_id: string; bucket: string; path: string; alt: string | null }[];
  rating?: number;
  review_count?: number;
  reviews?: StoreProductReview[];
};

export async function getStoreProductExtras(productId: string, cover: PublicMedia | null): Promise<StoreProductExtras> {
  const { data, error } = await supabase.rpc("artvideo_product_storefront_v1", { p_product_id: productId });
  if (error) throw error;
  if (!data) throw new Error("Informações da venda indisponíveis.");
  const extra = data as ServerProductExtras;
  const images: StoreProductImage[] = [];
  const add = (url: string | null, alt: string) => {
    if (url && !images.some(item => item.url === url)) images.push({ url, alt });
  };
  add(publicMediaUrl(cover), "Imagem principal do produto");
  for (const media of extra.gallery || []) {
    if (media.bucket !== "product-images" || !media.path) continue;
    const url = supabase.storage.from(media.bucket).getPublicUrl(media.path).data.publicUrl;
    add(url, media.alt || "Foto adicional do produto");
  }
  return {
    stock: typeof extra.stock === "number" ? Math.max(0, Math.floor(extra.stock)) : null,
    images,
    rating: Number(extra.rating || 0),
    reviewCount: Number(extra.review_count || 0),
    reviews: Array.isArray(extra.reviews) ? extra.reviews : [],
  };
}

export type ShippingOption = {
  id: string;
  name: string;
  company: string;
  price: number;
  deliveryDays: number | null;
};
export async function quoteStoreShipping(productId: string, quantity: number, postalCode: string): Promise<ShippingOption[]> {
  const { data, error } = await supabase.functions.invoke("artvideo-store-shipping", {
    body: { product_id: productId, quantity, postal_code: postalCode.replace(/\D/g, "") },
  });
  if (error) throw new Error("A cotação online de frete não está disponível. Tente novamente mais tarde.");
  if (data?.error) throw new Error(String(data.error));
  if (!Array.isArray(data?.options)) throw new Error("Nenhuma opção de frete foi encontrada.");
  return data.options.filter((v: any) => typeof v.id === "string" && Number.isFinite(Number(v.price)))
    .map((v: any) => ({ id: v.id, name: String(v.name), company: String(v.company),
      price: Number(v.price), deliveryDays: v.delivery_days == null ? null : Number.isFinite(Number(v.delivery_days)) ? Number(v.delivery_days) : null }));
}

export async function startStoreCheckout(payload: {
  product_id: string;
  quantity: number;
  items?: { product_id: string; quantity: number }[];
  postal_code: string;
  shipping_service_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}): Promise<{ url: string; orderId: string }> {
  const { data, error } = await supabase.functions.invoke("artvideo-store-checkout", { body: payload });
  if (error) throw new Error("O pagamento online ainda não está disponível. Nenhum valor foi cobrado.");
  if (data?.error) throw new Error(String(data.error));
  const destination = typeof data?.checkout_url === "string" ? data.checkout_url : "";
  if (!/^https:\/\/(www\.)?mercadopago\.com(\.br)?\//.test(destination)) {
    throw new Error("Não foi possível iniciar um checkout seguro. Nenhum valor foi cobrado.");
  }
  return { url: destination, orderId: typeof data.order_id === "string" ? data.order_id : "" };
}

export async function submitStoreReview(payload: { orderId: string; email: string; rating: number; comment: string }): Promise<void> {
  const { error } = await supabase.rpc("artvideo_store_submit_review_v1", {
    p_order_id: payload.orderId, p_email: payload.email, p_rating: payload.rating, p_body: payload.comment,
  });
  if (error) throw new Error(error.message || "Não foi possível enviar sua avaliação.");
}


export type StorePickupOption = ShippingOption & {
  street: string; number: string; complement: string; district: string;
  city: string; state: string; postal_code: string;
  opening_hours: string; instructions: string;
};
export async function loadStorePickupOption(): Promise<StorePickupOption | null> {
  const { data, error } = await supabase.rpc("artvideo_store_pickup_option_v1");
  if (error) throw error;
  return data ? { ...data, deliveryDays: null } as StorePickupOption : null;
}
export async function loadCatalogAvailability(productIds: string[]): Promise<Record<string, number>> {
  if (!productIds.length) return {};
  const batches: string[][] = [];
  for (let i=0;i<productIds.length;i+=100) batches.push(productIds.slice(i,i+100));
  const result: Record<string, number> = {};
  for (const batch of batches) {
    const { data, error } = await supabase.rpc("artvideo_store_catalog_availability_v1", { p_product_ids: batch });
    if (error) throw error;
    Object.assign(result, data || {});
  }
  return result;
}
