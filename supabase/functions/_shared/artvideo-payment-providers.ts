/**
 * Contrato de pagamentos da loja Artvideo.
 *
 * Adicione um adaptador para cada provedor contratado (GetPay, Get Checkout
 * ou outro), sem alterar a regra de negócio de pedidos/estoque/frete.
 *
 * Um adaptador real deve:
 * 1. Consultar credenciais exclusivamente nas variáveis privadas da Edge Function.
 * 2. Criar uma cobrança para o valor do pedido (BRL) e retornar URL/ref.
 * 3. Restringir URLs de redirecionamento aos hosts oficiais do provedor.
 * 4. Validar assinatura do webhook e consultar a transação autenticada antes
 *    de invocar a rotina de conciliação do pedido.
 * 5. Receber homologação antes de integration_ready=true ser aplicado no banco.
 * NUNCA use o link estático da maquininha como confirmação financeira.
 */
export type StorePaymentProviderKey = "mercado_pago" | "getpay_link" | "getnet_checkout" | "custom";
export type StorePaymentLine = {
  productId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
};
export type StorePaymentRequest = {
  orderId: string;
  amountCents: number;
  currency: "BRL";
  environment: "sandbox" | "production";
  items: StorePaymentLine[];
  deliveryCents: number;
  buyer: {
    name: string;
    email: string;
    phone: string;
  };
  expiresAt: string;
  returnUrls: {
    approved: string;
    pending: string;
    failed: string;
  };
};
export type StoreHostedPayment = {
  checkoutUrl: string;
  checkoutReference: string;
};
export type StorePaymentAdapter = {
  providerKey: StorePaymentProviderKey;
  /**
   * Autorização de URL é PARTE da implementação. Não confiar em URLs do cliente
   * nem em hosts arbitrários. Cada conector declara sua própria lista oficial.
   */
  allowedRedirectHosts: readonly string[];
  createHostedCheckout: (request: StorePaymentRequest) => Promise<StoreHostedPayment>;
};


const mercadoPagoAdapter: StorePaymentAdapter = {
  providerKey: "mercado_pago",
  allowedRedirectHosts: [
    "www.mercadopago.com.br", "www.mercadopago.com",
    "sandbox.mercadopago.com.br", "sandbox.mercadopago.com",
  ],
  async createHostedCheckout(order) {
    const sandbox = order.environment === "sandbox";
    const token = Deno.env.get(sandbox ? "MERCADO_PAGO_TEST_ACCESS_TOKEN" : "MERCADO_PAGO_ACCESS_TOKEN");
    if (!token) throw new Error("Credenciais do Mercado Pago ainda não configuradas para este ambiente.");
    if (!order.items.length || !Number.isSafeInteger(order.deliveryCents) || order.deliveryCents < 0
      || order.items.some(i => !i.productId || !i.description.trim() || !Number.isSafeInteger(i.quantity)
        || i.quantity < 1 || !Number.isSafeInteger(i.unitPriceCents) || i.unitPriceCents <= 0)
      || order.items.reduce((sum,i) => sum + i.quantity*i.unitPriceCents,order.deliveryCents) !== order.amountCents) {
      throw new Error("O total do pedido não confere com os itens e o frete.");
    }
    const items = order.items.map(i => ({
      id:i.productId,title:i.description.slice(0,240),currency_id:"BRL",
      quantity:i.quantity,unit_price:i.unitPriceCents/100,
    }));
    if (order.deliveryCents) items.push({
      id:"frete-artvideo",title:"Entrega local",currency_id:"BRL",quantity:1,unit_price:order.deliveryCents/100,
    });
    const apiUrl = Deno.env.get("SUPABASE_URL") || "";
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(apiUrl)) {
      throw new Error("URL segura do servidor não configurada.");
    }
    const names = order.buyer.name.trim().split(/\s+/);
    const phone = order.buyer.phone.replace(/\D/g,"");
    const res = await fetch("https://api.mercadopago.com/checkout/preferences",{
      method:"POST",signal:AbortSignal.timeout(15000),
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","X-Idempotency-Key":order.orderId},
      body:JSON.stringify({
        items,
        payer:{name:names[0],surname:names.slice(1).join(" "),email:order.buyer.email,
          phone:{area_code:phone.slice(0,2),number:phone.slice(2)}},
        external_reference:order.orderId,
        back_urls:{success:order.returnUrls.approved,pending:order.returnUrls.pending,
          failure:order.returnUrls.failed},
        notification_url:apiUrl+"/functions/v1/artvideo-store-webhook",
        auto_return:"approved",statement_descriptor:"ARTVIDEO",
        expires:true,expiration_date_from:new Date().toISOString(),expiration_date_to:order.expiresAt,
      }),
    });
    if (!res.ok) {
      console.error("Mercado Pago preference status",res.status);
      throw new Error("O Mercado Pago não conseguiu iniciar o pagamento. Tente novamente.");
    }
    const preference = await res.json();
    const url = sandbox ? preference.sandbox_init_point : preference.init_point;
    if (typeof preference.id !== "string" || !preference.id || typeof url !== "string" || !url)
      throw new Error("O Mercado Pago não retornou uma preferência de pagamento válida.");
    return {checkoutUrl:url,checkoutReference:preference.id};
  },
};

const installedAdapters: Partial<Record<StorePaymentProviderKey, StorePaymentAdapter>> = {
  mercado_pago: mercadoPagoAdapter,
};

export function getStorePaymentAdapter(key: string): StorePaymentAdapter | null {
  return Object.prototype.hasOwnProperty.call(installedAdapters,key)
    ? installedAdapters[key as StorePaymentProviderKey] ?? null
    : null;
}

export function validatePaymentRedirect(adapter: StorePaymentAdapter,url: string): string {
  const address = new URL(url);
  if (address.protocol !== "https:" || address.username || address.password
    || address.port || !adapter.allowedRedirectHosts.includes(address.hostname)) {
    throw new Error("O provedor não retornou um endereço de pagamento autorizado.");
  }
  return address.toString();
}
