import type { RelatedProductCode } from "../infrastructure/products.repository";

/** Aceita códigos colados em lote, separados por vírgulas, ponto e vírgula ou linhas. */
export function parseRelatedCodesInput(
  text: string,
  existing: RelatedProductCode[] = [],
): RelatedProductCode[] {
  const previousTypes = new Map(existing.map(item => [item.code.trim().toUpperCase(), item.relation_type]));
  const seen = new Set<string>();
  const codes: RelatedProductCode[] = [];
  for (const item of text.split(/[,;\n\r]+/)) {
    const code = item.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push({ code, relation_type: previousTypes.get(code) || "alternate" });
  }
  return codes;
}

export function validateRelatedCodesInput(
  text: string,
  manufacturerCode: string,
  existing: RelatedProductCode[] = [],
): { codes: RelatedProductCode[]; error: string | null } {
  const codes = parseRelatedCodesInput(text, existing);
  if (codes.length > 100) return { codes, error: "Informe no máximo 100 códigos relacionados." };
  if (codes.some(item => !/^[A-Z0-9][A-Z0-9 ./_-]{1,63}$/.test(item.code))) {
    return { codes, error: "Revise os códigos: use de 2 a 64 caracteres, letras, números e . / _ -." };
  }
  if (codes.some(item => item.code === manufacturerCode.trim().toUpperCase())) {
    return { codes, error: "Não repita o código principal do fabricante nos relacionados." };
  }
  return { codes, error: null };
}
