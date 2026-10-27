import { supabase } from "@/lib/supabase";

export type SiteAddress = {
  id: string;
  user_id: string;
  label: string;
  postal_code: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  is_default: boolean;
};
export type SiteAddressInput = Omit<SiteAddress, "id" | "user_id">;
export type SiteProfile = { full_name: string; cpf: string | null; phone: string | null };

export function formatSitePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (!digits) return "";
  const ddd = digits.slice(0, 2), rest = digits.slice(2);
  if (digits.length <= 2) return "(" + digits;
  const start = digits.length > 10 ? 5 : 4;
  return "(" + ddd + ") " + rest.slice(0, start) + (rest.length > start ? "-" + rest.slice(start) : "");
}
export function formatSiteZip(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? digits.slice(0, 5) + "-" + digits.slice(5) : digits;
}
export async function loadSiteProfile(userId: string): Promise<SiteProfile | null> {
  const { data, error } = await supabase.from("artvideo_customer_accounts")
    .select("full_name,cpf,phone").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? { full_name: data.full_name || "", cpf: data.cpf, phone: data.phone } : null;
}
export async function updateSiteProfile(profile: { name: string; cpf: string; whatsapp: string }) {
  const { data, error } = await supabase.rpc("artvideo_customer_update_profile_v1", {
    p_name: profile.name.trim(),
    p_cpf: profile.cpf.replace(/\D/g, ""),
    p_phone: profile.whatsapp.replace(/\D/g, ""),
  });
  if (error) throw error;
  return data as { status: string; pending_review: boolean };
}
export async function listSiteAddresses(userId: string): Promise<SiteAddress[]> {
  const { data, error } = await supabase.from("artvideo_customer_addresses")
    .select("id,user_id,label,postal_code,street,number,complement,district,city,state,is_default")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as SiteAddress[];
}
export async function saveSiteAddress(userId: string, input: SiteAddressInput, addressId?: string) {
  const data = { ...input, label: input.label.trim().slice(0, 45), postal_code: input.postal_code.replace(/\D/g, ""),
    street: input.street.trim(), number: input.number.trim(), complement: input.complement?.trim() || null,
    district: input.district.trim(), city: input.city.trim(), state: input.state.trim().toUpperCase() };
  if (data.postal_code.length !== 8 || data.street.length < 3 || !data.number || !data.district || !data.city || !/^[A-Z]{2}$/.test(data.state)) {
    throw new Error("Confira o endereço, CEP e UF.");
  }
  // Clear previous default first (partial unique index ensures no two defaults).
  if (data.is_default) {
    const { error } = await supabase.from("artvideo_customer_addresses").update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
    if (error) throw error;
  }
  const query = addressId
    ? supabase.from("artvideo_customer_addresses").update({ ...data, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", addressId)
    : supabase.from("artvideo_customer_addresses").insert({ ...data, user_id: userId });
  const { data: saved, error } = await query.select("id").single();
  if (error) throw error;
  return saved.id as string;
}
export async function removeSiteAddress(userId: string, id: string) {
  const { error } = await supabase.from("artvideo_customer_addresses").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
