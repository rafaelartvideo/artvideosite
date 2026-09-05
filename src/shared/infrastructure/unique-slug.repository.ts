import { supabase } from "@/lib/supabase";
import { slugify } from "@/shared/domain/formatters";

export type SlugTable =
  | "service_categories"
  | "product_categories"
  | "products"
  | "brands"
  | "services"
  | "order_situations"
  | "equipment_types"
  | "equipment_brands"
  | "equipment_models";

export async function generateUniqueSlug(table: SlugTable, value: string, excludeId?: string) {
  const baseSlug = slugify(value) || "item";
  const { data, error } = await supabase.from(table).select("id, slug");
  if (error) throw error;

  const existingSlugs = new Set(
    (data || [])
      .filter((item: any) => item.id !== excludeId)
      .map((item: any) => String(item.slug || "").trim())
      .filter(Boolean),
  );

  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}
