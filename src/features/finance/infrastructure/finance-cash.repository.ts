import { supabase } from "@/lib/supabase";
import type { FinancialCashSession } from "../domain/finance.types";

const CASH_SESSION_COLUMNS = "id,organization_id,financial_account_id,status,opening_expected_amount,opening_counted_amount,opening_difference,opening_note,opened_at,opened_by,closing_expected_amount,closing_counted_amount,closing_difference,closing_reason,closed_at,closed_by,created_at";

function requiredOrganizationId(organizationId: string) {
  const normalized = String(organizationId || "").trim();
  if (!normalized) throw new Error("Empresa ativa não encontrada.");
  return normalized;
}

export async function listFinancialCashSessions(organizationId: string): Promise<FinancialCashSession[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_cash_sessions")
    .select(CASH_SESSION_COLUMNS)
    .eq("organization_id", org)
    .order("opened_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as FinancialCashSession[];
}

export async function openFinancialCashSession(
  organizationId: string,
  accountId: string,
  countedAmount: number,
  note?: string | null,
) {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("open_financial_cash_session", {
    p_organization_id: org,
    p_account_id: accountId,
    p_counted_amount: Number(countedAmount),
    p_note: String(note || "").trim() || null,
  });
  if (error) throw error;
  return data as { id: string; status: string; expected: number; counted: number; difference: number };
}

export async function recordFinancialCashAdjustment(
  organizationId: string,
  sessionId: string,
  action: "supply" | "withdraw",
  amount: number,
  note: string,
) {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("record_financial_cash_adjustment", {
    p_organization_id: org,
    p_session_id: sessionId,
    p_action: action,
    p_amount: Number(amount),
    p_note: String(note || "").trim(),
  });
  if (error) throw error;
  return String(data);
}

export async function closeFinancialCashSession(
  organizationId: string,
  sessionId: string,
  countedAmount: number,
  reason?: string | null,
) {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("close_financial_cash_session", {
    p_organization_id: org,
    p_session_id: sessionId,
    p_counted_amount: Number(countedAmount),
    p_reason: String(reason || "").trim() || null,
  });
  if (error) throw error;
  return data as { id: string; status: string; expected: number; counted: number; difference: number };
}
