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
  accounts: OrderCompletionFinancialAccount[];
  payment_methods: OrderCompletionPaymentMethod[];
};

export type OrderCompletionFinancePayload = {
  installments: Array<{ installment_number: number; due_date: string; amount: number }>;
  payments: Array<{
    installment_number: number;
    principal_amount: number;
    payment_method_id: string;
    financial_account_id: string;
    occurred_at?: string | null;
  }>;
};

export async function getOrderCompletionFinanceOptions(organizationId: string): Promise<OrderCompletionFinanceOptions> {
  const { data, error } = await supabase.rpc("get_order_completion_finance_options", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const raw = (data || {}) as any;
  return {
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
  discountPercentage: number,
  financePayload: OrderCompletionFinancePayload,
) => supabase.rpc("complete_service_order", {
  p_service_order_id: serviceOrderId,
  p_discount_percentage: discountPercentage,
  p_finance_payload: financePayload,
});
