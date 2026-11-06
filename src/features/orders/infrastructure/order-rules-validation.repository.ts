import { supabase } from "@/lib/supabase";
import { validateRules, type RuleStage, type RuleSet } from "../domain/order-rules";

export async function assertOrderRulesForStage(organizationId:string,orderId:string,stage:RuleStage){
 const [orderResponse,imagesResponse]=await Promise.all([
  supabase.from("service_orders").select("*").eq("organization_id",organizationId).eq("id",orderId).single(),
  supabase.from("service_order_media").select("sort_order").eq("organization_id",organizationId).eq("service_order_id",orderId),
 ]);
 if(orderResponse.error)throw orderResponse.error;
 if(imagesResponse.error)throw imagesResponse.error;
 const order=orderResponse.data as any;
 if(!order?.order_rules_snapshot)return;
 const images=(imagesResponse.data||[]).map(x=>({kind:x.sort_order>=500&&x.sort_order<1000?"label":"equipment"}));
 const error=validateRules(order.order_rules_snapshot as RuleSet,order,images,stage);
 if(error)throw new Error(error);
}
