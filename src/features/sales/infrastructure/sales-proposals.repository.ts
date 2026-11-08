import { supabase } from "@/lib/supabase";
import type { CommercialSaleResult } from "./sales.repository";

export type ProposalStatus = "draft" | "sent" | "approved" | "rejected" | "converted" | "cancelled" | "expired";

export type SalesProposalRow = {
  id: string;
  proposal_number: number;
  customer_name_snapshot: string;
  customer_document_snapshot: string | null;
  seller_name: string;
  status: Exclude<ProposalStatus,"expired">;
  effective_status: ProposalStatus;
  valid_until: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  converted_order_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesProposalLine = {
  product_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type SalesProposalEvent = {
  id: string;
  type: "created" | "revised" | "sent" | "approved" | "rejected" | "reopened" | "converted" | "cancelled";
  at: string;
  by: string;
  data: Record<string, unknown>;
};

export type SalesProposalDetail = SalesProposalRow & {
  customer_id: string;
  created_by: string | null;
  updated_by: string | null;
  converted_at: string | null;
  items: SalesProposalLine[];
  events: SalesProposalEvent[];
};

export type SalesProposalPage = {
  total: number;
  page: number;
  page_size: number;
  items: SalesProposalRow[];
};

export type SaveProposalInput = {
  idempotencyKey: string;
  proposalId?: string | null;
  customerId: string;
  validUntil: string;
  discount: number;
  notes: string;
  items: Array<{ productId: string; quantity: number; expectedUnitPrice: number }>;
};

export type ProposalSaved = {
  id: string;
  proposal_number: number;
  status: string;
  idempotent_replay: boolean;
};

function tenant(organizationId: string) {
  if (!organizationId) throw new Error("Selecione uma empresa para continuar.");
  return organizationId;
}

export async function listSalesProposals(
  organizationId: string, filter: { search: string; status: string; page: number; pageSize?: number },
): Promise<SalesProposalPage> {
  const { data, error } = await supabase.rpc("list_sales_proposals_v1", {
    p_organization_id: tenant(organizationId),
    p_search: filter.search.trim(),
    p_status: filter.status || "all",
    p_page: filter.page,
    p_page_size: filter.pageSize || 15,
  });
  if (error) throw error;
  const result = data as SalesProposalPage | null;
  return {
    total: Number(result?.total || 0),
    page: Number(result?.page || 1),
    page_size: Number(result?.page_size || 15),
    items: Array.isArray(result?.items) ? result.items : [],
  };
}

export async function getSalesProposalDetail(organizationId: string, id: string): Promise<SalesProposalDetail> {
  const { data, error } = await supabase.rpc("get_sales_proposal_detail_v1", {
    p_organization_id: tenant(organizationId), p_proposal_id: id,
  });
  if (error) throw error;
  return data as SalesProposalDetail;
}

export async function saveSalesProposal(organizationId: string, input: SaveProposalInput): Promise<ProposalSaved> {
  const { data, error } = await supabase.rpc("save_sales_proposal_v1", {
    p_organization_id: tenant(organizationId),
    p_idempotency_key: input.idempotencyKey,
    p_proposal_id: input.proposalId || null,
    p_payload: {
      customer_id: input.customerId,
      valid_until: input.validUntil,
      discount: input.discount,
      notes: input.notes,
      items: input.items.map(item => ({ product_id: item.productId, quantity: item.quantity,
        expected_unit_price: item.expectedUnitPrice })),
    },
  });
  if (error) throw error;
  return data as ProposalSaved;
}

export async function changeSalesProposalStatus(
  organizationId: string, id: string, status: "sent" | "approved" | "rejected" | "draft" | "cancelled",
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc("change_sales_proposal_status_v1", {
    p_organization_id: tenant(organizationId),
    p_proposal_id: id,
    p_next_status: status,
    p_reason: reason || null,
  });
  if (error) throw error;
}

export async function convertSalesProposal(
  organizationId: string, proposalId: string,
  input: {
    idempotencyKey: string;
    receivedPayments: Array<{ paymentMethodId: string; amount: number }>;
    installmentCount: number;
    firstDueDate: string | null;
  },
): Promise<CommercialSaleResult> {
  const { data, error } = await supabase.rpc("convert_sales_proposal_v1", {
    p_organization_id: tenant(organizationId),
    p_proposal_id: proposalId,
    p_idempotency_key: input.idempotencyKey,
    p_checkout: {
      received_payments: input.receivedPayments.map(payment => ({
        payment_method_id: payment.paymentMethodId,
        amount: payment.amount,
      })),
      installment_count: input.installmentCount,
      first_due_date: input.firstDueDate,
    },
  });
  if (error) throw error;
  return data as CommercialSaleResult;
}
