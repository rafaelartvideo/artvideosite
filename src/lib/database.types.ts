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

// ── Media & Storage ──────────────────────────────────────────
export interface Media {
  id: string;
  bucket_name: StorageBucket;
  storage_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  title: g | null;
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

export interface ServiceFaq {
  id: string;
  service_id: string;
  section_id: string | null;
  question: string;
  answer: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceSection {
  id: string;
  service_id: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Products & Categories ───────────────────────────────────
export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id: string | null;
  brand_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string | null;
  price: number | null;
  compare_at_price: number | null;
  cover_media_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  external_platform: string | null;
  external_product_id: string | null;
  external_url: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Customers ────────────────────────────────────────────────────
export interface Customer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  document: string | null;
  created_at: string;
  updated_at: string;
}

// ── Quote Requests & Status ──────────────────────────────────
export interface RequestStatus {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteRequest {
  id: string;
  protocol: string | null;
  customer_id: string | null;
  service_id: string | null;
  product_id: string | null;
  brand_id: string | null;
  status_id: string | null;
  estimated_price: number | null;
  final_price: number | null;
  customer_message: string | null;
  assigned_to: string | null;
  requested_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteRequestItem {
  id: string;
  quote_request_id: string;
  service_variant_id: string | null;
  title_snapshot: string;
  description_snapshot: string | null;
  price_snapshot: number | null;
  quantity: number;
  subtotal: number | null;
  created_at: string;
}
export interface QuoteStatusHistory {
  id: string;
  quote_request_id: string;
  status_id: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Service Orders & Status ──────────────────────────────────
export interface OrderStatus {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OsSituation {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceOrder {
  id: string;
  quote_request_id: string | null;
  customer_id: string | null;
  status_id: string | null;
  situation_id: string | null;
  title: string;
  description: string | null;
  diagnosis: string | null;
  solution: string | null;
  notes: string | null;
  protocol: string | null;
  priority: "baixa" | "normal" | "alta" | "urgente";
  origin: string | null;
  brand_id: string | null;
  product_id: string | null;
  model: string | null;
  serial_number: string | null;
  accessories: string | null;
  equipment_condition: string | null;
  assigned_to: string | null;
  estimated_price: number | null;
  final_price: number | null;
  scheduled_date: string | null;
  completion_date: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceOrderItem {
  id: string;
  service_order_id: string;
  service_id: string;
  quantity: number;
  unit_price: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceOrderNote {
  id: string;
  service_order_id: string;
  note: string;
  is_internal: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ServiceOrderStatusHistory {
  id: string;
  service_order_id: string;
  status_id: string;
  is_visible_to_customer: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Contact & Settings ───────────────────────────────────────
export interface ContactField {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  placeholder: string | null;
  is_active: boolean;
  is_required: boolean;
  validation_rules: Json | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SiteSettings {
  id: string;
  setting_key: string;
  setting_value: string | null;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Filters & Navigation ─────────────────────────────────────
export interface Filter {
  id: string;
  name: string;
  slug: string;
  filter_type: "select" | "checkbox" | "radio" | "range" | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FilterOption {
  id: string;
  filter_id: string;
  name: string;
  value: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceFilterOption {
  id: string;
  service_id: string;
  filter_option_id: string;
  created_at: string;
}

export interface NavigationItem {
  id: string;
  label: string;
  url: string;
  parent_id: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Site Pages & Content ─────────────────────────────────────
export interface SitePage {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  is_published: boolean;
  meta_description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SitePageSection {
  id: string;
  page_id: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Storage bucket names already configured in Supabase ───────
export type StorageBucket =
  | "public-assets"
  | "service-images"
  | "product-images"
  | "brand-images"
  | "avatars";
