// Ready-to-use query helpers for existing Supabase tables.
// All queries respect RLS policies configured in Supabase.
import { supabase } from "./supabase";
import type { StorageBucket } from "./database.types";

// ── Services ──────────────────────────────────────────────
export const getServices = () =>
  supabase.from("services").select("*, service_variants(*), service_features(*), service_faqs(*)").eq("active", true).order("sort_order");

export const getServiceBySlug = (slug: string) =>
  supabase.from("services").select("*, service_variants(*), service_features(*), service_faqs(*)").eq("slug", slug).eq("active", true).single();

// ── Categories ────────────────────────────────────────────
export const getCategories = () =>
  supabase.from("categories").select("*").eq("active", true).order("sort_order");

// ── Brands ────────────────────────────────────────────────
export const getBrands = () =>
  supabase.from("brands").select("*").eq("active", true).order("sort_order");

// ── Products ──────────────────────────────────────────────
export const getFeaturedProducts = () =>
  supabase.from("products").select("*").eq("active", true).eq("featured", true).order("sort_order");

// ── Quotes ────────────────────────────────────────────────
export const submitQuote = (payload: {
  service_id?: string | null;
  name: string;
  whatsapp: string;
  email?: string | null;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  cep?: string | null;
}) => supabase.from("quotes").insert(payload).select().single();

// ── Contact settings (public) ─────────────────────────────
export const getContactSettings = () =>
  supabase.from("contact_settings").select("*").single();

// ── Site settings ─────────────────────────────────────────
export const getSiteSettings = () =>
  supabase.from("site_settings").select("key, value");

// ── Storage helpers ───────────────────────────────────────
export function getPublicStorageUrl(bucket: StorageBucket, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
