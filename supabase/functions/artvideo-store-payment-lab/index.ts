import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { CORS } from "../_shared/artvideo-store.ts";

const headers = { ...CORS, "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
function reply(body: unknown,status=200) {
  return new Response(JSON.stringify(body),{status,headers});
}
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
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
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
    if(action==="status"){
      if(!safeId(input.test_id)) return reply({error:"Identificador do teste inválido."},400);
      const {data,error}=await admin.from("artvideo_payment_test_runs")
        .select("id,status,created_at,updated_at")
        .eq("id",input.test_id).eq("created_by",userData.user.id).maybeSingle();
      if(error) return reply({error:"Não foi possível consultar o teste."},503);
      if(!data) return reply({error:"Teste não encontrado."},404);
      return reply({test:{id:data.id,status:data.status,createdAt:data.created_at,updatedAt:data.updated_at}});
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
