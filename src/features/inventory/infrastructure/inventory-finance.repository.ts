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

/** Registra a movimentação e seus dados comerciais em uma única transação no servidor. */
export type InventoryMovementDetailsDraft = {
  inventory_item_id: string;
  movement_type: "IN" | "OUT" | "ADJUST";
  input_quantity: number;
  input_unit: "un" | "cx";
  supplier_entity_id?: string | null;
  input_unit_cost?: number | null;
  reason?: string | null;
  purchase_reference?: string | null;
  service_order_id?: string | null;
  movement_origin?: "purchase" | "manual";
  notes?: string | null;
  /** NULL utiliza padrão do produto; 0 significa sem prazo nessa entrada. */
  sale_window_days?: number | null;
  ncm?: string | null;
  update_ncm?: boolean;
  finance_payload?: {
    discount: number;
    freight: number;
    other_costs: number;
    document_reference: string | null;
    installments: Array<{ installment_number: number; due_date: string; amount: number }>;
  } | null;
};

export async function recordInventoryMovementWithDetails(
  organizationId: string,
  draft: InventoryMovementDetailsDraft,
): Promise<InventoryPurchaseFinanceResult | { movement_id: string }> {
  if (!organizationId.trim()) throw new Error("Empresa ativa não encontrada.");
  const { data, error } = await supabase.rpc("record_inventory_movement_with_details_v1", {
    p_organization_id: organizationId,
    p_inventory_item_id: draft.inventory_item_id,
    p_movement_type: draft.movement_type,
    p_input_quantity: Number(draft.input_quantity),
    p_input_unit: draft.input_unit,
    p_supplier_entity_id: draft.supplier_entity_id || null,
    p_input_unit_cost: draft.input_unit_cost ?? null,
    p_reason: draft.reason?.trim() || null,
    p_purchase_reference: draft.purchase_reference?.trim() || null,
    p_service_order_id: draft.service_order_id || null,
    p_movement_origin: draft.movement_origin || "manual",
    p_notes: draft.notes?.trim() || null,
    p_finance_payload: draft.finance_payload || null,
    p_sale_window_days: draft.sale_window_days ?? null,
    p_ncm: draft.ncm?.trim() || null,
    p_update_ncm: draft.update_ncm === true,
  });
  if (error) throw error;
  const result = (data || {}) as Record<string, any>;
  if (!result.movement_id) throw new Error("A movimentação não foi confirmada pelo banco.");
  if (draft.finance_payload && !result.financial_entry_id) {
    throw new Error("O pré-lançamento financeiro não foi confirmado pelo banco.");
  }
  return result as InventoryPurchaseFinanceResult | { movement_id: string };
}
