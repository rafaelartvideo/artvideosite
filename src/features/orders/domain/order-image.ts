export type OrderImageKind = "equipment" | "label" | "solution";

export type OrderImage = {
  key: string;
  mediaId?: string;
  url?: string;
  file?: File;
  name: string;
  kind?: OrderImageKind;
};

export const EQUIPMENT_LABEL_SORT_BASE = 500;
export const SOLUTION_IMAGE_SORT_BASE = 1000;

export function orderImageKindFromSortOrder(sortOrder: unknown): OrderImageKind {
  const value = Number(sortOrder ?? 0);
  if (value >= SOLUTION_IMAGE_SORT_BASE) return "solution";
  if (value >= EQUIPMENT_LABEL_SORT_BASE) return "label";
  return "equipment";
}

export function orderImageSortOrder(kind: OrderImageKind | undefined, index: number) {
  if (kind === "solution") return SOLUTION_IMAGE_SORT_BASE + index;
  if (kind === "label") return EQUIPMENT_LABEL_SORT_BASE + index;
  return index;
}
