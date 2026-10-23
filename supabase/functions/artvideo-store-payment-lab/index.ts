import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { CORS } from "../_shared/artvideo-store.ts";

const allowedOrigins=new Set([
  "https://unionworld.com.br","https://www.unionworld.com.br",
  "https://eletronicaartvideo.com.br","https://www.eletronicaartvideo.com.br",
]);
function safeId(value: unknown) {return typeof value==="string" && /^[0-9a-f-]{36}$/i.test(value);}
const allowedHosts = new Set([
  "www.mercadopago.com.br","www.mercadopago.com",
  "sandbox.mercadopago.com.br","sandbox.mercadopago.com",
]);
function validRedirect(value: unknown): value is string {
  try {
    const url = new URL(String(value));
    return url.protocol==="https:" && !url.port && !url.username && !url.password && allowedHosts.has(url.hostname);
  } catch {return false;}
}

Deno.serve(async (req:Request) => {
  const origin=req.headers.get("origin")||"";
  const headers={...CORS,
    "Access-Control-Allow-Origin":allowedOrigins.has(origin)?origin:"https://unionworld.com.br",
    "Cache-Control":"no-store","Vary":"Origin",
    "Content-Type":"application/json; charset=utf-8"};
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==="OPTIONS") return new Response(null,{headers});
  if(req.method!=="POST") return reply({error:"Método não permitido."},405);
  if(Number(req.headers.get("content-length")||0)>2048) return reply({error:"Solicitação inválida."},413);
  const base=Deno.env.get("SUPABASE_URL")||"";
  const key=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const secretKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!base||!key||!secretKey) return reply({error:"Servidor não configurado."},503);
  const authorization=req.headers.get("authorization")||"";
  const token=/^Bearer\s+(\S+)$/i.exec(authorization)?.[1]||"";
  if(!token) return reply({error:"Entre no painel para testar o pagamento."},401);
  try {
    const userClient=createClient(base,key,{
      auth:{persistSession:false,autoRefreshToken:false},
      global:{headers:{Authorization:"Bearer "+token}},
    });
    const {data:userData,error:userError}=await userClient.auth.getUser(token);
    if(userError||!userData?.user) return reply({error:"Sessão inválida."},401);
    const {data:authorized,error:authorizedError}=await userClient.rpc("artvideo_payment_lab_authorized_v1");
    if(authorizedError||authorized!==true) return reply({error:"Sem permissão para testar pagamentos."},403);
    const admin=createClient(base,secretKey,{auth:{persistSession:false}});
    let input:Record<string,unknown>;
    try{input=await req.json();}catch{return reply({error:"Solicitação inválida."},400);}
    const action=String(input?.action||"");
    // Retoma testes do usuário mesmo após atualizar ou fechar a página.
    // Apenas IDs, status e metadados; nunca revela tokens ou dados de outros usuários.
    if(action==="production_latest"){
      const {data,error}=await admin.from("artvideo_payment_live_checks")
        .select("id,status,amount,payment_id,checkout_url,webhook_received_at,legacy_notification_received_at,created_at,updated_at")
        .eq("created_by",userData.user.id).order("created_at",{ascending:false}).limit(8);
      if(error)return reply({error:"Não foi possível recuperar as validações de produção."},503);
      const runs=(data||[]).map(t=>({
        id:t.id,status:t.status,amount:Number(t.amount),paymentId:t.payment_id||null,
        webhookReceivedAt:t.webhook_received_at||null,
        legacyNotificationAt:t.legacy_notification_received_at||null,
        checkoutUrl:validRedirect(t.checkout_url)?t.checkout_url:null,
        createdAt:t.created_at,updatedAt:t.updated_at,
      }));
      return reply({tests:runs,test:runs[0]||null});
    }
    if(action==="production_create"){
      // Nunca gera cobrança de produção durante diagnóstico/status.
      // A UI exige confirmação adicional antes de enviar esta ação.
      if(input.confirm_real_payment!==true)
        return reply({error:"Confirme explicitamente a criação do link REAL de R$ 1,00."},400);
      const accessToken=Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")||"";
      const collector=Deno.env.get("MERCADO_PAGO_COLLECTOR_ID")||"";
      const webhookSecret=Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")||"";
      const testToken=Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN")||"";
      if(!accessToken||!webhookSecret||!/^\d{5,20}$/.test(collector)
        ||(testToken&&accessToken===testToken))
        return reply({error:"Credenciais de produção ainda não foram validadas."},503);
      let validAccount=false;
      try{
        const response=await fetch("https://api.mercadopago.com/users/me",{
          headers:{Authorization:"Bearer "+accessToken,Accept:"application/json"},
          signal:AbortSignal.timeout(12000),
        });
        if(response.ok)validAccount=String((await response.json()).id||"")===collector;
      }catch{}
      if(!validAccount)return reply({error:"Conta de produção não confirmada pela API."},403);
      const since10=new Date(Date.now()-10*60*1000).toISOString();
      const sinceDay=new Date(Date.now()-24*60*60*1000).toISOString();
      const {data:recent,error:limitError}=await admin.from("artvideo_payment_live_checks")
        .select("id,created_at").eq("created_by",userData.user.id)
        .gte("created_at",sinceDay).order("created_at",{ascending:false}).limit(3);
      if(limitError)return reply({error:"Não foi possível verificar os limites de segurança."},503);
      if((recent||[]).length>=3)
        return reply({error:"Limite de três validações reais em 24 horas atingido."},429);
      if((recent||[]).some(r=>r.created_at>=since10))
        return reply({error:"Para evitar cobranças repetidas, aguarde 10 minutos antes de gerar outro link real."},429);
      const {data:check,error:checkError}=await admin.from("artvideo_payment_live_checks")
        .insert({created_by:userData.user.id}).select("id,created_at").single();
      if(checkError||!check?.id)return reply({error:"Não foi possível registrar a validação isolada."},503);
      const expires=new Date(Date.now()+30*60*1000);
      const pref={
        items:[{id:"artvideo-producao-validacao",title:"Validacao de integracao Artvideo - valor real",
          currency_id:"BRL",quantity:1,unit_price:1}],
        external_reference:check.id,
        notification_url:base+"/functions/v1/artvideo-store-webhook",
        expires:true,expiration_date_from:new Date().toISOString(),
        expiration_date_to:expires.toISOString(),
      };
      try{
        const res=await fetch("https://api.mercadopago.com/checkout/preferences",{
          method:"POST",signal:AbortSignal.timeout(15000),
          headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json",
            "X-Idempotency-Key":check.id},
          body:JSON.stringify(pref),
        });
        if(!res.ok){
          console.error("Artvideo live check preference creation failed",res.status);
          throw new Error("O Mercado Pago não conseguiu criar a validação real (HTTP "+res.status+").");
        }
        const data=await res.json();
        if(typeof data?.id!=="string"||!data.id||!validRedirect(data.init_point)){
          throw new Error("A API não forneceu link oficial válido para a conta real.");
        }
        const {error:updateError}=await admin.from("artvideo_payment_live_checks")
          .update({status:"awaiting_payment",preference_id:data.id,
            checkout_url:data.init_point,updated_at:new Date().toISOString()})
          .eq("id",check.id);
        if(updateError)throw new Error("Não foi possível guardar a referência da validação real.");
        return reply({
          environment:"production",realMoney:true,
          checkoutUrl:data.init_point,
          test:{id:check.id,status:"awaiting_payment",amount:1,createdAt:check.created_at,
            webhookReceivedAt:null},
          message:"Link REAL de R$ 1,00 criado. Só ocorrerá cobrança se o comprador concluir o pagamento.",
        });
      }catch(error){
        await admin.from("artvideo_payment_live_checks").update({status:"error"}).eq("id",check.id);
        return reply({error:error instanceof Error?error.message:"Falha ao preparar a validação real."},502);
      }
    }
    if(action==="production_status"){
      if(!safeId(input.test_id))return reply({error:"Identificador inválido."},400);
      const {data:check,error:checkError}=await admin.from("artvideo_payment_live_checks")
        .select("id,status,amount,payment_id,preference_id,checkout_url,webhook_received_at,legacy_notification_received_at,created_at,updated_at")
        .eq("id",input.test_id).eq("created_by",userData.user.id).maybeSingle();
      if(checkError)return reply({error:"Não foi possível consultar a validação."},503);
      if(!check)return reply({error:"Validação não encontrada."},404);
      let status=String(check.status),paymentId=String(check.payment_id||"");
      let message=status==="approved"?"Pagamento real confirmado pelo Mercado Pago.":"Nenhum pagamento real confirmado para esta validação.";
      let source="database";
      if(status!=="approved"&&status!=="refunded"&&status!=="charged_back"){
        const accessToken=Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")||"";
        const collector=Deno.env.get("MERCADO_PAGO_COLLECTOR_ID")||"";
        if(!accessToken||!collector)return reply({error:"Credenciais de produção ausentes."},503);
        const mpHeaders={Authorization:"Bearer "+accessToken,Accept:"application/json"};
        const getMp=async(url:URL):Promise<Record<string,unknown>>=>{
          const res=await fetch(url,{headers:mpHeaders,signal:AbortSignal.timeout(12000)});
          if(!res.ok)throw new Error("HTTP "+res.status);
          return await res.json() as Record<string,unknown>;
        };
        const searchUrl=new URL("https://api.mercadopago.com/v1/payments/search");
        searchUrl.searchParams.set("external_reference",check.id);
        searchUrl.searchParams.set("sort","date_created");
        searchUrl.searchParams.set("criteria","desc");
        searchUrl.searchParams.set("limit","20");
        let all:Record<string,unknown>[]=[];
        let anyLookup=false;
        try{
          const search=await getMp(searchUrl);
          all=Array.isArray(search.results)?search.results as Record<string,unknown>[]:[];
          anyLookup=true;source="payment_search";
        }catch(e){console.warn("Artvideo production check search unavailable",e instanceof Error?e.message:"error");}
        if(!all.length&&typeof check.preference_id==="string"&&check.preference_id){
          try{
            const url=new URL("https://api.mercadopago.com/merchant_orders/search");
            url.searchParams.set("preference_id",check.preference_id);
            url.searchParams.set("limit","20");
            const orders=await getMp(url);
            const ids=new Set<string>();
            for(const order of Array.isArray(orders.elements)?orders.elements as Record<string,unknown>[]:[]){
              if(String(order.preference_id||"")!==check.preference_id
                || String(order.external_reference||"")!==check.id)continue;
              for(const pay of Array.isArray(order.payments)?order.payments as Record<string,unknown>[]:[]){
                if(/^\d{5,25}$/.test(String(pay.id||"")))ids.add(String(pay.id));
              }
            }
            for(const id of [...ids].slice(0,10)){
              try{all.push(await getMp(new URL("https://api.mercadopago.com/v1/payments/"+id)));}
              catch(e){console.warn("Artvideo production payment lookup failed",e instanceof Error?e.message:"error");}
            }
            anyLookup=true;source="merchant_orders";
          }catch(e){console.warn("Artvideo production merchant order search failed",e instanceof Error?e.message:"error");}
        }
        const allowed=["approved","pending","in_process","rejected","cancelled","refunded","charged_back"];
        const valid=all.filter(p=>{
          const amount=Number(p.transaction_amount);
          const time=Date.parse(String(p.date_created||""));
          return /^\d{5,25}$/.test(String(p.id||""))
            && String(p.external_reference||"")===check.id
            && String(p.collector_id||"")===collector
            && p.currency_id==="BRL" && p.live_mode===true
            && allowed.includes(String(p.status||""))
            && Number.isFinite(amount)&&Math.abs(amount-Number(check.amount))<0.009
            && Number.isFinite(time)&&time>=Date.parse(check.created_at)-120000;
        });
        const candidate=valid.find(p=>p.status==="approved")||valid[0]||null;
        if(candidate){
          const id=String(candidate.id),next=String(candidate.status);
          const {data:recorded,error:rpcError}=await admin.rpc("artvideo_payment_live_check_settle_v1",{
            p_check_id:check.id,p_payment_id:id,p_payment_status:next,
            p_amount:Number(candidate.transaction_amount),p_from_signed_webhook:false,
          });
          if(rpcError)return reply({error:"Pagamento encontrado, mas sua confirmação não foi registrada."},503);
          status=String(recorded||next);paymentId=id;
          message=status==="approved"?"Pagamento real de R$ 1,00 confirmado pela API do Mercado Pago.":
            "Transação real localizada no Mercado Pago. Situação: "+status+".";
        }else if(!anyLookup)return reply({error:"Não foi possível consultar o Mercado Pago agora."},503);
        else if(all.length)message="A API retornou transações, mas nenhuma corresponde ao ambiente, vendedor, valor e referência. Nenhum pagamento foi confirmado.";
        else message="Nenhuma transação real encontrada. A cobrança só acontece depois que o comprador conclui o checkout.";
      }
      // Retoma a data do webhook assinada mesmo que tenha chegado enquanto consultávamos.
      const {data:fresh,error:freshError}=await admin.from("artvideo_payment_live_checks")
        .select("status,payment_id,webhook_received_at,legacy_notification_received_at,updated_at").eq("id",check.id).maybeSingle();
      if(freshError)return reply({error:"Não foi possível atualizar o estado do webhook."},503);
      return reply({environment:"production",realMoney:true,
        test:{id:check.id,status:fresh?.status||status,
          paymentId:fresh?.payment_id||paymentId||null,amount:Number(check.amount),
          createdAt:check.created_at,updatedAt:fresh?.updated_at||check.updated_at,
          webhookReceivedAt:fresh?.webhook_received_at||null,
          legacyNotificationAt:fresh?.legacy_notification_received_at||null,
          checkoutUrl:validRedirect(check.checkout_url)?check.checkout_url:null},
        source,message});
    }

    if(action==="production_diagnose"){
      // Verificação somente de leitura; nenhuma preferência real é criada.
      const accessToken=Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")||"";
      const collector=Deno.env.get("MERCADO_PAGO_COLLECTOR_ID")||"";
      const webhookSecret=Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")||"";
      const presence={
        token:accessToken.trim().length>0,
        seller:/^\d{5,20}$/.test(collector.trim()),
        webhook:webhookSecret.trim().length>0,
      };
      const allPresent=presence.token&&presence.seller&&presence.webhook;
      if(!allPresent){
        return reply({
          environment:"production",credentials:presence,
          accountVerified:false,configurationValid:false,
          webhookValidated:false,livePaymentValidated:false,
          message:"Cadastre os três segredos de produção no Supabase antes de prosseguir.",
        });
      }
      if(accessToken===(Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN")||"")){
        return reply({
          environment:"production",credentials:presence,
          accountVerified:false,configurationValid:false,
          webhookValidated:false,livePaymentValidated:false,
          message:"O Access Token de produção não pode ser igual ao de teste. Confira as credenciais.",
        });
      }
      try{
        const response=await fetch("https://api.mercadopago.com/users/me",{
          headers:{Authorization:"Bearer "+accessToken,Accept:"application/json"},
          signal:AbortSignal.timeout(12000),
        });
        if(!response.ok){
          return reply({
            environment:"production",credentials:presence,
            accountVerified:false,configurationValid:false,
            webhookValidated:false,livePaymentValidated:false,
            message:response.status===401||response.status===403?
              "Access Token de produção inválido ou sem autorização.":
              "Não foi possível validar o vendedor no Mercado Pago (HTTP "+response.status+").",
          });
        }
        const account=await response.json();
        // User ID é apenas o identificador público da conta titular do token.
        // Ele pode ser mostrado a quem tem a permissão administrativa do site.
        // Nunca devolver Access Token, assinatura ou dados pessoais do vendedor.
        const accountId=String(account?.id||"");
        const match=/^\d{5,20}$/.test(accountId) && accountId===collector.trim();
        let receipt: {received_at:string;simulated:boolean}|null=null;
        let sandboxReceipt: {received_at:string}|null=null;
        if(match){
          const [prodResult,testResult]=await Promise.all([
            admin.from("artvideo_store_webhook_checks")
              .select("received_at,simulated").eq("environment","production")
              .order("received_at",{ascending:false}).limit(1).maybeSingle(),
            admin.from("artvideo_store_webhook_checks")
              .select("received_at").eq("environment","sandbox").eq("simulated",true)
              .order("received_at",{ascending:false}).limit(1).maybeSingle(),
          ]);
          if(prodResult.error||testResult.error){
            console.error("Production webhook diagnostics unavailable");
          }else{
            receipt=prodResult.data;
            sandboxReceipt=testResult.data;
          }
        }
        return reply({
          environment:"production",credentials:presence,
          accountVerified:match,configurationValid:match,
          webhookSecretsSame:webhookSecret===(Deno.env.get("MERCADO_PAGO_TEST_WEBHOOK_SECRET")||""),
          accountUserId:/^\d{5,20}$/.test(accountId)?accountId:null,
          webhookValidated:Boolean(receipt),webhookVerifiedAt:receipt?.received_at||null,
          webhookSimulated:receipt?.simulated===true,
          sandboxWebhookSimulationSeen:!receipt&&Boolean(sandboxReceipt),
          livePaymentValidated:false,
          message:!match?"O User ID de produção não corresponde ao titular do Access Token.":
            receipt?"Credenciais reconhecidas e notificação de produção com assinatura válida recebida. Falta homologar uma transação real controlada.":
            sandboxReceipt?"Simulação recebida, mas assinada com a chave de testes. Verifique a URL e o segredo do modo produção.":
            "Credenciais de produção reconhecidas. Falta simular uma notificação assinada e homologar uma transação real controlada.",
        });
      }catch{
        return reply({
          environment:"production",credentials:presence,
          accountVerified:false,configurationValid:false,
          webhookValidated:false,livePaymentValidated:false,
          message:"Falha temporária ao consultar a conta de produção no Mercado Pago.",
        });
      }
    }

    if(action==="latest"){
      const {data,error}=await admin.from("artvideo_payment_test_runs")
        .select("id,status,amount,payment_id,created_at,updated_at")
        .eq("created_by",userData.user.id)
        .order("created_at",{ascending:false}).limit(10);
      if(error) return reply({error:"Não foi possível recuperar os testes anteriores."},503);
      const tests=(data||[]).map(t=>({
        id:t.id,status:t.status,amount:Number(t.amount),
        paymentId:t.payment_id||null,createdAt:t.created_at,updatedAt:t.updated_at,
      }));
      return reply({tests,test:tests[0]||null});
    }
    if(action==="status"){
      if(!safeId(input.test_id)) return reply({error:"Identificador do teste inválido."},400);
      const {data,error}=await admin.from("artvideo_payment_test_runs")
        .select("id,status,amount,payment_id,preference_id,created_at,updated_at")
        .eq("id",input.test_id).eq("created_by",userData.user.id).maybeSingle();
      if(error) return reply({error:"Não foi possível consultar o teste."},503);
      if(!data) return reply({error:"Teste não encontrado."},404);
      let status=String(data.status),paymentId=String(data.payment_id||"");
      let message="O teste ainda não tem pagamento confirmado.";
      let checked=false;
      let channel="database";
      if(status!=="approved"){
        const testToken=Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN")||"";
        const seller=Deno.env.get("MERCADO_PAGO_TEST_COLLECTOR_ID")||"";
        if(!testToken||!seller)
          return reply({error:"Credenciais de teste ausentes; não é possível conferir o pagamento."},503);
        const mpHeaders={Authorization:"Bearer "+testToken,Accept:"application/json"};
        const fetchMp=async(url:URL):Promise<Record<string,unknown>>=>{
          const response=await fetch(url,{headers:mpHeaders,signal:AbortSignal.timeout(12000)});
          if(!response.ok)throw new Error("HTTP "+response.status);
          return await response.json() as Record<string,unknown>;
        };
        const searchUrl=new URL("https://api.mercadopago.com/v1/payments/search");
        searchUrl.searchParams.set("external_reference",data.id);
        searchUrl.searchParams.set("sort","date_created");
        searchUrl.searchParams.set("criteria","desc");
        searchUrl.searchParams.set("limit","30");
        let payments:Record<string,unknown>[]=[];
        let invalidResults=0;
        try{
          const search=await fetchMp(searchUrl);
          payments=Array.isArray(search.results)?search.results as Record<string,unknown>[]:[];
          checked=true;
          channel="payment_search";
        }catch(error){
          console.warn("Artvideo lab payment search unavailable",error instanceof Error?error.message:"error");
        }
        // Preferências do Checkout Pro também criam merchant orders. Quando a
        // busca por external_reference não devolver a transação, recupera IDs
        // pela preferência conhecida e consulta cada pagamento na API segura.
        if(!payments.length && typeof data.preference_id==="string" && data.preference_id.length>0){
          const ordersUrl=new URL("https://api.mercadopago.com/merchant_orders/search");
          ordersUrl.searchParams.set("preference_id",data.preference_id);
          ordersUrl.searchParams.set("limit","20");
          try{
            const search=await fetchMp(ordersUrl);
            const orders=Array.isArray(search.elements)?search.elements as Record<string,unknown>[]:[];
            const ids=new Set<string>();
            for(const order of orders){
              if(String(order.preference_id||"")!==data.preference_id
                || String(order.external_reference||"")!==data.id)continue;
              const paymentsFromOrder=Array.isArray(order.payments)?order.payments as Record<string,unknown>[]:[];
              for(const payment of paymentsFromOrder){
                const id=String(payment.id||"");
                if(/^\d{5,25}$/.test(id))ids.add(id);
              }
            }
            for(const id of [...ids].slice(0,10)){
              try{
                const payment=await fetchMp(new URL("https://api.mercadopago.com/v1/payments/"+id));
                payments.push(payment);
              }catch(error){
                console.warn("Artvideo lab payment detail unavailable",error instanceof Error?error.message:"error");
              }
            }
            checked=true;
            channel="merchant_orders";
          }catch(error){
            console.warn("Artvideo lab merchant order search unavailable",error instanceof Error?error.message:"error");
          }
        }
        // Never approve based on the return URL or merchant-order status.
        // The authenticated Payment API is the source of truth.
        const allowed=["approved","pending","in_process","rejected","cancelled","refunded","charged_back"];
        const valid=payments.filter(p=>{
          const id=String(p.id||"");
          const amount=Number(p.transaction_amount);
          const date=Date.parse(String(p.date_created||""));
          const good=/^\d{5,25}$/.test(id)
            && String(p.external_reference||"")===data.id
            && String(p.collector_id||"")===seller
            && String(p.currency_id||"")==="BRL"
            && allowed.includes(String(p.status||""))
            && Number.isFinite(amount) && Math.abs(amount-Number(data.amount))<0.009
            && Number.isFinite(date) && date>=Date.parse(data.created_at)-120000;
          if(!good)invalidResults++;
          return good;
        });
        const candidate=valid.find(p=>String(p.status)==="approved")||valid[0]||null;
        if(candidate){
          const next=String(candidate.status);
          const nextId=String(candidate.id);
          const {data:recorded,error:settleError}=await admin.rpc("artvideo_payment_lab_settle_v1",{
            p_test_id:data.id,p_payment_id:nextId,p_payment_status:next,
            p_amount:Number(candidate.transaction_amount),
          });
          if(settleError)return reply({error:"Pagamento encontrado, mas não foi possível registrar a confirmação."},503);
          status=String(recorded||next);
          paymentId=nextId;
          message=status==="approved"?"Pagamento de teste aprovado e confirmado pelo Mercado Pago."
            :"Pagamento encontrado no Mercado Pago. Situação: "+status+".";
        }else if(invalidResults){
          message="A API retornou pagamentos, mas a referência, conta vendedora ou valor não corresponde a este teste. Nenhum pagamento foi confirmado.";
        }else if(checked){
          message="Nenhum pagamento válido foi localizado para esta preferência. Confira se a compra foi concluída com a conta de teste compradora.";
        }else{
          return reply({error:"Não foi possível consultar a API do Mercado Pago. Tente novamente."},503);
        }
      }else{
        message="Pagamento de teste previamente confirmado com validação.";
      }
      return reply({test:{id:data.id,status,paymentId:paymentId||null,
        amount:Number(data.amount),createdAt:data.created_at,
        updatedAt:new Date().toISOString()},
        checked,source:channel,message});
    }

    if(!["diagnose","create"].includes(action)) return reply({error:"Ação não permitida."},400);
    const tokenSecret=Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN")||"";
    const collector=Deno.env.get("MERCADO_PAGO_TEST_COLLECTOR_ID")||"";
    const webhookSecret=Deno.env.get("MERCADO_PAGO_TEST_WEBHOOK_SECRET")||"";
    const presence={token:Boolean(tokenSecret),seller:Boolean(collector),webhook:Boolean(webhookSecret)};
    if(!tokenSecret||!collector||!webhookSecret) {
      return reply({credentials:presence,verified:false,
        message:"Existem credenciais de teste ainda não cadastradas no Supabase."});
    }
    let verified=false;
    let problem="Não foi possível validar as credenciais de teste na API do Mercado Pago.";
    try{
      const res=await fetch("https://api.mercadopago.com/users/me",{
        headers:{Authorization:"Bearer "+tokenSecret,Accept:"application/json"},
        signal:AbortSignal.timeout(12000),
      });
      if(res.ok) {
        const account=await res.json();
        if(String(account?.id||"")===collector) {
          verified=true;problem="";
        } else {
          problem="O User ID do vendedor não corresponde ao Access Token de teste.";
        }
      } else if(res.status===401||res.status===403){
        problem="Access Token de teste inválido ou sem autorização.";
      } else {
        problem="O Mercado Pago não confirmou as credenciais. HTTP "+res.status+".";
      }
    }catch{problem="Falha temporária de comunicação com o Mercado Pago.";}
    if(action==="diagnose"||!verified) return reply({credentials:presence,verified,message:verified?
      "Credenciais de teste reconhecidas. Já é possível criar uma transação isolada.":problem});
    const recent=new Date(Date.now()-90000).toISOString();
    const {data:previous,error:previousError}=await admin.from("artvideo_payment_test_runs")
      .select("id").eq("created_by",userData.user.id).gte("created_at",recent).limit(1);
    if(previousError)return reply({error:"Não foi possível verificar os testes recentes."},503);
    if(previous?.length)return reply({error:"Aguarde antes de iniciar outro teste."},429);
    const {data:run,error:insertError}=await admin.from("artvideo_payment_test_runs")
      .insert({created_by:userData.user.id,organization_id:undefined})
      .select("id").single();
    if(insertError||!run?.id)return reply({error:"Não foi possível preparar um teste isolado."},503);
    const deadline=new Date(Date.now()+30*60*1000);
    const preferencePayload={
      items:[{id:"artvideo-checkout-pro-sandbox",title:"Teste de integracao Artvideo",
        currency_id:"BRL",quantity:1,unit_price:1}],
      external_reference:run.id,
      notification_url:base+"/functions/v1/artvideo-store-webhook",
      expires:true,expiration_date_from:new Date().toISOString(),
      expiration_date_to:deadline.toISOString(),
    };
    try {
      const res=await fetch("https://api.mercadopago.com/checkout/preferences",{
        method:"POST",signal:AbortSignal.timeout(15000),
        headers:{Authorization:"Bearer "+tokenSecret,"Content-Type":"application/json",
          "X-Idempotency-Key":run.id},
        body:JSON.stringify(preferencePayload),
      });
      if(!res.ok) {
        console.error("Artvideo lab preference HTTP",res.status);
        throw new Error("Não foi possível criar o pagamento de teste. Código "+res.status+".");
      }
      const p=await res.json();
      const checkoutUrl=p.sandbox_init_point||"";
      if(typeof p.id!=="string"||!p.id||!validRedirect(checkoutUrl)) {
        throw new Error("O Mercado Pago não retornou um link de teste autorizado.");
      }
      const {error:updateError}=await admin.from("artvideo_payment_test_runs")
        .update({status:"awaiting_payment",preference_id:p.id,updated_at:new Date().toISOString()})
        .eq("id",run.id);
      if(updateError) throw new Error("Não foi possível registrar a preferência do teste.");
      return reply({verified:true,credentials:presence,checkoutUrl,test:{id:run.id,status:"awaiting_payment"}});
    }catch(error){
      await admin.from("artvideo_payment_test_runs").update({status:"error"}).eq("id",run.id);
      return reply({error:error instanceof Error?error.message:"Falha ao criar teste."},502);
    }
  }catch{
    return reply({error:"Não foi possível verificar a integração agora."},503);
  }
});
