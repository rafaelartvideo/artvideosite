import { supabase } from "@/lib/supabase";

function org(id: string) {
  if (!id) throw new Error("Selecione uma empresa.");
  return id;
}

export type SalesReservation = {
  status: "active" | "released" | "converted" | "expired";
  item_count?: number;
  expires_at?: string;
};
export type SalesReservationRow = {
  id: string;
  status: string;
  quantity_base: number;
  expires_at: string;
  inventory_item_id: string;
  product_name: string;
};
export async function listSalesProposalReservations(organizationId:string,proposalId:string):Promise<SalesReservationRow[]> {
  const {data,error}=await supabase.rpc("list_sales_proposal_reservations_v1",{
    p_organization_id:org(organizationId),p_proposal_id:proposalId,
  });
  if(error)throw error;
  return (data||[]) as SalesReservationRow[];
}

export async function reserveSalesProposal(organizationId:string,proposalId:string,days=7):Promise<SalesReservation> {
  const {data,error}=await supabase.rpc("reserve_sales_proposal_v1",{
    p_organization_id:org(organizationId),p_proposal_id:proposalId,p_days:days,
  });
  if(error)throw error;
  return data as SalesReservation;
}
export async function releaseSalesProposalReservation(organizationId:string,proposalId:string,reason:string):Promise<void> {
  const {error}=await supabase.rpc("release_sales_proposal_reservation_v1",{
    p_organization_id:org(organizationId),p_proposal_id:proposalId,p_reason:reason,
  });
  if(error)throw error;
}

export type SalesDelivery = {
  id: string;
  method: "pickup" | "delivery";
  address_snapshot: string | null;
  expected_at: string | null;
  tracking_code: string | null;
  carrier_name: string | null;
  recipient_name: string | null;
  recipient_document: string | null;
  proof_media_id: string | null;
  proof_notes: string | null;
  completed_at: string | null;
};
export async function configureSalesDelivery(organizationId:string,orderId:string,
  input:{method:"pickup"|"delivery";address?:string;expectedAt?:string;
    carrier?:string;tracking?:string;regenerate?:boolean}):Promise<{pickup_code:string|null}> {
  const {data,error}=await supabase.rpc("configure_sales_order_delivery_v1",{
    p_organization_id:org(organizationId),p_order_id:orderId,p_method:input.method,
    p_address:input.address||null,p_expected_at:input.expectedAt||null,
    p_carrier:input.carrier||null,p_tracking:input.tracking||null,
    p_regenerate_code:Boolean(input.regenerate),
  });
  if(error)throw error;
  return data as {pickup_code:string|null};
}
export async function completeSalesDelivery(organizationId:string,orderId:string,
  input:{recipient:string;document?:string;pin?:string;proofMediaId?:string;proofNotes?:string}
):Promise<void> {
  const {error}=await supabase.rpc("complete_sales_order_delivery_v1",{
    p_organization_id:org(organizationId),p_order_id:orderId,
    p_recipient_name:input.recipient,p_recipient_document:input.document||null,
    p_pickup_code:input.pin||null,p_proof_media_id:input.proofMediaId||null,
    p_proof_notes:input.proofNotes||null,
  });
  if(error)throw error;
}
export async function getSalesDelivery(organizationId:string,orderId:string):Promise<SalesDelivery|null> {
  const {data,error}=await supabase.rpc("get_sales_delivery_v1",{
    p_organization_id:org(organizationId),p_order_id:orderId,
  });
  if(error)throw error;
  return data as SalesDelivery|null;
}

