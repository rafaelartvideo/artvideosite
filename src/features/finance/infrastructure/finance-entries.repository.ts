import { supabase } from "@/lib/supabase";
import { deriveEntryStatus } from "../domain/finance-entry.mjs";
import type {
  FinancialAllocation,
  FinancialEntry,
  FinancialEntryDetail,
  FinancialEntryDraft,
  FinancialEntryType,
  FinancialEvent,
  FinancialInstallment,
} from "../domain/finance.types";

const ENTRY_COLUMNS = "id,organization_id,entry_type,description,issue_date,competence_date,original_amount,approval_status,required_approvals,counterpart_entity_id,counterpart_name_snapshot,counterpart_document_snapshot,origin_type,origin_reference,notes,created_by,updated_by,created_at,updated_at";
const INSTALLMENT_COLUMNS = "id,organization_id,financial_entry_id,installment_number,total_installments,due_date,original_amount,settled_amount,settled_at,created_at";
const ALLOCATION_COLUMNS = "id,organization_id,financial_entry_id,category_id,category_name_snapshot,category_nature_snapshot,cost_center_id,cost_center_name_snapshot,allocation_mode,percentage,amount,created_at";
const EVENT_COLUMNS = "id,organization_id,financial_entry_id,event_type,event_data,created_by,created_at";

function requiredOrganizationId(organizationId: string) {
  const normalized = String(organizationId || "").trim();
  if (!normalized) throw new Error("Empresa ativa não encontrada.");
  return normalized;
}

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type FinancialCounterparty = {
  id: string;
  name: string;
  document: string | null;
  roles: string[];
};

export async function listFinancialEntries(organizationId: string, entryType: FinancialEntryType): Promise<FinancialEntry[]> {
  const org = requiredOrganizationId(organizationId);
  const { data: entries, error } = await supabase
    .from("financial_entries")
    .select(ENTRY_COLUMNS)
    .eq("organization_id", org)
    .eq("entry_type", entryType)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (entries || []) as FinancialEntry[];
  if (!rows.length) return [];

  const ids = rows.map(row => row.id);
  const { data: installments, error: installmentsError } = await supabase
    .from("financial_installments")
    .select(INSTALLMENT_COLUMNS)
    .eq("organization_id", org)
    .in("financial_entry_id", ids)
    .order("due_date");
  if (installmentsError) throw installmentsError;

  const grouped = new Map<string, FinancialInstallment[]>();
  for (const installment of (installments || []) as FinancialInstallment[]) {
    const list = grouped.get(installment.financial_entry_id) || [];
    list.push(installment);
    grouped.set(installment.financial_entry_id, list);
  }

  const today = todayDate();
  return rows.map(entry => {
    const entryInstallments = grouped.get(entry.id) || [];
    const pending = entryInstallments.filter(item => Number(item.settled_amount || 0) < Number(item.original_amount || 0));
    return {
      ...entry,
      next_due_date: pending[0]?.due_date || null,
      operational_status: entry.approval_status === "cancelled" || entry.approval_status === "reversed"
        ? "cancelled"
        : deriveEntryStatus(entryInstallments, today),
    } as FinancialEntry;
  });
}

export async function getFinancialEntryDetail(organizationId: string, id: string): Promise<FinancialEntryDetail> {
  const org = requiredOrganizationId(organizationId);
  const [{ data: entry, error }, installmentsResult, allocationsResult, eventsResult] = await Promise.all([
    supabase.from("financial_entries").select(ENTRY_COLUMNS).eq("organization_id", org).eq("id", id).single(),
    supabase.from("financial_installments").select(INSTALLMENT_COLUMNS).eq("organization_id", org).eq("financial_entry_id", id).order("installment_number"),
    supabase.from("financial_allocations").select(ALLOCATION_COLUMNS).eq("organization_id", org).eq("financial_entry_id", id).order("created_at"),
    supabase.from("financial_events").select(EVENT_COLUMNS).eq("organization_id", org).eq("financial_entry_id", id).order("created_at", { ascending: false }),
  ]);
  if (error) throw error;
  if (installmentsResult.error) throw installmentsResult.error;
  if (allocationsResult.error) throw allocationsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  return {
    ...(entry as FinancialEntry),
    installments: (installmentsResult.data || []) as FinancialInstallment[],
    allocations: (allocationsResult.data || []) as FinancialAllocation[],
    events: (eventsResult.data || []) as FinancialEvent[],
  };
}

export async function listFinancialCounterparties(organizationId: string, entryType: FinancialEntryType): Promise<FinancialCounterparty[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("entities")
    .select("id,name,legal_name,trade_name,document,is_active,roles:entity_roles(role,is_active)")
    .eq("organization_id", org)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;

  const preferredRole = entryType === "payable" ? "supplier" : "customer";
  return (data || []).map((item: any) => {
    const roles = Array.isArray(item.roles)
      ? item.roles.filter((role: any) => role?.is_active !== false).map((role: any) => String(role.role))
      : [];
    return {
      id: String(item.id),
      name: String(item.trade_name || item.name || item.legal_name || "Cadastro"),
      document: item.document || null,
      roles,
    };
  }).sort((left, right) => {
    const leftPreferred = left.roles.includes(preferredRole) ? 0 : 1;
    const rightPreferred = right.roles.includes(preferredRole) ? 0 : 1;
    return leftPreferred - rightPreferred || left.name.localeCompare(right.name, "pt-BR");
  });
}

export async function saveFinancialEntry(organizationId: string, draft: FinancialEntryDraft): Promise<string> {
  const org = requiredOrganizationId(organizationId);
  const payload = {
    entry_type: draft.entry_type,
    description: String(draft.description || "").trim(),
    issue_date: draft.issue_date,
    competence_date: draft.competence_date,
    original_amount: Number(draft.original_amount),
    counterpart_entity_id: draft.counterpart_entity_id || null,
    counterpart_name: String(draft.counterpart_name || "").trim() || null,
    counterpart_document: String(draft.counterpart_document || "").trim() || null,
    notes: String(draft.notes || "").trim() || null,
    installments: draft.installments.map(item => ({
      installment_number: item.installment_number,
      due_date: item.due_date,
      amount: Number(item.amount),
    })),
    allocations: draft.allocations.map(item => ({
      category_id: item.category_id,
      cost_center_id: item.cost_center_id || null,
      mode: item.mode,
      value: Number(item.value),
      amount: Number(item.amount),
    })),
  };

  const { data, error } = await supabase.rpc("save_financial_entry", {
    p_organization_id: org,
    p_payload: payload,
    p_entry_id: draft.id || null,
  });
  if (error) throw error;
  if (!data) throw new Error("O lançamento foi salvo sem retornar o identificador.");
  return String(data);
}
