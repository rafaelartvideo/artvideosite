import { supabase } from "@/lib/supabase";
import type {
  FinancialMovement,
  FinancialSettlementDraft,
  FinancialTransfer,
  FinancialTransferDraft,
} from "../domain/finance.types";

const MOVEMENT_COLUMNS = "id,organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,reversal_of_movement_id,cash_session_id,description_snapshot,created_by,created_at";
const TRANSFER_COLUMNS = "id,organization_id,from_account_id,to_account_id,amount,occurred_at,note,transfer_status,reversed_at,reversed_by,reversal_reason,created_by,created_at";

function requiredOrganizationId(organizationId: string) {
  const normalized = String(organizationId || "").trim();
  if (!normalized) throw new Error("Empresa ativa não encontrada.");
  return normalized;
}

function asIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Data/hora financeira inválida.");
  return date.toISOString();
}

export async function getFinancialAccountBalances(organizationId: string): Promise<Record<string, number>> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("get_financial_account_balances", { p_organization_id: org });
  if (error) throw error;
  return Object.fromEntries((data || []).map((row: any) => [String(row.account_id), Number(row.balance || 0)]));
}

export async function listFinancialMovements(organizationId: string): Promise<FinancialMovement[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_movements")
    .select(MOVEMENT_COLUMNS)
    .eq("organization_id", org)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as FinancialMovement[];
}

export async function listScheduledFinancialSettlements(organizationId: string) {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_settlements")
    .select("id,organization_id,financial_entry_id,financial_installment_id,entry_type,payment_method_id,payment_method_name_snapshot,financial_account_id,financial_account_name_snapshot,principal_amount,interest_amount,penalty_amount,other_additions,discount_amount,gross_amount,percentage_fee_snapshot,fixed_fee_snapshot,fee_amount,net_amount,occurred_at,expected_settlement_at,settlement_status,posted_at,reversed_at,reversed_by,reversal_reason,created_by,created_at")
    .eq("organization_id", org)
    .eq("settlement_status", "scheduled")
    .order("expected_settlement_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data || []) as any[];
}

export async function listFinancialTransfers(organizationId: string): Promise<FinancialTransfer[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_transfers")
    .select(TRANSFER_COLUMNS)
    .eq("organization_id", org)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []) as FinancialTransfer[];
}

export async function registerFinancialSettlement(organizationId: string, draft: FinancialSettlementDraft) {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("register_financial_settlement", {
    p_organization_id: org,
    p_entry_id: draft.entry_id,
    p_installment_id: draft.installment_id,
    p_principal_amount: Number(draft.principal_amount),
    p_interest_amount: Number(draft.interest_amount || 0),
    p_penalty_amount: Number(draft.penalty_amount || 0),
    p_other_additions: Number(draft.other_additions || 0),
    p_discount_amount: Number(draft.discount_amount || 0),
    p_payment_method_id: draft.payment_method_id,
    p_financial_account_id: draft.financial_account_id,
    p_occurred_at: asIso(draft.occurred_at),
  });
  if (error) throw error;
  return data as { id: string; status: string; remaining: number; gross: number; fee: number; net: number; expected_settlement_at: string };
}

export async function confirmFinancialSettlement(organizationId: string, settlementId: string, postedAt = new Date().toISOString()) {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("confirm_financial_settlement", {
    p_organization_id: org,
    p_settlement_id: settlementId,
    p_posted_at: asIso(postedAt),
  });
  if (error) throw error;
  return data;
}

export async function reverseFinancialSettlement(organizationId: string, settlementId: string, reason: string) {
  const org = requiredOrganizationId(organizationId);
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) throw new Error("Informe o motivo do estorno.");
  const { data, error } = await supabase.rpc("reverse_financial_settlement", {
    p_organization_id: org,
    p_settlement_id: settlementId,
    p_reason: normalizedReason,
  });
  if (error) throw error;
  return data;
}

export async function transferFinancialFunds(organizationId: string, draft: FinancialTransferDraft): Promise<string> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("transfer_financial_funds", {
    p_organization_id: org,
    p_from_account_id: draft.from_account_id,
    p_to_account_id: draft.to_account_id,
    p_amount: Number(draft.amount),
    p_occurred_at: asIso(draft.occurred_at),
    p_note: String(draft.note || "").trim() || null,
  });
  if (error) throw error;
  if (!data) throw new Error("A transferência não retornou identificador.");
  return String(data);
}

export async function reverseFinancialTransfer(organizationId: string, transferId: string, reason: string): Promise<string> {
  const org = requiredOrganizationId(organizationId);
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) throw new Error("Informe o motivo do estorno.");
  const { data, error } = await supabase.rpc("reverse_financial_transfer", {
    p_organization_id: org,
    p_transfer_id: transferId,
    p_reason: normalizedReason,
  });
  if (error) throw error;
  return String(data);
}

export async function configureFinancialOpeningBalance(organizationId: string, accountId: string, amount: number, note?: string | null): Promise<number> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("configure_financial_opening_balance", {
    p_organization_id: org,
    p_account_id: accountId,
    p_amount: Number(amount || 0),
    p_note: String(note || "").trim() || null,
  });
  if (error) throw error;
  return Number(data || 0);
}
