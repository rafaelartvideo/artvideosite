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
export type StorePaymentProviderKey = "getpay_link" | "getnet_checkout" | "custom";
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

/** Nenhum conector possui credenciais/homologação nesta etapa. */
const installedAdapters: Partial<Record<StorePaymentProviderKey, StorePaymentAdapter>> = {};

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
