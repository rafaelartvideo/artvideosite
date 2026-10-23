import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {CORS} from "../_shared/artvideo-store.ts";

const headers={...CORS,"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trackingPattern=/^[a-f0-9]{64}$/;
const money=(n:unknown)=>Math.round(Number(n)*100);
const MAX_PAYMENT_BODY=12288;

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers});
  if(req.method!=="POST")return reply({error:"Metodo nao autorizado."},405);
  if(Number(req.headers.get("content-length")||0)>MAX_PAYMENT_BODY)
    return reply({error:"Solicitacao muito grande."},413);
  try{
    const input=await req.json();
    const action=String(input?.action||"");
    const orderId=String(input?.order_id||"");
    const tracking=String(input?.tracking_token||"").toLowerCase();
    if(!uuid.test(orderId)||!trackingPattern.test(tracking)
      || !["pay","status"].includes(action))
      return reply({error:"Pedido ou acesso invalido."},400);
    const base=Deno.env.get("SUPABASE_URL")||"";
    const admin=createClient(base,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{
      auth:{persistSession:false},
    });
    // O token aleatorio de 256 bits autentica somente este pedido e nao
    // permite consultar outras compras. Nunca depender de dados do navegador.
    const {data:access,error:accessError}=await admin.from("artvideo_store_tracking_access")
      .select("order_id").eq("order_id",orderId)
      .eq("tracking_token",tracking).maybeSingle();
    if(accessError)return reply({error:"Consulta temporariamente indisponivel."},503);
    if(!access)return reply({error:"Acesso ao pedido nao autorizado."},403);
    const {data:order,error:orderError}=await admin.from("artvideo_store_orders")
      .select("id,status,organization_id,buyer,shipping_price,expires_at,payment_provider,payment_environment,preference_id,payment_id")
      .eq("id",orderId).maybeSingle();
    if(orderError||!order)return reply({error:"Pedido indisponivel."},503);
    if(order.payment_provider!=="mercado_pago"||order.payment_environment!=="production"
      ||order.preference_id!=="bricks:"+orderId)
      return reply({error:"Este pedido nao utiliza pagamento integrado."},403);
    const {data:lines,error:linesError}=await admin.from("artvideo_store_order_items")
      .select("unit_price,quantity").eq("order_id",orderId).limit(15);
    if(linesError||!lines?.length)return reply({error:"Itens do pedido indisponiveis."},503);
    const totalCents=lines.reduce((sum,line)=>
      sum+money(line.unit_price)*Number(line.quantity),money(order.shipping_price));
    const amount=totalCents/100;
    if(!Number.isSafeInteger(totalCents)||totalCents<100||totalCents>25000000)
      return reply({error:"Valor do pedido nao autorizado para esta modalidade."},403);
    const token=Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")||"";
    const collector=Deno.env.get("MERCADO_PAGO_COLLECTOR_ID")||"";
    if(!token||!/^\d{5,20}$/.test(collector))
      return reply({error:"Provedor indisponivel."},503);
    const gatewayHeaders={Authorization:"Bearer "+token};
    const getPayment=async(id:string)=>{
      if(!/^\d{5,25}$/.test(id))return null;
      const response=await fetch("https://api.mercadopago.com/v1/payments/"+id,{
        headers:gatewayHeaders,signal:AbortSignal.timeout(12000),
      });
      if(!response.ok)return null;
      return await response.json();
    };
    const verifyPayment=(payment:any)=>{
      const paidAmount=money(payment?.transaction_amount);
      return String(payment?.id||"").match(/^\d{5,25}$/)
        &&String(payment?.collector_id)===collector
        &&payment?.live_mode===true&&payment?.currency_id==="BRL"
        &&String(payment?.external_reference)===orderId
        &&paidAmount===totalCents;
    };
    const mapResponse=(payment:any)=>{
      const pix=payment?.payment_method_id==="pix"?payment?.point_of_interaction?.transaction_data:null;
      const ticket=payment?.payment_method_id==="bolbradesco"?payment?.transaction_details:null;
      const link=String(ticket?.external_resource_url||"");
      let ticketUrl:string|null=null;
      if(link){
        try{
          const u=new URL(link);
          if(u.protocol==="https:"&&/^(?:[a-z0-9-]+\.)*(?:mercadopago\.com|mercadopago\.com\.br|mercadolibre\.com\.br)$/.test(u.hostname))
            ticketUrl=u.href;
        }catch{/* enderecos externos nao validados nunca retornam */}
      }
      return {orderId,status:String(payment.status||"pending"),
        statusDetail:String(payment.status_detail||"").slice(0,100),
        paymentId:String(payment.id||""),
        qrCode:typeof pix?.qr_code==="string"?pix.qr_code.slice(0,5000):null,
        qrCodeBase64:typeof pix?.qr_code_base64==="string"?
          pix.qr_code_base64.slice(0,300000):null,
        ticketUrl,trackingUrl:"/acompanhar-pedido#c="+tracking};
    };
    const reconcile=async(payment:any)=>{
      const state=String(payment?.status||"");
      const status=state==="approved"?"approved":
        ["rejected","cancelled","refunded","charged_back"].includes(state)?state:null;
      if(status){
        const {error}=await admin.rpc("artvideo_store_settle_multi_v1",{
          p_order_id:orderId,p_payment_id:String(payment.id),
          p_payment_status:status,p_amount:amount,
        });
        if(error){
          console.error("Bricks DB reconciliation failed",error.code||"unknown");
          return false;
        }
      }
      return true;
    };
    const {data:existing,error:attemptError}=await admin
      .from("artvideo_store_brick_payment_attempts")
      .select("idempotency_key,payment_id,payment_status")
      .eq("order_id",orderId).maybeSingle();
    if(attemptError)return reply({error:"Nao foi possivel verificar a tentativa."},503);
    if(action==="status"){
      if(!existing?.payment_id)return reply({
        orderId,status:order.status==="paid"?"approved":"not_started",paymentId:null,
      });
      const payment=await getPayment(String(existing.payment_id));
      if(!payment||!verifyPayment(payment))return reply({error:"Confirmacao em processamento. Consulte novamente."},503);
      if(!await reconcile(payment))return reply({error:"Pagamento recebido, conciliacao pendente."},503);
      return reply(mapResponse(payment));
    }
    if(!["awaiting_payment","paid","manual_review"].includes(order.status))
      return reply({error:"Este pedido nao aceita nova tentativa de pagamento."},409);
    if(order.status!=="awaiting_payment" && !existing?.payment_id)
      return reply({error:"Pedido ja processado. Consulte o acompanhamento."},409);
    if(!existing && new Date(order.expires_at).getTime()<=Date.now())
      return reply({error:"A reserva do pedido expirou. Inicie uma nova compra."},409);
    if(existing?.payment_id){
      const payment=await getPayment(String(existing.payment_id));
      if(!payment||!verifyPayment(payment))return reply({error:"Pagamento ja iniciado. Aguarde a confirmacao."},409);
      if(!await reconcile(payment))return reply({error:"Conciliacao pendente."},503);
      return reply(mapResponse(payment));
    }
    const form=input?.form_data;
    if(!form||typeof form!=="object"||Array.isArray(form))
      return reply({error:"Formulario de pagamento invalido."},400);
    const paymentMethod=String(form.payment_method_id||"");
    if(!/^[a-z0-9_]{2,40}$/.test(paymentMethod))
      return reply({error:"Meio de pagamento invalido."},400);
    const cardToken=String(form.token||"");
    const methodWithoutCard=paymentMethod==="pix"||paymentMethod==="bolbradesco";
    if(!methodWithoutCard && (cardToken.length<20||cardToken.length>250))
      return reply({error:"Token do cartao invalido."},400);
    const installments=methodWithoutCard?1:Number(form.installments||1);
    if(!Number.isInteger(installments)||installments<1||installments>18)
      return reply({error:"Parcelas invalidas."},400);
    const identity=form?.payer?.identification;
    const idType=String(identity?.type||"").toUpperCase();
    const idNumber=String(identity?.number||"").replace(/\D/g,"");
    if(!["CPF","CNPJ"].includes(idType)||
      (idType==="CPF"&&idNumber.length!==11)||(idType==="CNPJ"&&idNumber.length!==14))
      return reply({error:paymentMethod==="pix"
        ?"Informe o CPF ou CNPJ do pagador para gerar o Pix."
        :"Confira o documento CPF/CNPJ informado no formulario do cartao."},400);
    const buyer=order.buyer&&typeof order.buyer==="object"?order.buyer:{};
    const payerEmail=String(buyer.buyer_email||"").trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payerEmail))
      return reply({error:"Email de compra invalido."},400);
    const idempotencyKey="bricks-"+orderId;
    const {error:insertError}=await admin.from("artvideo_store_brick_payment_attempts")
      .upsert({order_id:orderId,idempotency_key:idempotencyKey},
       {onConflict:"order_id",ignoreDuplicates:true});
    if(insertError)return reply({error:"Nao foi possivel iniciar a tentativa."},503);
    const baseUrl=Deno.env.get("SUPABASE_URL")||"";
    const payload:any={
      transaction_amount:amount,currency_id:"BRL",
      description:"Compra online Eletronica Artvideo",external_reference:orderId,
      payment_method_id:paymentMethod,installments,
      notification_url:baseUrl+"/functions/v1/artvideo-store-webhook",
      payer:{email:payerEmail,identification:{type:idType,number:idNumber}},
    };
    if(!methodWithoutCard)payload.token=cardToken;
    if(form.issuer_id!==undefined && /^[0-9]{1,15}$/.test(String(form.issuer_id)))
      payload.issuer_id=Number(form.issuer_id);
    // Forma de pagamento selecionada pelo cliente nao define valor, conta
    // recebedora, pedido ou redirect. Tudo vem do servidor.
    const response=await fetch("https://api.mercadopago.com/v1/payments",{
      method:"POST",signal:AbortSignal.timeout(20000),
      headers:{...gatewayHeaders,"Content-Type":"application/json",
        "X-Idempotency-Key":orderId},
      body:JSON.stringify(payload),
    });
    if(!response.ok){
      console.warn("Artvideo Bricks Payment API status",response.status);
      return reply({error:response.status>=500?
        "O provedor esta temporariamente indisponivel. Confira o pedido antes de repetir.":
        "O pagamento nao foi autorizado. Consulte o acompanhamento do pedido."},response.status>=500?503:422);
    }
    const created=await response.json();
    const paymentId=String(created?.id||"");
    if(!/^\d{5,25}$/.test(paymentId))
      return reply({error:"Pagamento iniciado, aguarde a conciliacao."},503);
    const payment=await getPayment(paymentId);
    if(!payment||!verifyPayment(payment))
      return reply({error:"Pagamento iniciado, validacao pendente. Consulte seu pedido."},503);
    const {error:saveError}=await admin.from("artvideo_store_brick_payment_attempts")
      .update({payment_id:paymentId,payment_status:String(payment.status),
        updated_at:new Date().toISOString()})
      .eq("order_id",orderId);
    if(saveError)return reply({error:"Pagamento recebido, registro em conciliacao."},503);
    if(!await reconcile(payment))
      return reply({error:"Pagamento recebido. Aguardando conciliacao."},503);
    return reply(mapResponse(payment));
  }catch(error){
    console.error("Artvideo Bricks payment processing error",
      error instanceof Error?error.name:"unknown");
    return reply({error:"Nao foi possivel confirmar o pagamento. Consulte seu pedido antes de tentar novamente."},503);
  }
});
