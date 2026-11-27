// One bounded page per invocation. Storage and cursor commits are injected
// trusted backend operations, not browser-controlled callbacks.
const TYPES = new Set(["nfe","nfce","cte","nfse","eventonfe","eventocte"]);
const HEX = /^[0-9a-f]{64}$/i;
function fail(code) { throw new Error(code); }
function assert(condition, code) { if (!condition) fail(code); }
export function fiscalFilterKey(filters = {}) {
  assert(filters && typeof filters === "object" && !Array.isArray(filters), "FISCAL_FILTER_INVALID");
  assert(Object.keys(filters).every(k => ["ator","data_ini","data_fim"].includes(k)), "FISCAL_FILTER_INVALID");
  const ordered = {};
  for (const k of ["ator","data_ini","data_fim"]) if (filters[k] !== undefined) {
    assert(typeof filters[k] === "string" && filters[k].length <= 32, "FISCAL_FILTER_INVALID");
    ordered[k] = filters[k];
  }
  return JSON.stringify(ordered);
}
async function sha256(text) {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");
}

export function createFiscalSyncWorker({ resolveScope, providerFor, loadCursor, storeOriginal, persistPage }) {
  for (const fn of [resolveScope, providerFor, loadCursor, storeOriginal, persistPage]) assert(typeof fn === "function","FISCAL_DEPENDENCY_INVALID");
  return async function syncPage({ bindingId, type, filters = {}, limit = 25 }) {
    assert(TYPES.has(type) && Number.isInteger(limit) && limit >= 1 && limit <= 100,"FISCAL_REQUEST_INVALID");
    const filterKey = fiscalFilterKey(filters);
    const scope = await resolveScope(bindingId);
    assert(scope?.bindingId === bindingId && scope.syncEnabled === true && scope.enabled === true &&
      typeof scope.organizationId === "string" && scope.organizationId.length > 0 &&
      typeof scope.accountId === "string" && scope.accountId.length > 0 &&
      typeof scope.cnpj === "string" && /^[0-9]{14}$/.test(scope.cnpj),"FISCAL_SYNC_DISABLED");
    const cursorScope = { bindingId, organizationId: scope.organizationId, accountId: scope.accountId, cnpj: scope.cnpj, type, filterKey };
    const cursor = await loadCursor(cursorScope);
    assert(Number.isSafeInteger(cursor) && cursor >= 0,"FISCAL_CURSOR_INVALID");
    const provider = await providerFor(scope.accountId);
    const result = await provider.listDocuments({ type, cnpj: scope.cnpj, cursor, limit, filters });
    const items = result?.data;
    const page = result?.paginacao;
    assert(Array.isArray(items) && items.length <= limit && page?.quantidade === items.length &&
      typeof page.tem_mais === "boolean" && Number.isSafeInteger(page.ultimo_id),"FISCAL_PAGE_INVALID");
    let previous = cursor;
    for (const item of items) {
      assert(item?.tipo === type && Number.isSafeInteger(item.id) && item.id > previous &&
        typeof item.chave === "string" && item.chave.length > 0 && item.chave.length <= 256,"FISCAL_PAGE_ITEM_INVALID");
      previous = item.id;
    }
    assert(page.ultimo_id === previous && (!page.tem_mais || items.length > 0),"FISCAL_CURSOR_INCONSISTENT");
    const documents = [];
    for (const item of items) {
      const xml = await provider.getXml({ type, cnpj: scope.cnpj, id: item.id });
      assert(xml?.id === item.id && xml.tipo === type && xml.chave === item.chave &&
        typeof xml.dfe === "string" && xml.dfe.length > 0 && typeof xml.sha256 === "string" && HEX.test(xml.sha256),"FISCAL_XML_INVALID");
      // Never parse XML here; retain original bytes and avoid XXE. Size limit
      // protects workers; larger documents need an explicitly reviewed path.
      assert(new TextEncoder().encode(xml.dfe).byteLength <= 10 * 1024 * 1024,"FISCAL_XML_TOO_LARGE");
      const digest = await sha256(xml.dfe);
      assert(digest === xml.sha256.toLowerCase(),"FISCAL_XML_CHECKSUM_MISMATCH");
      const storageKey = [scope.organizationId,bindingId,type,String(item.id),digest+".xml"].join("/");
      await storeOriginal({ scope: cursorScope, storageKey, xml: xml.dfe, sha256: digest });
      documents.push({ providerId: item.id, fiscalKey: item.chave, storageKey, sha256: digest, issuedAtRaw: typeof item.data === "string" ? item.data : null });
    }
    // Atomic upserts and compare-and-swap of the cursor belong in persistPage.
    // If the cursor changed, reject; deterministic storage keys support safe replay.
    if (documents.length) {
      const currentScope = await resolveScope(bindingId);
      assert(currentScope?.enabled === true && currentScope.syncEnabled === true &&
        currentScope.bindingId === bindingId && currentScope.organizationId === scope.organizationId &&
        currentScope.accountId === scope.accountId && currentScope.cnpj === scope.cnpj,"FISCAL_SCOPE_CHANGED");
      assert(await persistPage({ scope: cursorScope, expectedCursor: cursor, nextCursor: previous, documents }) === true,"FISCAL_CURSOR_CONFLICT");
    }
    return { processed: documents.length, cursor: previous, hasMore: page.tem_mais };
  };
}
