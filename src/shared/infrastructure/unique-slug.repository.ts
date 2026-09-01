import { supabase } from "@/lib/supabase";
import { slugify } from "@/shared/domain/formatters";

type SlugTable = "service_categories" | "product_categories" | "products" | "brands";

export async function generateUniqueSlug(table: SlugTable, value: string, excludeId?: string) {
  const baseSlug = slugify(value);
  const { data, error } = await supabase.from(table).select("id, slug");
  if (error) throw error;

  const existingSlugs = new Set((data || []).filter((item: any) => item.id !== excludeId).map((item: any) => item.slug));
  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}
