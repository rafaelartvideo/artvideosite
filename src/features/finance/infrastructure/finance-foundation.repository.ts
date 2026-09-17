import { supabase } from "@/lib/supabase";
import type {
  FinancialAccount,
  FinancialCategory,
  FinancialCostCenter,
  FinancialPaymentMethod,
  FinancialSettings,
} from "../domain/finance.types";

const ACCOUNT_COLUMNS = "id,organization_id,name,account_type,description,bank_name,agency,account_number,pix_key,allows_cash_session,opening_balance_configured_at,opening_balance_configured_by,is_active";
const CATEGORY_COLUMNS = "id,organization_id,name,nature,parent_category_id,report_group,description,is_active";
const COST_CENTER_COLUMNS = "id,organization_id,name,description,is_active";
const PAYMENT_METHOD_COLUMNS = "id,organization_id,name,method_type,percentage_fee,fixed_fee,settlement_days,requires_financial_account,creates_future_settlement,default_financial_account_id,is_active";
const SETTINGS_COLUMNS = "organization_id,second_approval_threshold,cash_session_enabled,default_receivable_category_id,default_payable_category_id,default_cost_center_id";

const cleanText = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

function requiredOrganizationId(organizationId: string) {
  const normalized = String(organizationId || "").trim();
  if (!normalized) throw new Error("Empresa ativa não encontrada.");
  return normalized;
}

export type FinancialAccountInput = Omit<FinancialAccount, "id" | "organization_id" | "is_active" | "balance" | "opening_balance_configured_at" | "opening_balance_configured_by"> & {
  id?: string;
  is_active?: boolean;
};
export type FinancialCategoryInput = Omit<FinancialCategory, "id" | "organization_id" | "is_active"> & {
  id?: string;
  is_active?: boolean;
};
export type FinancialCostCenterInput = Omit<FinancialCostCenter, "id" | "organization_id" | "is_active"> & {
  id?: string;
  is_active?: boolean;
};
export type FinancialPaymentMethodInput = Omit<FinancialPaymentMethod, "id" | "organization_id" | "is_active"> & {
  id?: string;
  is_active?: boolean;
};
export type FinancialSettingsInput = Omit<FinancialSettings, "organization_id">;

export async function listFinancialAccounts(organizationId: string): Promise<FinancialAccount[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("organization_id", org)
    .order("name");
  if (error) throw error;
  return (data || []) as FinancialAccount[];
}

export async function saveFinancialAccount(organizationId: string, input: FinancialAccountInput): Promise<FinancialAccount> {
  const org = requiredOrganizationId(organizationId);
  const payload = {
    name: String(input.name || "").trim(),
    account_type: input.account_type,
    description: cleanText(input.description),
    bank_name: input.account_type === "bank" ? cleanText(input.bank_name) : null,
    agency: input.account_type === "bank" ? cleanText(input.agency) : null,
    account_number: input.account_type === "bank" ? cleanText(input.account_number) : null,
    pix_key: input.account_type === "pix" ? cleanText(input.pix_key) : null,
    allows_cash_session: input.account_type === "cash" && Boolean(input.allows_cash_session),
    is_active: input.is_active !== false,
  };
  if (!payload.name) throw new Error("Informe o nome da conta financeira.");

  if (input.id) {
    const { data, error } = await supabase
      .from("financial_accounts")
      .update(payload)
      .eq("organization_id", org)
      .eq("id", input.id)
      .select(ACCOUNT_COLUMNS)
      .single();
    if (error) throw error;
    return data as FinancialAccount;
  }

  const { data, error } = await supabase
    .from("financial_accounts")
    .insert({ organization_id: org, ...payload })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) throw error;
  return data as FinancialAccount;
}

export async function setFinancialAccountActive(organizationId: string, id: string, isActive: boolean): Promise<void> {
  const org = requiredOrganizationId(organizationId);
  const { error } = await supabase
    .from("financial_accounts")
    .update({ is_active: isActive })
    .eq("organization_id", org)
    .eq("id", id);
  if (error) throw error;
}

export async function listFinancialCategories(organizationId: string): Promise<FinancialCategory[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_categories")
    .select(CATEGORY_COLUMNS)
    .eq("organization_id", org)
    .order("nature")
    .order("name");
  if (error) throw error;
  return (data || []) as FinancialCategory[];
}

export async function saveFinancialCategory(organizationId: string, input: FinancialCategoryInput): Promise<FinancialCategory> {
  const org = requiredOrganizationId(organizationId);
  if (input.id && input.parent_category_id === input.id) throw new Error("Uma categoria não pode ser pai dela mesma.");
  const payload = {
    name: String(input.name || "").trim(),
    nature: input.nature,
    parent_category_id: input.parent_category_id || null,
    report_group: cleanText(input.report_group),
    description: cleanText(input.description),
    is_active: input.is_active !== false,
  };
  if (!payload.name) throw new Error("Informe o nome da categoria.");

  if (input.id) {
    const { data, error } = await supabase
      .from("financial_categories")
      .update(payload)
      .eq("organization_id", org)
      .eq("id", input.id)
      .select(CATEGORY_COLUMNS)
      .single();
    if (error) throw error;
    return data as FinancialCategory;
  }

  const { data, error } = await supabase
    .from("financial_categories")
    .insert({ organization_id: org, ...payload })
    .select(CATEGORY_COLUMNS)
    .single();
  if (error) throw error;
  return data as FinancialCategory;
}

