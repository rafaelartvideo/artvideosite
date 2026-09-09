import { supabase } from "@/lib/supabase";

export const loadOrdersReferenceData = (organizationId: string) => Promise.all([
  supabase.from("order_statuses").select("id,name,color,sort_order").eq("organization_id", organizationId).order("sort_order"),
  supabase.from("os_situations").select("id,name,color,hours,sort_order").eq("organization_id", organizationId).eq("is_active", true).order("sort_order"),
  supabase.from("profiles").select("id,full_name").order("full_name"),
  supabase.from("services").select("id,title").eq("is_active", true).order("title"),
  supabase.from("brands").select("id,name").eq("is_active", true).order("name"),
  supabase.from("products").select("id,name").eq("is_active", true).order("name"),
  supabase.from("equipment_types").select("id,name").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
  supabase.from("equipment_brands").select("id,name,equipment_type_id").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
  supabase.from("equipment_models").select("id,name,equipment_brand_id").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
  supabase.from("technical_fields").select("id,field_key,label,field_type,is_active,sort_order").eq("organization_id", organizationId).order("sort_order").order("label"),
  supabase.from("equipment_type_technical_fields").select("equipment_type_id,technical_field_id,required,sort_order,technical_field:technical_fields(id,field_key,label,field_type,is_active,sort_order)").eq("organization_id", organizationId).order("sort_order"),
  supabase.from("employees").select("id,full_name,is_active").eq("organization_id", organizationId).eq("is_active", true).order("full_name"),
  supabase.from("general_services").select("id,name,price,max_discount_percentage,is_active,sort_order").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
  supabase.from("service_types").select("id,title,description,forecast_days,is_active,sort_order").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("title"),
  supabase.from("service_type_situations").select("service_type_id,situation_id,use_default_hours,sla_hours,sort_order,situation:os_situations(id,name,color,hours,is_active)").eq("organization_id", organizationId).order("sort_order"),
]);
