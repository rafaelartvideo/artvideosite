/** Rejeita duplicações novas sem bloquear duplicidades históricas já salvas.
 * Os nomes antigos são comparados normalizados, preservando IDs e vínculos.
 */
export function findIntroducedDuplicateNameIndices(items, originalNamesById, normalizeName) {
  const indicesByName = new Map();
  items.forEach((item, index) => {
    const key = normalizeName(item.name);
    if (!key) return;
    const indices = indicesByName.get(key) || [];
    indices.push(index);
    indicesByName.set(key, indices);
  });
  const conflicts = new Set();
  for (const [key, indices] of indicesByName) {
    if (indices.length < 2) continue;
    const introduced = indices.some(index => {
      const item = items[index];
      const previous = item.id ? originalNamesById.get(item.id) : undefined;
      return previous === undefined || normalizeName(previous) !== key;
    });
    if (introduced) indices.forEach(index => conflicts.add(index));
  }
  return conflicts;
}
