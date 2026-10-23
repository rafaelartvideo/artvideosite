import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Endpoint exclusivamente para eventos assinados do Mercado Pago.
// Não aceita status/valores enviados pelo navegador e nunca libera estoque
// antes de consultar o pagamento real no gateway.
async function verifySignature(req: Request, dataId: string, secret: string): Promise<boolean> {
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const timestamp = /(?:^|,)\s*ts\s*=\s*([0-9]+)/.exec(signature)?.[1] || "";
  const received = /(?:^|,)\s*v1\s*=\s*([a-f\d]+)/i.exec(signature)?.[1] || "";
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

    const configs=[
      {environment:"sandbox",secret:Deno.env.get("MERCADO_PAGO_TEST_WEBHOOK_SECRET")||"",
       token:Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN")||"",
       collector:Deno.env.get("MERCADO_PAGO_TEST_COLLECTOR_ID")||""},
      {environment:"production",secret:Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")||"",
       token:Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")||"",
       collector:Deno.env.get("MERCADO_PAGO_COLLECTOR_ID")||""},
    ] as const;
    // A assinatura e o ambiente devem coincidir. Uma mesma chave pode ser
    // cadastrada em teste e produção; jamais escolher por ordem do array.
    // A API de pagamentos é consultada depois para comprovar live_mode.
    const signatures=await Promise.all(configs.map(async candidate=>({
      environment:candidate.environment,
      valid:!!candidate.secret && await verifySignature(req,id,candidate.secret),
    })));
    const signed=signatures.filter(candidate=>candidate.valid);
    if(!signed.length) {
      console.warn("Artvideo Mercado Pago webhook signature rejected");
      return new Response("unauthorized",{status:401});
    }
    const notifiedMode=payload?.live_mode;
    if(typeof notifiedMode!=="boolean") {
      console.warn("Artvideo Mercado Pago webhook environment missing");
      return new Response("event environment missing",{status:400});
    }
    const desiredEnvironment=notifiedMode?"production":"sandbox";
    const config=configs.find(candidate=>candidate.environment===desiredEnvironment
      && signed.some(valid=>valid.environment===candidate.environment));
    if(!config) {
      console.warn("Artvideo Mercado Pago webhook signed for different environment",desiredEnvironment);
      return new Response("signature environment mismatch",{status:403});
    }
    console.info("Artvideo Mercado Pago signed webhook accepted",config.environment);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
      auth:{persistSession:false},
    });

    // O painel do Mercado Pago pode enviar uma simulação live_mode=false
    // mesmo quando a URL selecionada é a de produção. O ID reservado não
    // existe na API /v1/payments e NUNCA deve ser consultado como uma compra.
    // É obrigatório validar o HMAC primeiro, em qualquer ambiente.
    const signedSimulation=id==="999999999999999"
      && payload?.action==="payment.updated"
      && payload?.live_mode===false
      && String(payload?.data?.id||"")===id;
    if(signedSimulation){
      const {error:auditError}=await admin.from("artvideo_store_webhook_checks").insert({
        environment:config.environment,event_type:"payment",resource_id:id,
        simulated:true,
      });
      if(auditError){
        console.error("Mercado Pago signed simulation audit failed",auditError.code||"unknown");
        return new Response("signed simulation audit failed",{status:503});
      }
      // 200 confirma apenas entrega + assinatura + log.
      // Em sandbox, não homologa o segredo de produção.
      console.info("Artvideo Mercado Pago simulator authenticated",config.environment);
      return new Response("signed simulation accepted",{status:200});
    }
    if(!config.token || !config.collector) return new Response("not configured",{status:503});
    if(config.environment==="production"){
      const {error:auditError}=await admin.from("artvideo_store_webhook_checks").insert({
        environment:"production",event_type:"payment",resource_id:id,simulated:false,
      });
      if(auditError)console.error("Mercado Pago signed webhook audit failed",auditError.code||"unknown");
    }
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers:{Authorization:`Bearer ${config.token}`,Accept:"application/json"},
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.error("Artvideo Mercado Pago payment lookup failed",config.environment,response.status);
      return new Response("gateway lookup failed",{status:503});
    }
    const payment = await response.json();
    if (String(payment.id) !== id || String(payment.collector_id) !== config.collector
      || payment.currency_id !== "BRL"
      || payment.live_mode !== (config.environment === "production")) return new Response("payment mismatch",{status:403});
    const orderId = String(payment.external_reference || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return new Response("external reference invalid",{status:400});
    const status = String(payment.status || "");
    const amount = Number(payment.transaction_amount);
    if (!Number.isFinite(amount) || amount < 0) return new Response("amount invalid",{status:400});
    // Compatibilidade exclusivamente com transações históricas deste provedor.
    // O endpoint legado nunca pode confirmar um pedido criado pela Getnet
    // ou por qualquer outro conector selecionado futuramente.
    // Testes de sandbox usam tabela isolada e nunca movimentam o estoque real.
    if(config.environment==="sandbox"){
      const {data:labRun,error:labError}=await admin.from("artvideo_payment_test_runs")
        .select("id,amount").eq("id",orderId).maybeSingle();
      if(labError) return new Response("lab lookup failed",{status:503});
      if(labRun){
        if(Math.abs(Number(labRun.amount)-amount)>0.009)
          return new Response("test amount mismatch",{status:403});
        const {error:settleError}=await admin.rpc("artvideo_payment_lab_settle_v1",{
          p_test_id:orderId,p_payment_id:id,p_payment_status:status,p_amount:amount,
        });
        if(settleError)return new Response("lab reconciliation pending",{status:503});
        return new Response("ok",{status:200});
      }
    }
    if(config.environment==="production"){
      // Transação REAL isolada de homologação: sem pedido/estoque/financeiro.
      // Recebida somente depois de HMAC, consulta do pagamento e conferência
      // de vendedor, ambiente, BRL, referência e valor.
      const {data:live,error:liveError}=await admin.from("artvideo_payment_live_checks")
        .select("id,amount").eq("id",orderId).maybeSingle();
      if(liveError)return new Response("isolated payment lookup failed",{status:503});
      if(live){
        if(Math.abs(Number(live.amount)-amount)>0.009)
          return new Response("isolated payment amount mismatch",{status:403});
        const {error:settleError}=await admin.rpc("artvideo_payment_live_check_settle_v1",{
          p_check_id:orderId,p_payment_id:id,p_payment_status:status,
          p_amount:amount,p_from_signed_webhook:true,
        });
        if(settleError)return new Response("isolated payment reconciliation pending",{status:503});
        console.info("Artvideo real payment check reconciled from signed webhook");
        return new Response("ok",{status:200});
      }
    }
    const {data:order,error:orderError}=await admin.from("artvideo_store_orders")
      .select("payment_provider,payment_environment").eq("id",orderId).maybeSingle();
    if(orderError) return new Response("order lookup failed",{status:503});
    if(!order || order.payment_provider!=="mercado_pago"
      || (order.payment_environment || "production") !== config.environment) {
      return new Response("provider mismatch",{status:403});
    }
    const { data: lines, error: linesError } = await admin.from("artvideo_store_order_items")
      .select("id").eq("order_id", orderId).limit(1);
    if (linesError) return new Response("order lookup failed", { status: 503 });
    const { error } = await admin.rpc(lines?.length ? "artvideo_store_settle_multi_v1" : "artvideo_store_settle_v1", {
      p_order_id:orderId,p_payment_id:id,p_payment_status:status,p_amount:amount,
    });
    if (error) return new Response("order reconciliation pending",{status:503});
    // Avisos automáticos estão pausados. A confirmação do pagamento fica intacta.
    return new Response("ok",{status:200});
  } catch (error) {
    console.error("Artvideo Mercado Pago webhook processing failure",
      error instanceof Error ? error.name : "unknown");
    return new Response("temporary error",{status:503});
  }
});
