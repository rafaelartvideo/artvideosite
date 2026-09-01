export type OrderStatusCandidate = {
  name?: string | null;
  sort_order?: number | null;
};

export function initialOrderStatus<T extends OrderStatusCandidate>(statuses: T[]): T | null {
  const ordered = [...statuses].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  return ordered.find(status => /abert|novo|recebid|pendente/i.test(status.name || "")) ?? ordered[0] ?? null;
}
