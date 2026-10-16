import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  CORS, cleanPostalCode, json, loadProduct, safeText, shippingQuotes, validQuantity,
} from "../_shared/artvideo-store.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);
  const token = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const collector = Deno.env.get("MERCADO_PAGO_COLLECTOR_ID");
  if (!token || !collector) {
    return json({ error: "A loja ainda está configurando o pagamento e a entrega online. Nenhum valor foi cobrado." }, 503);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  let orderId = "";
  try {
    const input = await req.json();
    const cart = Array.isArray(input.items) ? input.items : [
      { product_id: input.product_id, quantity: input.quantity },
    ];
    if (cart.length < 1 || cart.length > 15) throw new Error("Carrinho inválido.");
    const validated = cart.map((item: any) => ({
      product_id: String(item.product_id || ""),
      quantity: validQuantity(item.quantity),
    }));
    if (new Set(validated.map(item => item.product_id)).size !== validated.length) {
      throw new Error("O carrinho possui produtos duplicados.");
    }
    const zip = cleanPostalCode(input.postal_code);
    const email = safeText(input.buyer_email, 200);
    const name = safeText(input.buyer_name, 150);
    const phone = safeText(input.buyer_phone, 24).replace(/[^\d+]/g, "");
    const address = {
      street: safeText(input.street, 160), number: safeText(input.number, 30),
      complement: safeText(input.complement, 160), district: safeText(input.district, 120),
      city: safeText(input.city, 120), state: safeText(input.state, 2).toUpperCase(),
    };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 3
      || phone.replace(/\D/g, "").length < 10 || !Object.values(address)
        .filter((_, i) => i !== 2).every(v => v.length > 0)
      || !/^[A-Z]{2}$/.test(address.state)) {
      return json({ error: "Confira os dados do comprador e endereço de entrega." }, 400);
    }
    const products = await Promise.all(validated.map(item => loadProduct(admin, item.product_id)));
    const options = await shippingQuotes(admin, zip);
    const selected = options.find(q => q.id === String(input.shipping_service_id));
    if (!selected) return json({ error: "O frete selecionado mudou. Calcule novamente antes de pagar." }, 409);

    const buyer = { buyer_name: name, buyer_email: email, buyer_phone: phone, postal_code: zip, ...address };
    const { data: order, error: orderError } = await admin.rpc("artvideo_store_begin_multi_v1", {
      p_items: validated,
      p_shipping_price: selected.price, p_shipping_service_id: selected.id,
      p_shipping_name: `${selected.company} — ${selected.name}`, p_postal_code: zip, p_buyer: buyer,
    });
    if (orderError || !order?.id) throw new Error(orderError?.message || "Não foi possível reservar o estoque.");
    orderId = order.id;

    const deadline = new Date(Date.now() + 20*60*1000).toISOString();
    const detailUrl = validated.length === 1
      ? `https://eletronicaartvideo.com.br/loja/${encodeURIComponent(products[0].slug)}`
      : "https://eletronicaartvideo.com.br/carrinho";
    const mpRequest = {
      items: [
        ...((order.items || []) as Array<{product_id: string; title: string; quantity: number; unit_price: number}>).map(item => ({
          id: item.product_id, title: item.title.slice(0, 200),
          quantity: item.quantity, currency_id: "BRL", unit_price: Number(item.unit_price),
        })),
        { id: `shipping-${selected.id}`, title: `Frete: ${selected.company} — ${selected.name}`.slice(0,200),
          quantity: 1, currency_id: "BRL", unit_price: Number(selected.price) },
      ].filter(item => item.unit_price > 0),
      payer: { name, email, phone: { area_code: phone.replace(/\D/g, "").slice(0,2), number: phone.replace(/\D/g, "").slice(2) } },
      external_reference: orderId,
      back_urls: {
        success: `${detailUrl}?compra=retorno`, pending: `${detailUrl}?compra=pendente`,
        failure: `${detailUrl}?compra=nao-concluida`,
      },
      auto_return: "approved",
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/artvideo-store-webhook`,
      expires: true,
      expiration_date_from: new Date().toISOString(), expiration_date_to: deadline,
      statement_descriptor: "ARTVIDEO",
    };
    const paymentResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": orderId },
      body: JSON.stringify(mpRequest), signal: AbortSignal.timeout(18000),
    });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok || !payment.init_point || !payment.id)
      throw new Error("O provedor de pagamentos não confirmou a criação do checkout.");
    const { error: preferenceError } = await admin.rpc("artvideo_store_preference_v1", {
      p_order_id: orderId, p_preference_id: String(payment.id),
    });
    if (preferenceError) throw preferenceError;
    const checkoutUrl = String(payment.init_point);
    if (!/^https:\/\/(www\.)?mercadopago\.com(\.br)?\//.test(checkoutUrl)) {
      throw new Error("O provedor retornou um endereço inválido.");
    }
    return json({ checkout_url: checkoutUrl, order_id: orderId });
  } catch (error) {
    if (orderId) await admin.rpc("artvideo_store_cancel_v1", { p_order_id: orderId });
    return json({ error: error instanceof Error ? error.message : "Compra temporariamente indisponível. Nenhum valor foi cobrado." }, 400);
  }
});
