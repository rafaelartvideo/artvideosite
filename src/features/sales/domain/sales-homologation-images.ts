/**
 * Imagens SVG ilustrativas de homologação pertencem apenas aos SKUs HML26-01..40.
 * Nunca use esse fallback para produtos comerciais reais.
 * Não substitui fotografias salvas no Supabase Storage.
 */
export function salesHomologationImage(sku?: string | null): string | null {
  const code = String(sku || "").trim().toUpperCase();
  if (!/^HML26-(?:0[1-9]|[1-3][0-9]|40)$/.test(code)) return null;
  return "/homolog-sales/" + code + ".svg";
}
