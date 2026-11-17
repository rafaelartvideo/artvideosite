import { supabase } from "@/lib/supabase";

export type FinanceWarrantyPartner = {
  id: string;
  name: string;
  document: string | null;
};

export type PrepareWarrantyReceivableDraft = {
  organizationId: string;
  entryId: string;
  partnerId: string;
  amount: number;
  dueDate: string;
  notes: string;
};

// Consultar parceiros somente quando o operador abrir a baixa de uma garantia.
export async function listFinanceWarrantyPartners(organizationId: string): Promise<FinanceWarrantyPartner[]> {
  const { data, error } = await supabase.from("entities")
    .select("id,name,document,roles:entity_roles!inner(role,is_active)")
    .eq("organization_id",organizationId)
    .eq("is_active",true)
    .eq("roles.role","partner")
    .eq("roles.is_active",true)
    .order("name");
  if(error) throw error;
  return (data||[]).map(item=>({
    id: String(item.id), name: String(item.name||"Parceiro"), document: item.document||null,
  }));
}

// A função valida organização, papel do parceiro e permissão de baixas no servidor.
// Não registra recebimento: apenas transforma o título pendente em parcela aberta.
export async function prepareFinanceWarrantyReceivable(draft: PrepareWarrantyReceivableDraft) {
  const {data,error}=await supabase.rpc("prepare_warranty_receivable_v1",{
    p_organization_id:draft.organizationId,
    p_entry_id:draft.entryId,
    p_partner_id:draft.partnerId,
    p_amount:draft.amount,
    p_due_date:draft.dueDate,
    p_notes:draft.notes.trim()||null,
  });
  if(error)throw error;
  return data;
}
