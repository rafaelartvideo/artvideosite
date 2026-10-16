import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { CORS } from "../_shared/artvideo-store.ts";
const respond=(data:unknown,status=200,headers=CORS)=>new Response(JSON.stringify(data),{
 status,headers:{...headers,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},
});
const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
})[ch]||ch);
type Job={
 job_id:string;event_key:string;event_type:string;order_id:string;
 order_number:string;buyer_name:string;email:string;pickup:boolean;token:string;
};
const notices:Record<string,{subject:string;title:string;description:string}>={
 paid:{subject:"Pagamento confirmado",title:"Pagamento confirmado",
   description:"Recebemos a confirmação do pagamento. Seu pedido seguirá para preparação."},
 ready:{subject:"Pedido pronto",title:"Pedido pronto",
   description:"Seu pedido já está separado e pronto para a próxima etapa."},
 out_for_delivery:{subject:"Pedido saiu para entrega",title:"Seu pedido saiu para entrega",
   description:"A entrega foi iniciada. Acompanhe as próximas atualizações."},
 delivery_issue:{subject:"Atualização sobre sua entrega",title:"Uma ocorrência foi registrada",
   description:"A equipe registrou uma ocorrência na entrega. Estamos acompanhando a situação."},
 delivered:{subject:"Pedido entregue",title:"Entrega registrada",
   description:"A equipe registrou a entrega do seu pedido."},
 picked_up:{subject:"Pedido retirado",title:"Retirada registrada",
   description:"A equipe registrou a retirada do seu pedido."},
};
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 const allowedOrigin=origin==="https://unionworld.com.br" ? origin : CORS["Access-Control-Allow-Origin"];
 const responseHeaders={...CORS,"Access-Control-Allow-Origin":allowedOrigin};
 const reply=(data:unknown,status=200)=>respond(data,status,responseHeaders);
 if(req.method==="OPTIONS") return new Response(null,{headers:responseHeaders});
 if(req.method!=="POST") return reply({error:"Método inválido."},405);
 const url=Deno.env.get("SUPABASE_URL");
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!serviceKey||!anonKey) return reply({error:"Serviço indisponível."},503);
 const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const internal=bearer===serviceKey;
 if(!internal){
   if(!bearer) return reply({error:"Não autorizado."},401);
   const userClient=createClient(url,anonKey,{
     global:{headers:{Authorization:"Bearer "+bearer}},auth:{persistSession:false},
   });
   const {data:{user},error:userError}=await userClient.auth.getUser(bearer);
   if(userError||!user) return reply({error:"Não autorizado."},401);
   const {data:allowed,error:permissionError}=await userClient.rpc("artvideo_store_can_process_notifications_v1");
   if(permissionError||allowed!==true) return reply({error:"Sem permissão."},403);
 }
 let input:any={};
 try {input=await req.json();}catch{/* Processa fila geral. */}
 const orderId=input?.order_id==null ? null : String(input.order_id);
 if(orderId && !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(orderId))
   return reply({error:"Pedido inválido."},400);
 const apiKey=Deno.env.get("RESEND_API_KEY");
 const from=Deno.env.get("ARTVIDEO_STORE_EMAIL_FROM");
 if(!apiKey||!from) return reply({error:"Notificações aguardam configuração do provedor de e-mail."},503);
 const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
 let sent=0,failed=0,attempted=0;
 for(let idx=0;idx<6;idx++){
   const {data:job,error:claimError}=await admin.rpc("artvideo_store_claim_email_v1",{p_order_id:orderId});
   if(claimError) return reply({error:"Não foi possível acessar a fila de notificações.",sent,failed},503);
   if(!job) break;
   attempted++;
   const item=job as Job;
   const message=notices[item.event_type];
   const recipient=String(item.email||"").trim();
   const safeNumber=escapeHtml(String(item.order_number||""));
   const customer=escapeHtml(String(item.buyer_name||"Cliente").split(" ")[0].slice(0,60));
   const link="https://eletronicaartvideo.com.br/acompanhar-pedido#c="+encodeURIComponent(item.token);
   const variant=item.pickup && item.event_type==="ready"?
      {subject:"Seu pedido está pronto para retirada",title:"Pode retirar seu pedido!",
       description:"Seu pedido está pronto na loja. Consulte o endereço e os horários antes de ir buscá-lo."}:message;
   let providerId="";
   let reason="";
   if(!variant || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)){
     reason="Não há endereço de e-mail válido para esse pedido.";
   }else {
     try{
       const html='<div style="background:#f4f8ff;padding:24px;font-family:Arial,sans-serif;color:#153455">'+
         '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:30px">'+
         '<p style="color:#1056bd;font-weight:bold">Eletrônica Artvideo</p>'+
         '<h1 style="font-size:22px">'+escapeHtml(variant.title)+'</h1>'+
         '<p>Olá, '+customer+'.</p><p>'+escapeHtml(variant.description)+'</p>'+
         '<p><strong>Pedido #'+safeNumber+'</strong></p>'+
         '<p style="margin:30px 0"><a href="'+link+'" style="padding:14px 18px;background:#1032dc;color:#fff;text-decoration:none;border-radius:6px">Acompanhar meu pedido</a></p>'+
         '<p style="font-size:12px;color:#718096">Não compartilhe o link. Ele permite consultar informações do seu pedido.</p>'+
         '<p style="font-size:12px;color:#718096">Se não realizou essa compra, desconsidere esta mensagem.</p>'+
         '</div></div>';
       const response=await fetch("https://api.resend.com/emails",{
         method:"POST",headers:{
           "Authorization":"Bearer "+apiKey,"Content-Type":"application/json",
           "Idempotency-Key":"artvideo-store-"+item.event_key,
         },
         body:JSON.stringify({from,to:[recipient],
           subject:variant.subject+" — Artvideo #"+item.order_number,html}),
         signal:AbortSignal.timeout(14000),
       });
       const result=await response.json().catch(()=>({}));
       if(!response.ok || !result.id) throw new Error("Provedor recusou o e-mail ("+response.status+").");
       providerId=String(result.id);
     }catch(e){reason=e instanceof Error?e.message:"Falha ao enviar e-mail.";}
   }
   const success=Boolean(providerId);
   const {error:finishError}=await admin.rpc("artvideo_store_complete_email_v1",{
     p_job_id:item.job_id,p_success:success,
     p_provider_id:success?providerId:null,p_error:success?null:reason,
   });
   if(finishError) return reply({error:"Falha ao registrar resultado da notificação.",sent,failed},503);
   if(success)sent++;else failed++;
 }
 return reply({attempted,sent,failed});
});