/** Condição comercial de cada produto e de cada variação; não confundir com estado da OS. */
export type ProductCondition = "new" | "used" | "refurbished";
export const PRODUCT_CONDITION_OPTIONS: Array<{ value: ProductCondition; label: string }> = [
  { value: "new", label: "Novo" },
  { value: "used", label: "Usado" },
  { value: "refurbished", label: "Recondicionado" },
];
export function productConditionLabel(value: string | null | undefined): string {
  return PRODUCT_CONDITION_OPTIONS.find(item => item.value === value)?.label || "Novo";
}
