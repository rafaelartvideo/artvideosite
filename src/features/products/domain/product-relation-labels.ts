/** Rótulos unificados: um produto pode aparecer a partir de qualquer ponta da relação. */
export const RELATED_CODE_TYPE_OPTIONS = [
  { value: "previous", label: "Código antigo (substituído pelo atual)" },
  { value: "successor", label: "Código novo (substitui o atual)" },
  { value: "similar", label: "Produto similar" },
  { value: "generic", label: "Produto genérico" },
  { value: "alternate", label: "Outra referência do mesmo produto" },
] as const;

export const DEFAULT_RELATED_CODE_TYPE = RELATED_CODE_TYPE_OPTIONS[0].value;
export type ProductRelationType =
  | "previous" | "successor" | "similar" | "generic" | "original"
  | "alternate" | "parent" | "variation";

const relationLabels: Record<ProductRelationType, string> = {
  previous: "Código antigo",
  successor: "Código novo",
  similar: "Produto similar",
  generic: "Produto genérico",
  original: "Produto original",
  alternate: "Outra referência",
  parent: "Produto principal",
  variation: "Variação",
};

export function productRelationLabel(value: string | null | undefined): string {
  if (value === "compatible") return relationLabels.alternate; // legado, não cadastrável
  return relationLabels[value as ProductRelationType] || relationLabels.alternate;
}
