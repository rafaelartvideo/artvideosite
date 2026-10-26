import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { CORS, json } from "../_shared/artvideo-store.ts";

const noCache = { ...CORS, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
function reply(body: unknown, status = 200) {
 return new Response(JSON.stringify(body), { status, headers: {
   ...noCache, "Content-Type": "application/json; charset=utf-8",
 } });
}

Deno.serve(async (req: Request) => {
 if (req.method==="OPTIONS") return new Response(null,{headers:noCache});
 if (req.method!=="POST") return reply({error:"Método inválido."},405);
 try {
   if (Number(req.headers.get("content-length")||0)>2048) return reply({error:"Solicitação inválida."},400);
   const input=await req.json();
   const token=String(input?.token||"").trim().toLowerCase();
   const pickupLookup=input?.action==="pickup_lookup";
   if(!pickupLookup&&!/^[a-f0-9]{64}$/.test(token)) return reply({error:"Código de acompanhamento inválido."},400);
   const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
     auth:{persistSession:false},
   });
   let orderId:string;
   if(pickupLookup){
     const code=String(input.pickup_code||"").trim();
     if(!/^[0-9]{4}$/.test(code))
       return reply({error:"Informe os quatro dígitos do código de retirada."},400);
     // Limite compartilhado entre as tentativas da mesma origem. Chave opaca:
     // não guarda IP nem dados do cliente em texto no banco.
     const remoteAddress=req.headers.get("cf-connecting-ip")
       ||req.headers.get("x-real-ip")
       ||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
     const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const bytes=new TextEncoder().encode("artvideo:pickup:"+remoteAddress+":"+secret);
     const digest=await crypto.subtle.digest("SHA-256",bytes);
     const rateKey=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
     const {data:verified,error:lookupError}=await admin.rpc("artvideo_store_pickup_lookup_pin_v1",{
       p_code:code,p_rate_key:rateKey,
     });
     if(lookupError)return reply({error:"Não foi possível consultar o pedido agora."},503);
     if(!verified)return reply({error:"Código indisponível ou não encontrado. Confira os quatro dígitos. Após muitas tentativas, aguarde 15 minutos."},404);
     orderId=String(verified);
     const [orderResult,deliveryResult]=await Promise.all([
       admin.from("artvideo_store_orders")
         .select("id,order_number,created_at,status,paid_at,payment_issue_status,buyer,shipping_service_id,postal_code")
         .eq("id",orderId).single(),
       admin.from("artvideo_store_fulfillments")
         .select("status,updated_at").eq("order_id",orderId).maybeSingle(),
     ]);
     if(orderResult.error||deliveryResult.error||!orderResult.data)
       return reply({error:"Não foi possível consultar o andamento."},503);
     const order=orderResult.data;
     // No PIN curto só saem as etapas e o endereço público de retirada,
     // nunca o link privado, dados do comprador, itens ou valores.
     const buyer=order.buyer && typeof order.buyer==="object" ? order.buyer : {};
     return reply({order:{
       id:order.id,number:"PED-"+String(order.order_number),createdAt:order.created_at,
       paymentStatus:order.status,paidAt:order.paid_at,
       paymentIssueStatus:order.payment_issue_status||null,
       deliveryMethod:"pickup",fulfillmentStatus:order.status==="paid"?(deliveryResult.data?.status||"pending"):"pending",
       fulfillmentUpdatedAt:deliveryResult.data?.updated_at||null,
       pickupCode:deliveryResult.data?.status==="picked_up"?null:code,
       pickupLocation:{
         street:String(buyer.street||""),number:String(buyer.number||""),
         district:String(buyer.district||""),city:String(buyer.city||""),
         state:String(buyer.state||""),postalCode:String(order.postal_code||""),
         hours:String(buyer.pickup_hours||""),instructions:String(buyer.pickup_instructions||""),
       },
       deliveryName:"Retirada na loja",items:[],subtotal:0,shippingPrice:0,total:0,
       timeline:[],supportCases:[],
     }});
   }
   const {data:access,error:accessError}=await admin.from("artvideo_store_tracking_access")
     .select("order_id").eq("tracking_token",token).maybeSingle();
   if (accessError) return reply({error:"Não foi possível consultar o pedido."},503);
   if (!access) return reply({error:"Link de acompanhamento inválido ou indisponível."},404);
   orderId=access.order_id;
   const [orderQuery,itemsQuery,deliveryQuery,eventsQuery,casesQuery]=await Promise.all([
     admin.from("artvideo_store_orders")
       .select("id,order_number,created_at,status,payment_issue_status,payment_issue_at,quantity,product_name,unit_price,shipping_price,shipping_service_id,shipping_service_name,postal_code,paid_at,buyer")
       .eq("id",orderId).maybeSingle(),
     admin.from("artvideo_store_order_items")
       .select("product_name,quantity,unit_price").eq("order_id",orderId).order("created_at"),
     admin.from("artvideo_store_fulfillments")
       .select("status,updated_at,delivered_at").eq("order_id",orderId).maybeSingle(),
     admin.from("artvideo_store_fulfillment_events")
       .select("to_status,created_at").eq("order_id",orderId).order("created_at",{ascending:true}),
     admin.from("artvideo_store_support_cases")
       .select("id,request_type,status,reason,created_at,updated_at")
       .eq("order_id",orderId).order("created_at",{ascending:false}).limit(5),
   ]);
   if(orderQuery.error||itemsQuery.error||deliveryQuery.error||eventsQuery.error||casesQuery.error||!orderQuery.data)
     return reply({error:"Não foi possível consultar o pedido agora."},503);
   const caseIds=(casesQuery.data||[]).map(c=>c.id);
   const supportEvents=caseIds.length ? await admin.from("artvideo_store_support_case_events")
     .select("case_id,to_status,created_at,public_note")
     .in("case_id",caseIds).not("public_note","is",null).order("created_at",{ascending:true})
     .limit(100) : {data:[],error:null};
   if(supportEvents.error) return reply({error:"Não foi possível consultar as solicitações."},503);
   const [receiptsQuery,refundQuery]=caseIds.length ? await Promise.all([
     admin.from("artvideo_store_return_receipts").select("case_id,product_name,quantity,inspection_status,received_at")
       .in("case_id",caseIds).order("received_at",{ascending:true}),
     admin.from("artvideo_store_refund_records").select("case_id,amount,refunded_at")
       .in("case_id",caseIds).order("refunded_at",{ascending:true}),
   ]) : [{data:[],error:null},{data:[],error:null}];
   if(receiptsQuery.error||refundQuery.error) return reply({error:"Não foi possível consultar as atualizações do pós-venda."},503);
   const supportCases=(casesQuery.data||[]).map(c=>({
     id:c.id,type:c.request_type,status:c.status,reason:c.reason,
     createdAt:c.created_at,updatedAt:c.updated_at,
     timeline:(supportEvents.data||[]).filter(e=>e.case_id===c.id).map(e=>({
       status:e.to_status,note:e.public_note,createdAt:e.created_at,
     })),
     receivedItems:(receiptsQuery.data||[]).filter(r=>r.case_id===c.id).map(r=>({
       title:r.product_name,quantity:r.quantity,inspected:r.inspection_status==="inspected",
       receivedAt:r.received_at,
     })),
     refundedTotal:(refundQuery.data||[]).filter(r=>r.case_id===c.id)
       .reduce((total,r)=>total+Number(r.amount||0),0),
     lastRefundAt:(refundQuery.data||[]).filter(r=>r.case_id===c.id).at(-1)?.refunded_at||null,
   }));
   const o=orderQuery.data;
   const lines=itemsQuery.data?.length ? itemsQuery.data : [{
     product_name:o.product_name,quantity:o.quantity,unit_price:o.unit_price,
   }];
   const items=lines.map(item=>({
     title:String(item.product_name||"Produto"),quantity:Number(item.quantity),
     unitPrice:Number(item.unit_price),
   }));
   const pickup=o.shipping_service_id==="pickup";
   const buyer=o.buyer && typeof o.buyer==="object" ? o.buyer : {};
   const subtotal=items.reduce((total,item)=>total+item.quantity*item.unitPrice,0);
   // O PIN de retirada (4 dígitos) e o link de acompanhamento (256 bits)
   // são distintos e só são exibidos após validação do link privado.
   const pickupCodeQuery=pickup && deliveryQuery.data?.status!=="picked_up"
     ? await admin.from("artvideo_store_pickup_codes")
       .select("code").eq("order_id",orderId).maybeSingle()
     : {data:null,error:null};
   if(pickupCodeQuery.error)return reply({error:"Não foi possível consultar o código de retirada."},503);
   return reply({
     order:{
       id:o.id,number:"PED-"+String(o.order_number),createdAt:o.created_at,
       paymentStatus:o.status,paidAt:o.paid_at,
       paymentIssueStatus:o.payment_issue_status||null,
       paymentIssueAt:o.payment_issue_at||null,
       deliveryMethod:pickup?"pickup":"delivery",
       fulfillmentStatus:o.status==="paid" ? deliveryQuery.data?.status || "pending" : "pending",
       fulfillmentUpdatedAt:deliveryQuery.data?.updated_at || null,
       deliveryName:o.shipping_service_name,
       items,subtotal,shippingPrice:Number(o.shipping_price),
       total:subtotal+Number(o.shipping_price),
       timeline:(eventsQuery.data||[]).map(e=>({status:e.to_status,createdAt:e.created_at})),
       supportCases,
       ...(pickup ? {
         pickupCode:pickupCodeQuery.data?.code||null,
         pickupLocation:{
           street:String(buyer.street||""),number:String(buyer.number||""),
           district:String(buyer.district||""),city:String(buyer.city||""),
           state:String(buyer.state||""),postalCode:String(o.postal_code||""),
           hours:String(buyer.pickup_hours||""),
           instructions:String(buyer.pickup_instructions||""),
         },
       } : {}),
     },
   });
 } catch {
   return reply({error:"Não foi possível consultar o pedido. Tente novamente."},503);
 }
});