export type SalesReturn = {
  id: string;
  order_id: string;
  return_number: number;
  type: "refund" | "exchange" | "store_credit";
  status: "requested" | "approved" | "rejected" | "awaiting_finance" | "received" | "closed";
  reason: string;
  credit_amount: number;
  disposition: "restock" | "quarantine" | null;
  refund_payable_id: string | null;
  created_at: string;
  received_at: string | null;
  notes: string | null;
  items: Array<{
    id: string;
    order_item_id: string;
    product: string;
    quantity: number;
    credit_amount: number;
  }>;
};
export async function requestSalesReturn(organizationId:string,orderId:string,input:{
  type:SalesReturn["type"];reason:string;items:Array<{orderItemId:string;quantity:number}>;
}):Promise<{id:string;number:number;credit_amount:number}> {
  const {data,error}=await supabase.rpc("request_sales_return_v1",{
    p_organization_id:org(organizationId),p_order_id:orderId,
    p_request_type:input.type,p_reason:input.reason,
    p_items:input.items.map(item=>({order_item_id:item.orderItemId,quantity:item.quantity})),
  });
  if(error)throw error;
  return data as {id:string;number:number;credit_amount:number};
}
export async function reviewSalesReturn(organizationId:string,id:string,approve:boolean,notes:string) {
  const {error}=await supabase.rpc("review_sales_return_v1",{
    p_organization_id:org(organizationId),p_return_id:id,
    p_approve:approve,p_notes:notes,
  });
  if(error)throw error;
}
export async function receiveSalesReturn(organizationId:string,id:string,
  disposition:"restock"|"quarantine",notes:string) {
  const {data,error}=await supabase.rpc("receive_sales_return_v1",{
    p_organization_id:org(organizationId),p_return_id:id,
    p_disposition:disposition,p_notes:notes,
  });
  if(error)throw error;
  return data as {status:string;refund_payable_id:string|null;stock_restored:number};
}
export async function listSalesReturns(organizationId:string,orderId:string):Promise<SalesReturn[]> {
  const {data,error}=await supabase.rpc("list_sales_returns_v1",{
    p_organization_id:org(organizationId),p_order_id:orderId,
  });
  if(error)throw error;
  return (data||[]) as SalesReturn[];
}

export type QuickSalesCustomer = {
  id:string;name:string;document:string;whatsapp:string;phone:string;
};
export type QuickSalesCustomerInput = {
  type:"PF"|"PJ";name:string;document:string;whatsapp:string;email?:string;
  address:{
    zip_code:string;street:string;number:string;neighborhood:string;
    city:string;state:string;complement?:string;reference?:string;
  };
};
export async function createSalesQuickCustomer(organizationId:string,input:QuickSalesCustomerInput):Promise<QuickSalesCustomer> {
  const {data,error}=await supabase.rpc("create_sales_quick_customer_v1",{
    p_organization_id:org(organizationId),
    p_payload:{
      customer_type:input.type,name:input.name,document:input.document,
      whatsapp:input.whatsapp,email:input.email||null,address:input.address,
    },
  });
  if(error)throw error;
  return data as QuickSalesCustomer;
}

export type SalesPaymentPreset = {
  id:string;name:string;installment_count:number;first_due_days:number;
};
export async function listSalesPaymentPresets(organizationId:string):Promise<SalesPaymentPreset[]> {
  const {data,error}=await supabase.rpc("list_sales_payment_presets_v1",{p_organization_id:org(organizationId)});
  if(error)throw error;
  return (data||[]) as SalesPaymentPreset[];
}
export async function saveSalesPaymentPreset(organizationId:string,input:{
  name:string;installments:number;days:number;active?:boolean
}):Promise<void> {
  const {error}=await supabase.rpc("save_sales_payment_preset_v1",{
    p_organization_id:org(organizationId),p_name:input.name,p_installments:input.installments,
    p_first_due_days:input.days,p_active:input.active??true,
  });
  if(error)throw error;
}

export type SalesMetricSummary = {
  orders:number;gross_sales:number;returns:number;net_sales:number;
  received:number;open_receivables:number;average_ticket:number;
  estimated_margin:number|null;margin_available:boolean;
};
export type SalesSellerMetric = {
  seller_id:string;name:string;orders:number;gross:number;returned:number;net:number;
  received_net:number;target:number;rate:number;basis:"received"|"confirmed";
  commission_estimated:number;progress:number;
};
export type SalesProductMetric = {product_id:string;name:string;units:number;total:number};
export type SalesManagement = {
  month:string;
  summary:SalesMetricSummary;
  sellers:SalesSellerMetric[];
  top_products:SalesProductMetric[];
  trend:Array<{month:string;gross:number;net:number}>;
  seller_choices:Array<{id:string;name:string}>;
  can_manage_goals:boolean;
};
export async function getSalesManagement(organizationId:string,month:string):Promise<SalesManagement> {
  const {data,error}=await supabase.rpc("get_sales_management_v1",{
    p_organization_id:org(organizationId),p_month:month+"-01",
  });
  if(error)throw error;
  return data as SalesManagement;
}
export async function saveSalesSellerGoal(organizationId:string,input:{
  sellerId:string;month:string;target:number;rate:number;basis:"received"|"confirmed";
}):Promise<void> {
  const {error}=await supabase.rpc("save_sales_seller_goal_v1",{
    p_organization_id:org(organizationId),p_seller_id:input.sellerId,
    p_month:input.month+"-01",p_target:input.target,
    p_commission_percent:input.rate,p_basis:input.basis,
  });
  if(error)throw error;
}
