import { supabase } from "@/lib/supabase";

export type InventoryPurchaseFinanceDraft = {
  inventory_item_id: string;
  input_quantity: number;
  input_unit: "un" | "cx";
  supplier_entity_id: string;
  input_unit_cost: number;
  purchase_reference?: string | null;
  notes?: string | null;
  discount: number;
  freight: number;
  other_costs: number;
  document_reference?: string | null;
  installments: Array<{ installment_number: number; due_date: string; amount: number }>;
};

export type InventoryPurchaseFinanceResult = {
  movement_id: string;
  financial_entry_id: string;
  financial_total: number;
  approval_status: "pending";
  required_approvals: number;
};

export async function recordInventoryPurchaseWithFinance(
  organizationId: string,
  draft: InventoryPurchaseFinanceDraft,
): Promise<InventoryPurchaseFinanceResult> {
  const org = String(organizationId || "").trim();
  if (!org) throw new Error("Empresa ativa não encontrada.");

  const { data, error } = await supabase.rpc("record_inventory_purchase_with_finance", {
    p_organization_id: org,
    p_inventory_item_id: draft.inventory_item_id,
    p_input_quantity: Number(draft.input_quantity),
    p_input_unit: draft.input_unit,
    p_supplier_entity_id: draft.supplier_entity_id,
    p_input_unit_cost: Number(draft.input_unit_cost),
    p_purchase_reference: String(draft.purchase_reference || "").trim() || null,
    p_notes: String(draft.notes || "").trim() || null,
    p_finance_payload: {
      discount: Number(draft.discount || 0),
      freight: Number(draft.freight || 0),
      other_costs: Number(draft.other_costs || 0),
      document_reference: String(draft.document_reference || draft.purchase_reference || "").trim() || null,
      installments: draft.installments,
    },
  });
  if (error) throw error;
  const result = (data || {}) as any;
  if (!result.movement_id || !result.financial_entry_id) {
    throw new Error("A compra foi registrada sem retornar os vínculos de estoque e Financeiro.");
  }
  return {
    movement_id: String(result.movement_id),
    financial_entry_id: String(result.financial_entry_id),
    financial_total: Number(result.financial_total || 0),
    approval_status: "pending",
    required_approvals: Number(result.required_approvals || 1),
  };
}
