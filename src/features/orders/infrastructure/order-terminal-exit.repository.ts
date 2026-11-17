import { supabase } from "@/lib/supabase";

export type OrderTerminalOutcome = "disposal_confirmed" | "returned_unrepaired";
export type OrderTerminalStockItem = {
  inventory_item_id:string;
  name:string;
  sku:string|null;
  quantity_outstanding:number;
  unit:string;
  unit_cost:number;
};
export type OrderTerminalStockDecision = {
  inventory_item_id:string;
  decision:"reusable"|"installed"|"damaged"|"not_recovered";
  return_qty:number;
  physical_confirmed:boolean;
};

export async function getOrderTerminalStock(organizationId:string,orderId:string):Promise<OrderTerminalStockItem[]> {
  const {data,error}=await (supabase as any).rpc("get_order_exit_stock_v1",{
    p_organization_id:organizationId,p_order_id:orderId,
  });
  if(error)throw error;
  return Array.isArray(data)?data.map(item=>({
    inventory_item_id:String(item.inventory_item_id),
    name:String(item.name||"Peça"),
    sku:item.sku||null,
    quantity_outstanding:Number(item.quantity_outstanding||0),
    unit:String(item.unit||"un"),
    unit_cost:Number(item.unit_cost||0),
  })):[];
}

export async function completeOrderTerminalExit({
  organizationId,orderId,outcome,signatureRequestId,evidenceMediaId,reason,stockDecisions,disposalPartnerId,
}:{
  organizationId:string;
  orderId:string;
  outcome:OrderTerminalOutcome;
  signatureRequestId:string;
  evidenceMediaId:string;
  reason:string;
  stockDecisions:OrderTerminalStockDecision[];
  disposalPartnerId?:string|null;
}){
  const {data,error}=await (supabase as any).rpc("complete_order_terminal_exit_v1",{
    p_organization_id:organizationId,
    p_order_id:orderId,
    p_outcome:outcome,
    p_signature_request_id:signatureRequestId,
    p_evidence_media_id:evidenceMediaId,
    p_reason:reason.trim(),
    p_stock_decisions:stockDecisions,
    p_disposal_partner_id:disposalPartnerId||null,
  });
  if(error)throw error;
  if(!data?.id)throw new Error("Encerramento não confirmado pelo servidor.");
  return data as {id:string;order_id:string;outcome:OrderTerminalOutcome;completed_at:string;returned_to_stock:number};
}
