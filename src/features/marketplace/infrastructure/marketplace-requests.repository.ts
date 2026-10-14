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
  status: "open" | "cancelled" | "closed";
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
      status: "open",
    }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function cancelMyMarketplaceRequest(userId: string, id: string) {
  const { data, error } = await marketplaceBuyerClient.from("marketplace_service_requests")
    .update({ status: "cancelled" }).eq("id", id).eq("buyer_id", userId)
    .eq("status", "open").select("id").maybeSingle();
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
