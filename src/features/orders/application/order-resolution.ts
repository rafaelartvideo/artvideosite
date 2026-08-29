export const validateOrderResolution = (
  draft: any,
  inventoryItems: any[],
): string | null => {
  if (draft.cannotSolve && !draft.cannotSolveReason.trim()) {
    return "Informe a justificativa para esta OS não solucionável.";
  }

  const hasInvalidProducts = draft.usedItems.some((item: any) => {
    const stockItem = inventoryItems.find(
      (entry) => entry.id === item.inventory_item_id,
    );
    const requested = Number(item.quantity || 0);
    const approved = Number(item.approved_quantity ?? requested);
    const prewithdrawn = Number(item.prewithdrawn_quantity ?? 0);
    const stockRequired = Math.max(0, requested - prewithdrawn);
    return (
      requested <= 0 ||
      requested > approved ||
      stockRequired > Number(stockItem?.quantity ?? 0)
    );
  });

  return hasInvalidProducts
    ? "Estoque insuficiente em pelo menos um produto. Ajuste a quantidade antes de concluir."
    : null;
};
