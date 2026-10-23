import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  CORS, cleanPostalCode, json, loadProduct, pickupOption, safeText, shippingQuotes, validQuantity,
} from "../_shared/artvideo-store.ts";
import { getStorePaymentAdapter,validatePaymentRedirect } from "../_shared/artvideo-payment-providers.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  let orderId = "";
  try {
    const input = await req.json();
    // O site nao recebe acesso administrativo. Apenas um convite aleatorio
    // criado no painel, enviado no corpo e confirmado no servidor, pode
    // liberar UMA criacao de pedido enquanto o publico permanece bloqueado.
    const rawToken=typeof input?.homologation_token==="string"
      ?input.homologation_token.trim().toLowerCase():"";
    const validToken=/^[a-f0-9]{64}$/.test(rawToken);
    const tokenHash=validToken?Array.from(new Uint8Array(
      await crypto.subtle.digest("SHA-256",new TextEncoder().encode(rawToken))
    )).map(n=>n.toString(16).padStart(2,"0")).join(""):"";
    if(input?.action==="bricks_status"){
      // A chave publica somente e divulgada se a modalidade estiver
      // autorizada. Nenhuma credencial privada e retornada.
      const {data:config}=await admin.from("artvideo_store_payment_settings")
        .select("mercado_pago_public_key,environment,provider_key")
        .eq("provider_key","mercado_pago").maybeSingle();
      const publicKey=String(config?.mercado_pago_public_key||
        Deno.env.get("MERCADO_PAGO_PUBLIC_KEY")||"");
      const keyReady=/^(APP_USR|TEST)-[a-zA-Z0-9_-]{12,}$/.test(publicKey)
        && config?.environment==="production";
      const {data:regular}=await admin.rpc("artvideo_store_payment_status_v1");
      let invited=false;
      if(validToken){
        const {data:granted}=await admin.rpc("artvideo_store_homologation_available_v1",{p_token_hash:tokenHash});
        invited=granted===true;
      }
      return json({available:keyReady &&
        invited,
        publicKeyConfigured:keyReady});
    }
    if(input?.action==="homologation_status"){
      if(!validToken) return json({available:false,publicCheckout:false});
      const {data:valid,error}=await admin.rpc("artvideo_store_homologation_available_v1",{
        p_token_hash:tokenHash,
      });
      return json({available:!error && valid===true,publicCheckout:false});
    }
    const {data:paymentStatus,error:statusError}=await admin.rpc("artvideo_store_payment_status_v1");
    const publicAvailable=!statusError && paymentStatus?.available===true;
    let isHomologation=false;
    if(!publicAvailable && validToken){
      const {data:valid,error}=await admin.rpc("artvideo_store_homologation_available_v1",{
        p_token_hash:tokenHash,
      });
      isHomologation=!error && valid===true;
    }
    const providerKey=publicAvailable?String(paymentStatus.provider||""):
      isHomologation?"mercado_pago":"";
    const adapter=getStorePaymentAdapter(providerKey);
    if(!adapter || (!publicAvailable&&!isHomologation)){
      return json({error:"O pagamento online esta desativado. Gere um convite no painel para homologar a compra."},503);
    }
    const {data:paymentSetting,error:settingError}=await admin
      .from("artvideo_store_payment_settings").select("environment,provider_key,enabled,mercado_pago_public_key")
      .eq("provider_key",providerKey).maybeSingle();
    if(settingError || !paymentSetting || (
      isHomologation?(paymentSetting.enabled!==false):
      (paymentSetting.enabled!==true || !["sandbox","production"].includes(paymentSetting.environment))
    )){
      return json({error:"O ambiente de pagamento nao esta configurado para esta operacao."},503);
    }
    const paymentEnvironment=isHomologation?"production":paymentSetting.environment;
    const bricksPrepare=input?.action==="bricks_prepare";
    const brickPublicKey=String(paymentSetting.mercado_pago_public_key||
      Deno.env.get("MERCADO_PAGO_PUBLIC_KEY")||"");
    if(bricksPrepare && (!isHomologation || providerKey!=="mercado_pago" ||
       paymentEnvironment!=="production" ||
       !/^(APP_USR|TEST)-[a-zA-Z0-9_-]{12,}$/.test(brickPublicKey))) {
      return json({error:"O pagamento integrado ainda nao esta configurado. Use o Checkout Pro."},503);
    }
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

    // Os preços enviados pelo navegador servem somente para conferir o
    // valor que o cliente aceitou. O preço cobrado vem exclusivamente do CRM.
    const expectedItems = Array.isArray(input.expected_items) ? input.expected_items : [];
    if (expectedItems.length !== validated.length) {
      return json({ error: "Atualize o carrinho e revise os valores antes de pagar." }, 409);
    }
    const wantedPrices = new Map<string, number>();
    for (const item of expectedItems) {
      const productId = String(item?.product_id || "");
      const cents = Number(item?.unit_price) * 100;
      if (!/^[0-9a-f-]{36}$/i.test(productId) || !Number.isSafeInteger(Math.round(cents))
        || !Number.isFinite(cents) || Math.abs(cents-Math.round(cents)) > 0.001
        || cents <= 0 || wantedPrices.has(productId)) {
        return json({ error: "Os valores do carrinho não são válidos. Atualize a página." }, 409);
      }
      wantedPrices.set(productId, Math.round(cents));
    }
    const wantsPickup = String(input.shipping_service_id) === "pickup";
    const zip = wantsPickup ? "" : cleanPostalCode(input.postal_code);
    const email = safeText(input.buyer_email, 200);
    const name = safeText(input.buyer_name, 150);
    const phone = safeText(input.buyer_phone, 24).replace(/[^\d+]/g, "");
    const address = {
      street: safeText(input.street, 160), number: safeText(input.number, 30),
      complement: safeText(input.complement, 160), district: safeText(input.district, 120),
      city: safeText(input.city, 120), state: safeText(input.state, 2).toUpperCase(),
    };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 3
      || phone.replace(/\D/g, "").length < 10
      || (!wantsPickup && (!Object.values(address).filter((_, i) => i !== 2).every(v => v.length > 0)
        || !/^[A-Z]{2}$/.test(address.state)))) {
      return json({ error: "Confira os dados do comprador e endereço de entrega." }, 400);
    }

    const products = await Promise.all(validated.map(item => loadProduct(admin, item.product_id)));
    let subtotalCents = 0;
    for (let i=0;i<validated.length;i++) {
      const currentPrice = Math.round(Number(products[i].price)*100);
      if (wantedPrices.get(validated[i].product_id)!==currentPrice) {
        return json({ error: "O preço de um produto mudou. Atualize o carrinho e confira o valor antes de pagar." }, 409);
      }
      subtotalCents += currentPrice * validated[i].quantity;
    }
    const pickup = wantsPickup ? await pickupOption(admin) : null;
    const options = wantsPickup ? (pickup ? [pickup] : []) : await shippingQuotes(admin, zip);
    const selected = options.find(q => q.id === String(input.shipping_service_id));

    if (!selected) return json({ error: "O frete selecionado mudou. Calcule novamente antes de pagar." }, 409);
    const expectedFreightCents = Math.round(Number(input.expected_shipping_price)*100);
    const expectedTotalCents = Math.round(Number(input.expected_total)*100);
    const shippingCents = Math.round(Number(selected.price)*100);
    if (!Number.isFinite(expectedFreightCents) || !Number.isFinite(expectedTotalCents)
      || expectedFreightCents !== shippingCents
      || expectedTotalCents !== subtotalCents + shippingCents) {
      return json({ error: "O total do pedido mudou. Revise os valores dos produtos e do frete antes de pagar." }, 409);
    }

    const pickupAddress = wantsPickup && pickup ? {
      street: pickup.street, number: pickup.number, complement: pickup.complement,
      district: pickup.district, city: pickup.city, state: pickup.state,
    } : address;
    const finalZip = wantsPickup && pickup ? pickup.postal_code : zip;
    const buyer = { buyer_name: name, buyer_email: email, buyer_phone: phone,
      postal_code: finalZip, ...pickupAddress, delivery_method: wantsPickup ? "pickup" : "delivery",
      ...(wantsPickup ? { pickup_hours: pickup?.opening_hours, pickup_instructions: pickup?.instructions } : {}) };
    const { data: order, error: orderError } = await admin.rpc(
      isHomologation?"artvideo_store_begin_homologation_multi_v1":"artvideo_store_begin_multi_v1", {
      ...(isHomologation?{p_token_hash:tokenHash}:{}),
      p_items: validated,
      p_shipping_price: selected.price, p_shipping_service_id: selected.id,
      p_shipping_name: `${selected.company} — ${selected.name}`, p_postal_code: finalZip, p_buyer: buyer,
    });
    if (orderError || !order?.id) throw new Error(orderError?.message || "Não foi possível reservar o estoque.");
    orderId = order.id;
    // Se o acompanhamento falhar, nao criar preferencia no provedor:
    // evita checkout real sem um codigo privado recuperavel pelo cliente.
    const {data:trackingToken,error:trackingError}=await admin.rpc("artvideo_store_create_tracking_v1",{p_order_id:orderId});
    if(trackingError || !trackingToken) throw new Error("Não foi possível preparar o acompanhamento da compra.");

    if(bricksPrepare){
      // Pedido gerado com as MESMAS verificacoes de produtos, estoque e frete
      // do Checkout Pro. Nao cria uma cobranca antes do clique no Brick.
      const {error:registrationError}=await admin.rpc("artvideo_store_register_checkout_v1",{
        p_order_id:orderId,p_provider:adapter.providerKey,
        p_checkout_reference:"bricks:"+orderId,
      });
      if(registrationError)throw registrationError;
      return json({
        order_id:orderId,tracking_token:trackingToken,public_key:brickPublicKey,
        amount:Number(order.total),expires_at:order.expires_at,
        payment_provider:providerKey,mode:"bricks",
      });
    }
    const deadline = new Date(Date.now() + 20*60*1000).toISOString();
    const detailUrl = "https://eletronicaartvideo.com.br/acompanhar-pedido";
    const nationalPhone = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (!/^\d{10,11}$/.test(nationalPhone)) {
      throw new Error("Informe um telefone brasileiro válido, com DDD.");
    }
    const hosted = await adapter.createHostedCheckout({
      orderId,
      amountCents:Math.round(Number(order.total)*100),
      currency:"BRL",
      environment:paymentEnvironment,
      items:((order.items||[]) as Array<{product_id:string;title:string;quantity:number;unit_price:number}>).map(item=>({
        productId:item.product_id,description:item.title,
        quantity:item.quantity,unitPriceCents:Math.round(Number(item.unit_price)*100),
      })),
      deliveryCents:shippingCents,
      buyer:{name,email,phone:nationalPhone},
      expiresAt:deadline,
      returnUrls:{
        approved:`${detailUrl}?retorno=aprovado`,
        pending:`${detailUrl}?retorno=pendente`,
        failed:`${detailUrl}?retorno=nao-concluido`,
      },
    });
    const checkoutUrl=validatePaymentRedirect(adapter,hosted.checkoutUrl);
    const {error:checkoutError}=await admin.rpc("artvideo_store_register_checkout_v1",{
      p_order_id:orderId,p_provider:adapter.providerKey,p_checkout_reference:hosted.checkoutReference,
    });
    if(checkoutError) throw checkoutError;

    return json({ checkout_url: checkoutUrl, order_id: orderId, payment_provider:providerKey, tracking_token:trackingToken });
  } catch (error) {
    if (orderId) await admin.rpc("artvideo_store_cancel_v1", { p_order_id: orderId });
    return json({ error: error instanceof Error ? error.message : "Compra temporariamente indisponível. Nenhum valor foi cobrado." }, 400);
  }
});
