import { supabase } from "@/lib/supabase";
import { marketplaceBuyerClient } from "./marketplace-buyer.client";

export type MarketplaceBuyer = {
  user_id: string;
  full_name: string;
  phone: string;
};
export type MarketplaceServiceRequest = {
  id: string;
  buyer_id: string;
  listing_id: string | null;
  category_id: string | null;
  title: string;
  description: string;
  city: string;
  state: string;
  preferred_date: string | null;
  status: "pending_union" | "open" | "rejected" | "cancelled" | "closed";
  created_at: string;
};
export type MarketplaceRequestInput = Pick<MarketplaceServiceRequest, "listing_id" | "category_id" | "title" | "description" | "city" | "state" | "preferred_date">;
export type MarketplaceRequestLead = Pick<MarketplaceServiceRequest, "id" | "listing_id" | "category_id" | "title" | "description" | "city" | "state" | "preferred_date" | "status" | "created_at">;

const OWN_REQUEST_COLUMNS = "id,buyer_id,listing_id,category_id,title,description,city,state,preferred_date,status,created_at";
const LEAD_COLUMNS = "id,listing_id,category_id,title,description,city,state,preferred_date,status,created_at";

export async function loadMarketplaceBuyerProfile(userId: string): Promise<MarketplaceBuyer | null> {
  const { data, error } = await marketplaceBuyerClient.from("marketplace_buyers")
    .select("user_id,full_name,phone").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as MarketplaceBuyer | null;
}

export async function saveMarketplaceBuyerProfile(profile: MarketplaceBuyer): Promise<MarketplaceBuyer> {
  const { data, error } = await marketplaceBuyerClient.from("marketplace_buyers")
    .upsert({
      user_id: profile.user_id,
      full_name: profile.full_name.trim(),
      phone: profile.phone.trim(),
    }, { onConflict: "user_id" }).select("user_id,full_name,phone").single();
  if (error) throw error;
  return data as MarketplaceBuyer;
}

export async function listMyMarketplaceRequests(userId: string): Promise<MarketplaceServiceRequest[]> {
  const { data, error } = await marketplaceBuyerClient.from("marketplace_service_requests")
    .select(OWN_REQUEST_COLUMNS).eq("buyer_id", userId)
    .order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  return (data || []) as MarketplaceServiceRequest[];
}

