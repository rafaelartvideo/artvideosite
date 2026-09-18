import { supabase } from "@/lib/supabase";
import type { FinancialRecurringRule } from "../domain/finance.types";

const RECURRING_COLUMNS = "id,organization_id,entry_type,description,original_amount,counterpart_entity_id,counterpart_name_snapshot,counterpart_document_snapshot,frequency,interval_value,custom_days,start_date,end_date,next_occurrence_date,installment_count,first_due_offset_days,allocations,notes,is_active,last_generated_at,created_by,updated_by,created_at,updated_at";

function requiredOrganizationId(organizationId: string) {
  const normalized = String(organizationId || "").trim();
  if (!normalized) throw new Error("Empresa ativa não encontrada.");
  return normalized;
}

export async function listFinancialRecurringRules(organizationId: string): Promise<FinancialRecurringRule[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_recurring_rules")
    .select(RECURRING_COLUMNS)
    .eq("organization_id", org)
    .order("is_active", { ascending: false })
    .order("next_occurrence_date", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as FinancialRecurringRule[];
}

export async function saveFinancialRecurringRule(
  organizationId: string,
  payload: Record<string, unknown>,
  ruleId?: string | null,
): Promise<string> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("save_financial_recurring_rule", {
    p_organization_id: org,
    p_payload: payload,
    p_rule_id: ruleId || null,
  });
  if (error) throw error;
  if (!data) throw new Error("A recorrência foi salva sem retornar o identificador.");
  return String(data);
}

export async function setFinancialRecurringRuleActive(
  organizationId: string,
  ruleId: string,
  active: boolean,
): Promise<boolean> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("set_financial_recurring_rule_active", {
    p_organization_id: org,
    p_rule_id: ruleId,
    p_active: active,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function generateFinancialRecurringOccurrences(
  organizationId: string,
  ruleId: string,
  untilDate?: string | null,
): Promise<{ generated: number; next_occurrence_date: string; active: boolean }> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("generate_financial_recurring_occurrences", {
    p_organization_id: org,
    p_rule_id: ruleId,
    p_until_date: untilDate || null,
  });
  if (error) throw error;
  return data as { generated: number; next_occurrence_date: string; active: boolean };
}
