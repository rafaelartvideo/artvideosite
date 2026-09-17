export function filteredRowNumber({ page, pageSize, index }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 1);
  const safeIndex = Math.max(0, Number(index) || 0);
  return (safePage - 1) * safePageSize + safeIndex + 1;
}

export function filteredTotalLabel(total, hasActiveFilters) {
  const count = Math.max(0, Number(total) || 0);
  if (hasActiveFilters) return `Total do filtro: ${count} OS`;
  return `${count} OS encontrada${count === 1 ? "" : "s"}`;
}
