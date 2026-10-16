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
   const [orderQuery,itemsQuery,deliveryQuery,eventsQuery]=await Promise.all([
     admin.from("artvideo_store_orders")
       .select("id,created_at,status,quantity,product_name,unit_price,shipping_price,shipping_service_id,shipping_service_name,postal_code,paid_at,buyer")
       .eq("id",orderId).maybeSingle(),
     admin.from("artvideo_store_order_items")
       .select("product_name,quantity,unit_price").eq("order_id",orderId).order("created_at"),
     admin.from("artvideo_store_fulfillments")
       .select("status,updated_at,delivered_at").eq("order_id",orderId).maybeSingle(),
     admin.from("artvideo_store_fulfillment_events")
       .select("to_status,created_at").eq("order_id",orderId).order("created_at",{ascending:true}),
   ]);
   if(orderQuery.error||itemsQuery.error||deliveryQuery.error||eventsQuery.error||!orderQuery.data)
     return reply({error:"Não foi possível consultar o pedido agora."},503);
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