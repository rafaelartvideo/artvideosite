/** Dados de fixação são preferência local de interface, nunca alteram saldo financeiro. */
export function parsePinnedFinanceAccounts(value) {
  if (!value) return [];
  try {
    const decoded = JSON.parse(value);
    return Array.isArray(decoded)
      ? [...new Set(decoded.filter(id => typeof id === "string" && id.trim()).map(id => id.trim()))]
      : [];
  } catch {
    return [];
  }
}

export function prioritizePinnedFinanceAccounts(accounts, pinnedIds) {
  const pinned = new Set(pinnedIds);
  return [...accounts].sort((left, right) =>
    Number(pinned.has(right.id)) - Number(pinned.has(left.id)));
}
