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
   if (!/^[a-f0-9]{64}$/.test(token)) return reply({error:"Código de acompanhamento inválido."},400);
   const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
     auth:{persistSession:false},
   });
   const {data:access,error:accessError}=await admin.from("artvideo_store_tracking_access")
     .select("order_id").eq("tracking_token",token).maybeSingle();
   if (accessError) return reply({error:"Não foi possível consultar o pedido."},503);
   if (!access) return reply({error:"Link de acompanhamento inválido ou indisponível."},404);
   const orderId=access.order_id;
   const [orderQuery,itemsQuery,deliveryQuery,eventsQuery,casesQuery]=await Promise.all([
     admin.from("artvideo_store_orders")
       .select("id,created_at,status,quantity,product_name,unit_price,shipping_price,shipping_service_id,shipping_service_name,postal_code,paid_at,buyer")
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
   return reply({
     order:{
       id:o.id,number:String(o.id).slice(0,8).toUpperCase(),createdAt:o.created_at,
       paymentStatus:o.status,paidAt:o.paid_at,
       deliveryMethod:pickup?"pickup":"delivery",
       fulfillmentStatus:o.status==="paid" ? deliveryQuery.data?.status || "pending" : "pending",
       fulfillmentUpdatedAt:deliveryQuery.data?.updated_at || null,
       deliveryName:o.shipping_service_name,
       items,subtotal,shippingPrice:Number(o.shipping_price),
       total:subtotal+Number(o.shipping_price),
       timeline:(eventsQuery.data||[]).map(e=>({status:e.to_status,createdAt:e.created_at})),
       supportCases,
       ...(pickup ? {
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