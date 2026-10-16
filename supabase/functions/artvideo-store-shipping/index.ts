import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { CORS, cleanPostalCode, json, loadProduct, shippingQuotes, validQuantity } from "../_shared/artvideo-store.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);
  try {
    const body = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const quantity = validQuantity(body.quantity);
    const zip = cleanPostalCode(body.postal_code);
    const product = await loadProduct(admin, String(body.product_id || ""));
    // Produto e quantidade são validados, mas não entram no preço regional.
    void product; void quantity;
    const quotes = await shippingQuotes(admin, zip);
    return json({ options: quotes });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Não foi possível calcular o frete." }, 400);
  }
});
