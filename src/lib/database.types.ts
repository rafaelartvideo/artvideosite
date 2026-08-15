// Types reflecting the existing Supabase schema.
// Do NOT modify the database schema — these types are read-only descriptors.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  active: boolean;
  sort_order: number;
}

export interface Service {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  active: boolean;
  featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceVariant {
  id: string;
  service_id: string;
  label: string;
  price: number | null;
  price_note: string | null;
  sort_order: number;
}

export interface ServiceFeature {
  id: string;
  service_id: string;
  description: string;
  sort_order: number;
}

export interface ServiceFaq {
  id: string;
  service_id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  active: boolean;
  featured: boolean;
  sort_order: number;
  created_at: string;
}

export interface Quote {
  id: string;
  service_id: string | null;
  user_id: string | null;
  name: string;
  whatsapp: string;
  email: string | null;
  brand: string | null;
  model: string | null;
  description: string | null;
  cep: string | null;
  status: string;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string | null;
  status: string;
  total: number | null;
  created_at: string;
}

export interface SiteSettings {
  id: string;
  key: string;
  value: Json;
  updated_at: string;
}

export interface ContactSettings {
  id: string;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  address: string | null;
  business_hours: string | null;
}

// Storage bucket names already configured in Supabase
export type StorageBucket =
  | "public-assets"
  | "service-images"
  | "product-images"
  | "brand-images"
  | "avatars";
