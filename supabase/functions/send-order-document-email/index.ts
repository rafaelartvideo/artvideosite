import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Usuário não autenticado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("ORDER_DOCUMENT_EMAIL_FROM");

    if (!supabaseUrl || !anonKey) return json({ error: "Supabase não configurado." }, 500);
    if (!resendApiKey || !emailFrom) {
      return json({ error: "Configure RESEND_API_KEY e ORDER_DOCUMENT_EMAIL_FROM na Edge Function." }, 500);
    }

    const { order_id, document_name, document_html } = await request.json();
    if (!order_id || !document_name || !document_html) {
      return json({ error: "Documento incompleto." }, 400);
    }
    if (String(document_html).length > 750_000) {
      return json({ error: "O documento excede o tamanho permitido para envio." }, 413);
    }

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: order, error: orderError } = await client
      .from("service_orders")
      .select("id,os_number,customer:customers(id,full_name,email)")
      .eq("id", order_id)
      .single();

    if (orderError || !order) return json({ error: "OS não encontrada ou sem permissão de acesso." }, 403);

    const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
    const recipient = String(customer?.email || "").trim().toLowerCase();
    if (!recipient) return json({ error: "O cliente não possui e-mail cadastrado." }, 400);

    const subject = `${document_name} — OS ${order.os_number || ""}`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [recipient],
        subject,
        html: String(document_html),
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("[ORDER DOCUMENT EMAIL]", result);
      return json({ error: result?.message || "O provedor recusou o envio do e-mail." }, 502);
    }

    return json({ success: true, recipient, id: result.id });
  } catch (error) {
    console.error("[ORDER DOCUMENT EMAIL]", error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado no envio." }, 500);
  }
});
