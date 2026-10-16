export const ARTVIDEO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
export const CORS = {
  "Access-Control-Allow-Origin": "https://eletronicaartvideo.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
});
export function cleanPostalCode(input: unknown): string {
  const zip = String(input ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(zip)) throw new Error("Informe um CEP válido.");
  return zip;
}
export function validQuantity(input: unknown): number {
  const n = Number(input);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error("Quantidade inválida (máximo 10).");
  return n;
}
export function safeText(value: unknown, max = 200): string {
  const text = String(value ?? "").trim().slice(0,max);
  return text;
}
export type ProductData = {
  id: string; name: string; slug: string; price: number; commercial_unit: string;
  gross_weight_grams: number | null; height_mm: number | null;
  width_mm: number | null; length_mm: number | null;
};
export async function loadProduct(admin: any, productId: string): Promise<ProductData> {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new Error("Produto inválido.");
  const { data: product, error } = await admin.from("products")
    .select("id,name,slug,price,commercial_unit,gross_weight_grams,height_mm,width_mm,length_mm")
    .eq("id", productId).eq("organization_id", ARTVIDEO_ORGANIZATION_ID)
    .eq("is_active", true).eq("show_in_catalog", true).maybeSingle();
  if (error || !product || Number(product.price) <= 0) throw new Error("Produto indisponível para compra.");
  return product as ProductData;
}
export type ShippingQuote = {
  id: string; name: string; company: string; price: number; delivery_days: number | null;
};

/** Frete regional calculado exclusivamente pelas faixas/CEPs da Artvideo. */
export async function shippingQuotes(admin: any, zip: string): Promise<ShippingQuote[]> {
  const { data, error } = await admin.rpc("artvideo_shipping_quote_v1", { p_cep: zip });
  if (error) throw new Error("Não foi possível consultar a entrega para este CEP.");
  if (!data) return [];
  if (!Number.isFinite(Number(data.price)) || Number(data.price) < 0) {
    throw new Error("A tarifa de entrega está indisponível.");
  }
  return [{
    id: String(data.id),
    name: String(data.name || "Entrega regional"),
    company: "Artvideo",
    price: Number(data.price),
    delivery_days: data.delivery_days == null ? null : Number(data.delivery_days),
  }];
}
