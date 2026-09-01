// Types reflecting the existing Supabase schema.
// Do NOT modify the database schema — these types are read-only descriptors.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ── Profiles & Auth ──────────────────────────────────────────
export interface Profile {
  id: string;
  full_name: string | null;
  avatar_media_id: string | null;
  role_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface Employee {
  id: string;
  profile_id: string | null;
  role_id: string | null;
  full_name: string;
  cpf: string;
  phone: string | null;
  function_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeneralService {
  id: string;
  name: string;
  price: number | null;
  max_discount_percentage: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Media & Storage ──────────────────────────────────────────
export interface Media {
  id: string;
  bucket_id: string | null;
  bucket_name?: string | null;
  storage_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// ── Brands ───────────────────────────────────────────────────
export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_media_id: string | null;
  website_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EquipmentType {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EquipmentBrand {
  id: string;
  equipment_type_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EquipmentModel {
  id: string;
  equipment_brand_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Service Categories ───────────────────────────────────────
export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Services & Related ───────────────────────────────────────
export interface Service {
  id: string;
  category_id: string | null;
  brand_id: string | null;
  product_id: string | null;
  title: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  cover_media_id: string | null;
  base_price: number | null;
  price_mode: "FIXED" | "STARTING_FROM" | "QUOTE" | "HIDDEN" | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceVariant {
  id: string;
  service_id: string;
  title: string | null;
  icon: string | null;
  price: number | null;

  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceInclusion {
  id: string;
  service_id: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceExclusion {
  id: string;
  service_id: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServicePriceFactor {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  impact: "increase" | "decrease";
  amount: number;
  unit: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
