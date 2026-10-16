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
export type ShippingQuote = { id: string; name: string; company: string; price: number; delivery_days: number | null };
export async function shippingQuotes(product: ProductData, quantity: number, zip: string): Promise<ShippingQuote[]> {
  const token = Deno.env.get("MELHOR_ENVIO_TOKEN");
  const from = Deno.env.get("ARTVIDEO_SHIPPING_ORIGIN_CEP");
  if (!token || !from || !/^\d{8}$/.test(from)) {
    throw new Error("A cotação de frete ainda não foi configurada pela Artvideo.");
  }
  const measures = [product.gross_weight_grams, product.height_mm, product.width_mm, product.length_mm];
  if (measures.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
    throw new Error("Este produto precisa de peso e medidas cadastrados antes da venda online.");
  }
  const payload = {
    from: { postal_code: from },
    to: { postal_code: zip },
    products: [{
      id: product.id,
      width: Math.max(2, Math.ceil(Number(product.width_mm) / 10)),
      height: Math.max(2, Math.ceil(Number(product.height_mm) / 10)),
      length: Math.max(2, Math.ceil(Number(product.length_mm) / 10)),
      weight: Math.max(0.3, Number((Number(product.gross_weight_grams) / 1000).toFixed(3))),
      insurance_value: Number(product.price),
      quantity,
    }],
  };
  const response = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`, "Content-Type": "application/json",
      "Accept": "application/json", "User-Agent": "EletronicaArtvideo/1.0 (suporte@eletronicaartvideo.com.br)",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(16000),
  });
  if (!response.ok) throw new Error("Não foi possível consultar as transportadoras.");
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Resposta de frete inválida.");
  return data.filter((row: any) => !row.error && Number.isFinite(Number(row.custom_price ?? row.price))
      && Number(row.custom_price ?? row.price) >= 0)
    .map((row: any) => ({
      id: String(row.id), name: String(row.name ?? "Entrega"),
      company: String(row.company?.name ?? "Transportadora"),
      price: Math.round(Number(row.custom_price ?? row.price)*100)/100,
      delivery_days: Number.isFinite(Number(row.custom_delivery_time ?? row.delivery_time))
        ? Number(row.custom_delivery_time ?? row.delivery_time) : null,
    })).slice(0, 10);
}
