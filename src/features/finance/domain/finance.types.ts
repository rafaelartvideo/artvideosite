export type FinanceSection = "overview" | "receivables" | "payables" | "accounts" | "registries";
export type FinanceRegistrySection = "categories" | "cost-centers" | "payment-methods" | "settings";
export type FinancialAccountType = "cash" | "bank" | "pix" | "other";
export type FinancialCategoryNature = "revenue" | "expense";
export type FinancialPaymentMethodType = "cash" | "pix" | "debit_card" | "credit_card" | "boleto" | "transfer" | "other";
export type FinancialEntryType = "receivable" | "payable";
export type FinancialApprovalStatus = "draft" | "pending" | "approved" | "rejected" | "cancelled" | "reversed";
export type FinancialApprovalAction = "approve" | "reject";
export type FinancialEntryOriginType = "manual" | "service_order" | "inventory_purchase" | "recurring" | "other";
export type FinancialOperationalStatus = "open" | "partial" | "settled" | "overdue" | "cancelled";
export type FinancialAllocationMode = "amount" | "percentage";

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

export interface FinancialEntry {
  id: string;
  organization_id: string;
  entry_type: FinancialEntryType;
  description: string;
  issue_date: string;
  competence_date: string;
  original_amount: number;
  approval_status: FinancialApprovalStatus;
  required_approvals: number;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  reversed_at?: string | null;
  counterpart_entity_id: string | null;
  counterpart_name_snapshot: string | null;
  counterpart_document_snapshot: string | null;
  origin_type: FinancialEntryOriginType;
  origin_reference: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  next_due_date?: string | null;
  operational_status?: FinancialOperationalStatus;
  approval_count?: number;
}

export interface FinancialInstallment {
  id: string;
  organization_id: string;
  financial_entry_id: string;
  installment_number: number;
  total_installments: number;
  due_date: string;
  original_amount: number;
  settled_amount: number;
  settled_at: string | null;
  created_at: string;
}

export interface FinancialAllocation {
  id: string;
  organization_id: string;
  financial_entry_id: string;
  category_id: string;
  category_name_snapshot: string;
  category_nature_snapshot: FinancialCategoryNature;
  cost_center_id: string | null;
  cost_center_name_snapshot: string | null;
  allocation_mode: FinancialAllocationMode;
  percentage: number | null;
  amount: number;
  created_at: string;
}

export interface FinancialApproval {
  id: string;
  organization_id: string;
  financial_entry_id: string;
  approver_user_id: string;
  approver_name_snapshot: string;
  action: FinancialApprovalAction;
  approval_order: number | null;
  note: string | null;
  created_at: string;
}

export interface FinancialEvent {
  id: string;
  organization_id: string;
  financial_entry_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface FinancialEntryDetail extends FinancialEntry {
  installments: FinancialInstallment[];
  allocations: FinancialAllocation[];
  approvals: FinancialApproval[];
  events: FinancialEvent[];
}

export interface FinancialInstallmentDraft {
  installment_number: number;
  due_date: string;
  amount: number;
}

export interface FinancialAllocationDraft {
  category_id: string;
  cost_center_id?: string | null;
  mode: FinancialAllocationMode;
  value: number;
  amount: number;
}

export interface FinancialEntryDraft {
  id?: string | null;
  entry_type: FinancialEntryType;
  description: string;
  issue_date: string;
  competence_date: string;
  original_amount: number;
  counterpart_entity_id?: string | null;
  counterpart_name?: string | null;
  counterpart_document?: string | null;
  notes?: string | null;
  installments: FinancialInstallmentDraft[];
  allocations: FinancialAllocationDraft[];
}
