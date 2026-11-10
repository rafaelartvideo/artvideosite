import { supabase } from "@/lib/supabase";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";

export type InventoryCatalogKind = "category" | "subcategory" | "brand" | "device_type" | "device_brand";

export type InventoryCatalogOption = {
  id: string;
  name: string;
  is_active: boolean;
  category_id?: string;
  sort_order?: number;
};

export type InventoryCatalogSettings = {
  categories: InventoryCatalogOption[];
  subcategories: InventoryCatalogOption[];
  brands: InventoryCatalogOption[];
  deviceTypes: InventoryCatalogOption[];
  deviceBrands: InventoryCatalogOption[];
};

const tables: Record<InventoryCatalogKind, string> = {
  category: "product_categories",
  subcategory: "product_subcategories",
  brand: "brands",
  device_type: "inventory_device_types",
  device_brand: "inventory_device_brands",
};

export async function listInventoryCatalogSettings(organizationId: string): Promise<InventoryCatalogSettings> {
  if (!organizationId) return { categories: [], subcategories: [], brands: [], deviceTypes: [], deviceBrands: [] };
  const kinds: InventoryCatalogKind[] = ["category", "subcategory", "brand", "device_type", "device_brand"];
  const results = await Promise.all(kinds.map(async kind => {
    const columns = kind === "subcategory" ? "id,name,is_active,sort_order,category_id" : "id,name,is_active,sort_order";
    const { data, error } = await supabase.from(tables[kind])
      .select(columns)
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data || []) as InventoryCatalogOption[];
  }));
  return {
    categories: results[0], subcategories: results[1], brands: results[2],
    deviceTypes: results[3], deviceBrands: results[4],
  };
}

export async function createInventoryCatalogOption(
  organizationId: string,
  kind: InventoryCatalogKind,
  name: string,
  categoryId?: string,
): Promise<InventoryCatalogOption> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!organizationId || !trimmed) throw new Error("Informe o nome do cadastro.");
  const maxLength = kind === "device_type" ? 60 : kind === "device_brand" ? 80 : 100;
  if (trimmed.length > maxLength) throw new Error("Nome longo demais para este cadastro.");
  if (kind === "subcategory" && !categoryId) throw new Error("Escolha a categoria da subcategoria.");

  const table = tables[kind];
  if (kind !== "subcategory") {
    const { data: existing, error: existingError } = await supabase.from(table)
      .select("id,name,is_active")
      .eq("organization_id", organizationId)
      .ilike("name", trimmed)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) {
      if (existing.is_active === false) {
        const { error } = await supabase.from(table).update({ is_active: true })
          .eq("organization_id", organizationId).eq("id", existing.id);
        if (error) throw error;
      }
      return { id: String(existing.id), name: String(existing.name), is_active: true };
    }
  }
  if (kind === "subcategory") {
    const { data: sub, error: subError } = await supabase.from(table)
      .select("id,name,is_active").eq("organization_id", organizationId)
      .eq("category_id", categoryId!).ilike("name", trimmed).maybeSingle();
    if (subError) throw subError;
    if (sub?.id) {
      if (sub.is_active === false) {
        const { error } = await supabase.from(table).update({ is_active: true })
          .eq("organization_id", organizationId).eq("id", sub.id);
        if (error) throw error;
      }
      return { id: String(sub.id), name: String(sub.name), is_active: true, category_id: categoryId };
    }
  }

  const payload: Record<string, unknown> = {
    organization_id: organizationId,
    name: trimmed,
    is_active: true,
  };
  if (kind === "subcategory") payload.category_id = categoryId;
  if (kind === "category" || kind === "brand") payload.slug = await generateUniqueSlug(table, trimmed);
  const { data, error } = await supabase.from(table).insert(payload).select("id,name,is_active").single();
  if (error) throw error;
  return { id: String(data.id), name: String(data.name), is_active: true, ...(categoryId ? { category_id: categoryId } : {}) };
}

export async function updateInventoryCatalogOption(
  organizationId: string,
  kind: InventoryCatalogKind,
  id: string,
  patch: { name?: string; is_active?: boolean },
) {
  const next = { ...patch, updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    next.name = patch.name.trim().replace(/\s+/g, " ");
    if (!next.name) throw new Error("Informe o nome do cadastro.");
    const maxLength = kind === "device_type" ? 60 : kind === "device_brand" ? 80 : 100;
    if (next.name.length > maxLength) throw new Error("Nome longo demais para este cadastro.");
  }
  const { data, error } = await supabase.from(tables[kind]).update(next)
    .eq("organization_id", organizationId).eq("id", id).select("id").single();
  if (error) throw error;
  if (!data?.id) throw new Error("Cadastro não encontrado nesta empresa.");
}