export async function createMarketplaceServiceRequest(userId: string, input: MarketplaceRequestInput): Promise<string> {
  const { data, error } = await marketplaceBuyerClient.from("marketplace_service_requests")
    .insert({
      buyer_id: userId,
      listing_id: input.listing_id,
      category_id: input.category_id,
      title: input.title.trim(),
      description: input.description.trim(),
      city: input.city.trim(),
      state: input.state.toUpperCase(),
      preferred_date: input.preferred_date || null,
      status: "pending_union",
    }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function cancelMyMarketplaceRequest(userId: string, id: string) {
  const { data, error } = await marketplaceBuyerClient.from("marketplace_service_requests")
    .update({ status: "cancelled" }).eq("id", id).eq("buyer_id", userId)
    .in("status", ["pending_union", "open"]).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Este pedido não está mais aberto.");
}

export async function loadMarketplaceOpportunities(
  page = 1,
  pageSize = 10,
): Promise<{ requests: MarketplaceRequestLead[]; total: number }> {
  // Selecionar explicitamente somente campos de oportunidade.
  // Email, telefone, perfil e buyer_id nunca são enviados ao prestador.
  const { data, error, count } = await supabase.from("marketplace_service_requests")
    .select(LEAD_COLUMNS, { count: "exact" }).eq("status", "open")
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { requests: (data || []) as MarketplaceRequestLead[], total: count || 0 };
}


export type MarketplaceProposalStatus =
  | "submitted" | "rejected" | "presented" | "accepted" | "declined" | "confirmed" | "withdrawn";

export type MarketplaceProposal = {
  id: string;
  request_id: string;
  organization_id: string;
  submitted_by: string;
  description: string;
  amount: number | null;
  estimated_days: number | null;
  status: MarketplaceProposalStatus;
  created_at: string;
  reviewed_at: string | null;
  buyer_replied_at: string | null;
};

export type MarketplaceBuyerProposal = Pick<
  MarketplaceProposal, "id" | "request_id" | "description" | "amount" | "estimated_days" | "status" | "created_at"
>;

const PROPOSAL_COLUMNS = "id,request_id,organization_id,submitted_by,description,amount,estimated_days,status,created_at,reviewed_at,buyer_replied_at";
const BUYER_PROPOSAL_COLUMNS = "id,request_id,description,amount,estimated_days,status,created_at";
export type MarketplaceModeratedRequest = MarketplaceRequestLead & { buyer_id: string };
export type MarketplaceUnionBuyer = MarketplaceBuyer;

export async function loadUnionMarketplaceRequests(page = 1, pageSize = 20): Promise<{
  requests: MarketplaceModeratedRequest[];
  total: number;
}> {
  const { data, count, error } = await supabase.from("marketplace_service_requests")
    .select(LEAD_COLUMNS + ",buyer_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { requests: (data || []) as MarketplaceModeratedRequest[], total: count || 0 };
}

export async function loadUnionMarketplaceBuyerContacts(userIds: string[]): Promise<MarketplaceUnionBuyer[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.from("marketplace_buyers")
    .select("user_id,full_name,phone").in("user_id", userIds);
  if (error) throw error;
  return (data || []) as MarketplaceUnionBuyer[];
}

export async function moderateMarketplaceRequest(
  id: string, status: "open" | "rejected" | "closed",
): Promise<void> {
  const { data, error } = await supabase.from("marketplace_service_requests")
    .update({ status }).eq("id", id).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Solicitação não encontrada.");
}

export async function sendMarketplaceProposalToUnion(input: {
  requestId: string;
  organizationId: string;
  description: string;
  amount: number | null;
  estimatedDays: number | null;
}): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Faça login no CRM para enviar uma proposta.");
  const { error } = await supabase.from("marketplace_service_proposals").insert({
    request_id: input.requestId,
    organization_id: input.organizationId,
    submitted_by: user.id,
    description: input.description.trim(),
    amount: input.amount,
    estimated_days: input.estimatedDays,
    status: "submitted",
  });
  if (error?.code === "23505") throw new Error("Sua empresa já enviou uma proposta para essa solicitação.");
  if (error) throw error;
}

export async function loadUnionMarketplaceProposals(): Promise<MarketplaceProposal[]> {
  const { data, error } = await supabase.from("marketplace_service_proposals")
    .select(PROPOSAL_COLUMNS).order("created_at", { ascending: false }).limit(150);
  if (error) throw error;
  return (data || []) as MarketplaceProposal[];
}

export async function loadCompanyMarketplaceProposals(organizationId: string): Promise<MarketplaceProposal[]> {
  const { data, error } = await supabase.from("marketplace_service_proposals")
    .select(PROPOSAL_COLUMNS).eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []) as MarketplaceProposal[];
}

export async function moderateMarketplaceProposal(
  id: string, status: "presented" | "rejected" | "withdrawn" | "confirmed",
): Promise<void> {
  const { data, error } = await supabase.from("marketplace_service_proposals")
    .update({ status }).eq("id", id).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Proposta não encontrada.");
}

export async function loadBuyerMarketplaceProposals(requestIds: string[]): Promise<MarketplaceBuyerProposal[]> {
  if (requestIds.length === 0) return [];
  const { data, error } = await marketplaceBuyerClient.from("marketplace_service_proposals")
    .select(BUYER_PROPOSAL_COLUMNS).in("request_id", requestIds)
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []) as MarketplaceBuyerProposal[];
}

export async function respondToMarketplaceProposal(id: string, status: "accepted" | "declined"): Promise<void> {
  const { data, error } = await marketplaceBuyerClient.from("marketplace_service_proposals")
    .update({ status }).eq("id", id).eq("status", "presented")
    .select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Esta proposta não está mais aguardando sua resposta.");
}
