import { supabase } from "@/lib/supabase";
import type { FinancialCollectionChannel, FinancialCollectionLog } from "../domain/finance.types";

const COLLECTION_COLUMNS = "id,organization_id,financial_entry_id,financial_installment_id,channel,note,contacted_at,next_follow_up_at,created_by,created_at";

function requiredOrganizationId(organizationId: string) {
  const normalized = String(organizationId || "").trim();
  if (!normalized) throw new Error("Empresa ativa não encontrada.");
  return normalized;
}

export async function listFinancialCollectionLogs(organizationId: string, entryId: string): Promise<FinancialCollectionLog[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_collection_logs")
    .select(COLLECTION_COLUMNS)
    .eq("organization_id", org)
    .eq("financial_entry_id", entryId)
    .order("contacted_at", { ascending: false });
  if (error) throw error;
  return (data || []) as FinancialCollectionLog[];
}

export async function registerFinancialCollectionLog(
  organizationId: string,
  entryId: string,
  payload: {
    installment_id?: string | null;
    channel: FinancialCollectionChannel;
    note: string;
    contacted_at?: string | null;
    next_follow_up_at?: string | null;
  },
): Promise<string> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("register_financial_collection_log", {
    p_organization_id: org,
    p_entry_id: entryId,
    p_installment_id: payload.installment_id || null,
    p_channel: payload.channel,
    p_note: String(payload.note || "").trim(),
    p_contacted_at: payload.contacted_at || new Date().toISOString(),
    p_next_follow_up_at: payload.next_follow_up_at || null,
  });
  if (error) throw error;
  return String(data);
}
