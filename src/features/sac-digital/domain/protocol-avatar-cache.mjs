// Avatares de contatos SAC são injetados apenas nas listas já autorizadas
// pelo servidor. Não usar storage persistente nem compartilhar entre empresas.
export function createProtocolAvatarCache({ ttlMs = 15 * 60_000, maxScopes = 4 } = {}) {
  const scopes = new Map();

  const contactOf = row => Array.isArray(row?.contact) ? row.contact[0] : row?.contact;
  const scopeFor = scope => {
    let cache = scopes.get(scope);
    if (!cache) {
      cache = new Map();
    } else {
      scopes.delete(scope); // LRU do escopo ativo
    }
    scopes.set(scope, cache);
    while (scopes.size > maxScopes) scopes.delete(scopes.keys().next().value);
    return cache;
  };

  return {
    hasScope(scope) { return Boolean(scope && scopes.has(scope)); },
    capture(scope, rows, now = Date.now()) {
      if (!scope) return;
      const cache = scopeFor(scope);
      for (const row of rows) {
        const contact = contactOf(row);
        if (!contact?.id || !Object.prototype.hasOwnProperty.call(contact, "avatar_url")) continue;
        cache.set(String(contact.id), {
          url: contact.avatar_url ?? null,
          version: contact.updated_at ?? null,
          fetchedAt: now,
        });
      }
    },
    staleIds(scope, rows, now = Date.now()) {
      const cache = scopes.get(scope);
      const missing = new Set();
      for (const row of rows) {
        const contact = contactOf(row);
        if (!contact?.id) continue;
        const id = String(contact.id);
        const cached = cache?.get(id);
        if (!cached || cached.version !== (contact.updated_at ?? null)
          || now - cached.fetchedAt >= ttlMs) missing.add(id);
      }
      return [...missing];
    },
    get(scope, contactId) {
      return scopes.get(scope)?.get(String(contactId));
    },
  };
}
