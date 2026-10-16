import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Endpoint exclusivamente para eventos assinados do Mercado Pago.
// Não aceita status/valores enviados pelo navegador e nunca libera estoque
// antes de consultar o pagamento real no gateway.
async function verifySignature(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET") || "";
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const timestamp = /(?:^|,)ts=([^,]+)/.exec(signature)?.[1] || "";
  const received = /(?:^|,)v1=([a-f\d]+)/i.exec(signature)?.[1] || "";
  if (!secret || !requestId || !timestamp || !received || !dataId) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  const seconds = Number(timestamp) > 1e11 ? Number(timestamp) / 1000 : Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now()/1000 - seconds) > 3600) return false;
  const signed = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name:"HMAC",hash:"SHA-256" },false,["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(signed)));
  const expected = Array.from(bytes).map(v=>v.toString(16).padStart(2,"0")).join("");
  if (received.length !== expected.length) return false;
  let mismatch = 0;
  for (let i=0;i<received.length;i++) mismatch |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method Not Allowed",{status:405});
  try {
    const url = new URL(req.url);
    const payload = await req.json();
    const id = String(url.searchParams.get("data.id") || payload?.data?.id || "");
    const type = String(url.searchParams.get("type") || payload?.type || "");
    if (type !== "payment" || !/^\d{5,25}$/.test(id))
      return new Response("ignored",{status:200});
    if (!await verifySignature(req, id)) return new Response("unauthorized",{status:401});
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const collectorId = Deno.env.get("MERCADO_PAGO_COLLECTOR_ID");
    if (!accessToken || !collectorId) return new Response("not configured",{status:503});
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers:{Authorization:`Bearer ${accessToken}`,Accept:"application/json"},
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) return new Response("gateway lookup failed",{status:503});
    const payment = await response.json();
    if (String(payment.id) !== id || String(payment.collector_id) !== String(collectorId)
      || payment.currency_id !== "BRL") return new Response("payment mismatch",{status:403});
    const orderId = String(payment.external_reference || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return new Response("external reference invalid",{status:400});
    const status = String(payment.status || "");
    const amount = Number(payment.transaction_amount);
    if (!Number.isFinite(amount) || amount < 0) return new Response("amount invalid",{status:400});
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth:{persistSession:false},
    });
    const { data: lines, error: linesError } = await admin.from("artvideo_store_order_items")
      .select("id").eq("order_id", orderId).limit(1);
    if (linesError) return new Response("order lookup failed", { status: 503 });
    const { error } = await admin.rpc(lines?.length ? "artvideo_store_settle_multi_v1" : "artvideo_store_settle_v1", {
      p_order_id:orderId,p_payment_id:id,p_payment_status:status,p_amount:amount,
    });
    if (error) return new Response("order reconciliation pending",{status:503});
    // Avisos automáticos estão pausados. A confirmação do pagamento fica intacta.
    return new Response("ok",{status:200});
  } catch {
    return new Response("temporary error",{status:503});
  }
});
