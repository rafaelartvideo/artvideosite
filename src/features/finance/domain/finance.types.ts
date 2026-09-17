export type FinanceSection = "overview" | "accounts" | "registries";
export type FinanceRegistrySection = "categories" | "cost-centers" | "payment-methods" | "settings";
export type FinancialAccountType = "cash" | "bank" | "pix" | "other";
export type FinancialCategoryNature = "revenue" | "expense";
export type FinancialPaymentMethodType = "cash" | "pix" | "debit_card" | "credit_card" | "boleto" | "transfer" | "other";

export interface FinancialAccount {
  id: string;
  organization_id: string;
  name: string;
  account_type: FinancialAccountType;
  description: string | null;
  bank_name: string | null;
  agency: string | null;
  account_number: string | null;
  pix_key: string | null;
  allows_cash_session: boolean;
  is_active: boolean;
}

export interface FinancialCategory {
  id: string;
  organization_id: string;
  name: string;
  nature: FinancialCategoryNature;
  parent_category_id: string | null;
  report_group: string | null;
  description: string | null;
  is_active: boolean;
}

export interface FinancialCostCenter {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface FinancialPaymentMethod {
  id: string;
  organization_id: string;
  name: string;
  method_type: FinancialPaymentMethodType;
  percentage_fee: number;
  fixed_fee: number;
  settlement_days: number;
  requires_financial_account: boolean;
  creates_future_settlement: boolean;
  default_financial_account_id: string | null;
  is_active: boolean;
}

export interface FinancialSettings {
  organization_id: string;
  second_approval_threshold: number | null;
  cash_session_enabled: boolean;
  default_receivable_category_id: string | null;
  default_payable_category_id: string | null;
  default_cost_center_id: string | null;
}