export async function setFinancialCategoryActive(organizationId: string, id: string, isActive: boolean): Promise<void> {
  const org = requiredOrganizationId(organizationId);
  const { error } = await supabase
    .from("financial_categories")
    .update({ is_active: isActive })
    .eq("organization_id", org)
    .eq("id", id);
  if (error) throw error;
}

export async function listFinancialCostCenters(organizationId: string): Promise<FinancialCostCenter[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_cost_centers")
    .select(COST_CENTER_COLUMNS)
    .eq("organization_id", org)
    .order("name");
  if (error) throw error;
  return (data || []) as FinancialCostCenter[];
}

export async function saveFinancialCostCenter(organizationId: string, input: FinancialCostCenterInput): Promise<FinancialCostCenter> {
  const org = requiredOrganizationId(organizationId);
  const payload = {
    name: String(input.name || "").trim(),
    description: cleanText(input.description),
    is_active: input.is_active !== false,
  };
  if (!payload.name) throw new Error("Informe o nome do centro de custo.");

  if (input.id) {
    const { data, error } = await supabase
      .from("financial_cost_centers")
      .update(payload)
      .eq("organization_id", org)
      .eq("id", input.id)
      .select(COST_CENTER_COLUMNS)
      .single();
    if (error) throw error;
    return data as FinancialCostCenter;
  }

  const { data, error } = await supabase
    .from("financial_cost_centers")
    .insert({ organization_id: org, ...payload })
    .select(COST_CENTER_COLUMNS)
    .single();
  if (error) throw error;
  return data as FinancialCostCenter;
}

export async function setFinancialCostCenterActive(organizationId: string, id: string, isActive: boolean): Promise<void> {
  const org = requiredOrganizationId(organizationId);
  const { error } = await supabase
    .from("financial_cost_centers")
    .update({ is_active: isActive })
    .eq("organization_id", org)
    .eq("id", id);
  if (error) throw error;
}

export async function listFinancialPaymentMethods(organizationId: string): Promise<FinancialPaymentMethod[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .eq("organization_id", org)
    .order("name");
  if (error) throw error;
  return (data || []) as FinancialPaymentMethod[];
}

export async function saveFinancialPaymentMethod(organizationId: string, input: FinancialPaymentMethodInput): Promise<FinancialPaymentMethod> {
  const org = requiredOrganizationId(organizationId);
  const requiresAccount = Boolean(input.requires_financial_account);
  const payload = {
    name: String(input.name || "").trim(),
    method_type: input.method_type,
    percentage_fee: Math.min(100, Math.max(0, Number(input.percentage_fee) || 0)),
    fixed_fee: Math.max(0, Number(input.fixed_fee) || 0),
    settlement_days: Math.max(0, Math.trunc(Number(input.settlement_days) || 0)),
    requires_financial_account: requiresAccount,
    creates_future_settlement: Boolean(input.creates_future_settlement),
    default_financial_account_id: requiresAccount ? input.default_financial_account_id || null : null,
    is_active: input.is_active !== false,
  };
  if (!payload.name) throw new Error("Informe o nome da forma de pagamento.");

  if (input.id) {
    const { data, error } = await supabase
      .from("financial_payment_methods")
      .update(payload)
      .eq("organization_id", org)
      .eq("id", input.id)
      .select(PAYMENT_METHOD_COLUMNS)
      .single();
    if (error) throw error;
    return data as FinancialPaymentMethod;
  }

  const { data, error } = await supabase
    .from("financial_payment_methods")
    .insert({ organization_id: org, ...payload })
    .select(PAYMENT_METHOD_COLUMNS)
    .single();
  if (error) throw error;
  return data as FinancialPaymentMethod;
}

export async function setFinancialPaymentMethodActive(organizationId: string, id: string, isActive: boolean): Promise<void> {
  const org = requiredOrganizationId(organizationId);
  const { error } = await supabase
    .from("financial_payment_methods")
    .update({ is_active: isActive })
    .eq("organization_id", org)
    .eq("id", id);
  if (error) throw error;
}

export async function getFinancialSettings(organizationId: string): Promise<FinancialSettings> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_settings")
    .select(SETTINGS_COLUMNS)
    .eq("organization_id", org)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as FinancialSettings;
  return {
    organization_id: org,
    second_approval_threshold: null,
    cash_session_enabled: false,
    default_receivable_category_id: null,
    default_payable_category_id: null,
    default_cost_center_id: null,
  };
}

export async function saveFinancialSettings(organizationId: string, input: FinancialSettingsInput): Promise<FinancialSettings> {
  const org = requiredOrganizationId(organizationId);
  const payload = {
    second_approval_threshold: input.second_approval_threshold == null ? null : Math.max(0, Number(input.second_approval_threshold) || 0),
    cash_session_enabled: Boolean(input.cash_session_enabled),
    default_receivable_category_id: input.default_receivable_category_id || null,
    default_payable_category_id: input.default_payable_category_id || null,
    default_cost_center_id: input.default_cost_center_id || null,
  };

  const { data: updated, error: updateError } = await supabase
    .from("financial_settings")
    .update(payload)
    .eq("organization_id", org)
    .select(SETTINGS_COLUMNS)
    .maybeSingle();
  if (updateError) throw updateError;
  if (updated) return updated as FinancialSettings;

  const { data, error } = await supabase
    .from("financial_settings")
    .insert({ organization_id: org, ...payload })
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) throw error;
  return data as FinancialSettings;
}
