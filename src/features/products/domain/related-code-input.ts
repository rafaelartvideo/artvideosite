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

/** Validação das linhas individuais, mantendo o tipo selecionado para cada código. */
export function validateTypedRelatedCodes(
  rows: RelatedProductCode[],
  manufacturerCode: string,
): { codes: RelatedProductCode[]; error: string | null } {
  if (rows.length > 100) return { codes: [], error: "Informe no máximo 100 códigos relacionados." };
  const allowedTypes = new Set<RelatedProductCode["relation_type"]>([
    "previous", "successor", "compatible", "alternate", "similar", "generic",
  ]);
  const codes = rows.map(row => ({
    code: String(row.code || "").trim().toUpperCase(),
    relation_type: row.relation_type,
  }));
  if (codes.some(row => !/^[A-Z0-9][A-Z0-9 ./_-]{1,63}$/.test(row.code))) {
    return { codes, error: "Preencha cada código com 2 a 64 caracteres (letras, números e . / _ -), ou remova a linha vazia." };
  }
  if (codes.some(row => !allowedTypes.has(row.relation_type))) {
    return { codes, error: "Selecione um tipo de relação válido para cada código." };
  }
  const seen = new Set<string>();
  if (codes.some(row => seen.has(row.code) ? true : (seen.add(row.code), false))) {
    return { codes, error: "Não repita o mesmo código relacionado." };
  }
  if (codes.some(row => row.code === manufacturerCode.trim().toUpperCase())) {
    return { codes, error: "Não repita o código principal do fabricante nos relacionados." };
  }
  return { codes, error: null };
}
