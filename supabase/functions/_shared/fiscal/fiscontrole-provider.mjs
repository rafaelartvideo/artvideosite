// Server-only adapter. No browser imports, credentials, or production writes.
const BASE = "https://www.fiscontrole.com.br/app/api/v1";
const EMISSION = BASE + "/emissao-api/v1";
const TYPES = new Set(["nfe", "nfce", "cte", "nfse", "eventonfe", "eventocte"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CNPJ = /^\d{14}$/;
const EMISSION_READ = new Set(["bootstrap", "catalog", "list", "detail", "download", "panel_detail", "panel_download"]);
const DRAFT = new Set(["create", "save", "validate"]);
const EXTERNAL = new Set(["issue", "process_pending", "event"]);

export class FiscalProviderError extends Error {
  constructor(message, { status = 0, uncertain = false } = {}) {
    super(message);
    this.name = "FiscalProviderError";
    this.status = status;
    this.uncertain = uncertain;
  }
}
function requireThat(condition, message) {
  if (!condition) throw new TypeError(message);
}
function validateContext(company, environment) {
  requireThat(Number.isSafeInteger(company) && company > 0, "Empresa externa inválida");
  requireThat(environment === 1 || environment === 2, "Ambiente inválido");
}
function validObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function createFiscontroleProvider({ token, fetchImpl = globalThis.fetch, timeoutMs = 15000, allowHomologationWrites = false } = {}) {
  requireThat(typeof token === "string" && token.trim() === token && token.length > 0 && !/\s/.test(token), "Token de sessão inválido");
  requireThat(typeof fetchImpl === "function" && Number.isSafeInteger(timeoutMs) && timeoutMs > 0, "Transporte inválido");
  async function post(url, body, { key, emission = false, mutation = false } = {}) {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token };
    if (key) headers["Idempotency-Key"] = key;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal, redirect: "error" });
      if (!response.ok) throw new FiscalProviderError("Falha HTTP do provedor fiscal", { status: response.status, uncertain: mutation && (response.status >= 500 || response.status === 408 || response.status === 429) });
      const result = await response.json();
      if (!validObject(result)) throw new FiscalProviderError("Resposta fiscal inválida", { uncertain: mutation });
      if (emission && result.ok !== true) throw new FiscalProviderError("Operação fiscal não confirmada pelo provedor", { uncertain: mutation });
      return emission ? result.data : result;
    } catch (error) {
      if (error instanceof FiscalProviderError) throw error;
      // Never propagate remote payloads, tokens or raw network errors to clients.
      throw new FiscalProviderError("Comunicação fiscal inconclusiva", { uncertain: mutation });
    } finally {
      clearTimeout(timeout);
    }
  }
  function documentType(type, cnpj) {
    requireThat(TYPES.has(type), "Tipo de documento inválido");
    requireThat(typeof cnpj === "string" && CNPJ.test(cnpj), "CNPJ inválido");
  }
  return Object.freeze({
    provider: "fiscontrole",
    listCompanies: () => post(BASE + "/listadfe/empresa", {}),
    listDocuments({ type, cnpj, cursor = 0, limit = 50, filters = {} }) {
      documentType(type, cnpj);
      requireThat(Number.isSafeInteger(cursor) && cursor >= 0, "Cursor inválido");
      requireThat(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, "Limite inválido");
      requireThat(validObject(filters) && Object.keys(filters).every(k => ["data_ini", "data_fim", "ator"].includes(k)), "Filtros inválidos");
      const { data_ini: start, data_fim: end, ator } = filters;
      if (start !== undefined || end !== undefined) {
        const day = value => {
          if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
          const n = Date.parse(value + "T00:00:00Z");
          return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : NaN;
        };
        const distance = (day(end) - day(start)) / 86400000;
        requireThat(Number.isInteger(distance) && distance >= 0 && distance <= 365, "Período inválido");
      }
      if (ator !== undefined) {
        const actors = { nfe: ["EMIT","DEST","AUT","TRANS"], nfce: ["EMIT","DEST","AUT","TRANS"], cte: ["EMIT","DEST","EXPED","RECEB","REMET","TOMA"], nfse: ["PREST","TOMAD"] };
        requireThat(actors[type]?.includes(ator), "Ator inválido para o modelo");
      }
      return post(BASE + "/documentos-api/v2/" + type + "/listar", { ...filters, cnpj, ultimo_id: cursor, limite: limit });
    },
    getXml({ type, cnpj, id }) {
      documentType(type, cnpj);
      requireThat(Number.isSafeInteger(id) && id > 0, "Identificador de XML inválido");
      return post(BASE + "/documentos-api/v2/" + type + "/xml", { cnpj, id });
    },
    emission({ operation, company, environment, payload = {}, confirm = false, key }) {
      validateContext(company, environment);
      const read = EMISSION_READ.has(operation);
      const draft = DRAFT.has(operation);
      const external = EXTERNAL.has(operation);
      requireThat(read || draft || external, "Operação de emissão desconhecida");
      requireThat(validObject(payload), "Payload inválido");
      requireThat(Object.keys(payload).every(k => !["tenant","client","user","certificate","signature","private_key"].includes(k)), "Contexto fiscal não permitido");
      if (!read) requireThat(environment === 2 && allowHomologationWrites === true, "Escritas fiscais bloqueadas nesta integração");
      if (external) {
        requireThat(confirm === true, "Confirmação explícita obrigatória");
        requireThat(typeof payload.id === "string" && UUID.test(payload.id), "UUID do documento inválido");
        if (operation !== "process_pending") requireThat(typeof key === "string" && UUID.test(key), "Idempotency-Key inválida");
        if (operation === "event") requireThat(["cancel","correct"].includes(payload.kind), "Evento desconhecido");
      }
      const body = { company, environment, payload };
      if (external && operation !== "process_pending") body.confirm = true;
      return post(EMISSION + "/" + operation, body, { key: external && operation !== "process_pending" ? key : undefined, emission: true, mutation: !read });
    },
  });
}

export function isAuthorizedFiscalDocument(detail) {
  // Caller maps the provider detail into this normalized contract only after
  // verifying the exact response schema with the provider.
  return detail?.state === "authorized" && typeof detail.protocol === "string" && detail.protocol.trim().length > 0;
}
