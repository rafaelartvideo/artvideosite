import { supabase } from "@/lib/supabase";

export type OrderCompletionFinancialAccount = {
  id: string;
  name: string;
  account_type: string;
};

export type OrderCompletionPaymentMethod = {
  id: string;
  name: string;
  method_type: string;
  percentage_fee: number;
  fixed_fee: number;
  settlement_days: number;
  creates_future_settlement: boolean;
  default_financial_account_id: string | null;
};

export type OrderCompletionFinanceOptions = {
  finance_enabled: boolean;
  accounts: OrderCompletionFinancialAccount[];
  payment_methods: OrderCompletionPaymentMethod[];
};

export type OrderWarrantyPartner = { id: string; name: string; document: string | null };

export async function listOrderWarrantyPartners(organizationId:string):Promise<OrderWarrantyPartner[]> {
  const {data,error}=await supabase.from("entities")
    .select("id,name,document,roles:entity_roles!inner(role,is_active)")
    .eq("organization_id",organizationId)
    .eq("is_active",true)
    .eq("roles.role","partner")
    .eq("roles.is_active",true)
    .order("name");
  if(error)throw error;
  return (data||[]).map(row=>({id:String(row.id),name:String(row.name),document:row.document||null}));
}

export type OrderCompletionFinancePayload = {
  installments: Array<{ installment_number: number; due_date: string; amount: number }>;
  // A conclusão da OS apenas informa recebimentos. Nunca realiza baixas financeiras.
  payments: [];
  reported_receipts: Array<{
    installment_number: number;
    principal_amount: number;
    payment_method_id: string;
    financial_account_id: string;
    occurred_at: string | null;
  }>;
  payment_plan: Array<{ payment_method_id: string; amount: number }>;
  partner_receivable?: { entity_id: string; amount: number; due_date: string; notes?: string };
  payment_preferences: Array<{
    installment_number: number;
    payment_method_id: string;
    financial_account_id: string;
  }>;
};

// Valida o modo de cobrança diretamente no banco ao abrir a conclusão.
// Evita usar o serviço/tipo de atendimento em cache após alteração nas configurações.
export async function getOrderCompletionChargeCustomer(organizationId:string, serviceOrderId:string):Promise<boolean> {
  const {data,error}=await supabase.from("service_orders")
    .select("id,service_type_id,service_type:service_types(id,charge_customer)")
    .eq("organization_id",organizationId)
    .eq("id",serviceOrderId)
    .single();
  if(error)throw error;
  if(!data)throw new Error("Ordem de Serviço não encontrada para confirmar a cobrança.");
  const item=data as {service_type_id:string|null;service_type:{charge_customer?:boolean}|null};
  if(item.service_type_id && (!item.service_type || typeof item.service_type.charge_customer!=="boolean"))
    throw new Error("Não foi possível consultar a cobrança do tipo de atendimento.");
  return item.service_type?.charge_customer!==false;
}

export async function getOrderCompletionFinanceOptions(organizationId: string): Promise<OrderCompletionFinanceOptions> {
  const { data, error } = await supabase.rpc("get_order_completion_finance_options", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const raw = (data || {}) as any;
  return {
    finance_enabled: raw.finance_enabled !== false,
    accounts: Array.isArray(raw.accounts) ? raw.accounts.map((item: any) => ({
      id: String(item.id),
      name: String(item.name || "Conta"),
      account_type: String(item.account_type || "other"),
    })) : [],
    payment_methods: Array.isArray(raw.payment_methods) ? raw.payment_methods.map((item: any) => ({
      id: String(item.id),
      name: String(item.name || "Forma de pagamento"),
      method_type: String(item.method_type || "other"),
      percentage_fee: Number(item.percentage_fee || 0),
      fixed_fee: Number(item.fixed_fee || 0),
      settlement_days: Number(item.settlement_days || 0),
      creates_future_settlement: Boolean(item.creates_future_settlement),
      default_financial_account_id: item.default_financial_account_id ? String(item.default_financial_account_id) : null,
    })) : [],
  };
}

export const completeServiceOrderWithFinance = (
  serviceOrderId: string,
  servicePrice: number | null,
  discountType: "percentage" | "amount",
  discountValue: number,
  financePayload: OrderCompletionFinancePayload,
) => supabase.rpc("complete_service_order_v2", {
  p_service_order_id: serviceOrderId,
  p_service_price: servicePrice,
  p_discount_type: discountType,
  p_discount_value: discountValue,
  p_finance_payload: financePayload,
});
