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

export type UnrepairedReturnAttempt = {
  id:string; reason:string; reason_category:string; observations:string;
  started_at:string; started_by:string; notified_at?:string|null; notified_by?:string|null; notification_message_id?:string|null; waiting_situation_id:string; prior_situation_id:string;
};

export async function getUnrepairedReturn(organizationId:string,orderId:string):Promise<UnrepairedReturnAttempt|null>{
  const {data,error}=await (supabase as any).rpc("get_order_unrepaired_return_v1",{
    p_organization_id:organizationId,p_order_id:orderId,
  });
  if(error)throw error;
  return data||null;
}

export async function startUnrepairedReturn(organizationId:string,orderId:string,category:string,observations:string):Promise<UnrepairedReturnAttempt>{
  const {data,error}=await (supabase as any).rpc("start_order_unrepaired_return_v1",{
    p_organization_id:organizationId,p_order_id:orderId,p_category:category,p_observations:observations,
  });
  if(error)throw error;
  if(!data?.id)throw new Error("Início da devolução não confirmado.");
  return data;
}

export async function cancelUnrepairedReturn(organizationId:string,orderId:string):Promise<void>{
  const {error}=await (supabase as any).rpc("cancel_order_unrepaired_return_v1",{
    p_organization_id:organizationId,p_order_id:orderId,
  });
  if(error)throw error;
}

export function isAwaitingUnrepairedReturn(order:any):boolean{
  return order?.situation?.slug==="aguardando-retirada-sem-reparo"||
    String(order?.situation?.name||"").trim().toLowerCase()==="aguardando retirada sem reparo";
}

export async function markUnrepairedReturnNotified(organizationId:string,orderId:string,attemptId:string,conversationId:string,providerMessageId:string):Promise<UnrepairedReturnAttempt>{
  const {data,error}=await (supabase as any).rpc("mark_order_unrepaired_return_notified_v1",{
    p_organization_id:organizationId,p_order_id:orderId,p_attempt_id:attemptId,p_conversation_id:conversationId,p_provider_message_id:providerMessageId,
  });
  if(error)throw error;
  if(!data?.notified_at)throw new Error("Registro da notificação não confirmado.");
  return data;
}
