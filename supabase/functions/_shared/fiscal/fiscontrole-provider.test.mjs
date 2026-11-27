import test from "node:test";
import assert from "node:assert/strict";
import { createFiscontroleProvider, FiscalProviderError, isAuthorizedFiscalDocument } from "./fiscontrole-provider.mjs";

const id = "11111111-2222-4333-8444-555555555555";
const key = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const cnpj = "12345678000199";
function fixture(extra = {}) {
  const calls = [];
  const provider = createFiscontroleProvider({
    token: "test-only",
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ ok: true, data: { id } }), { status: 200 });
    }, ...extra,
  });
  return { provider, calls };
}
test("v2 listing keeps filters and cursor scoped and sends bearer only", async () => {
  const { provider, calls } = fixture();
  await provider.listDocuments({ type: "nfse", cnpj, cursor: 42, limit: 100, filters: { ator: "PREST", data_ini: "2026-01-01", data_fim: "2026-12-31" } });
  assert.equal(calls[0].url, "https://www.fiscontrole.com.br/app/api/v1/documentos-api/v2/nfse/listar");
  assert.equal(calls[0].headers.Authorization, "Bearer test-only");
  assert.deepEqual(calls[0].body, { cnpj, ultimo_id: 42, limite: 100, ator: "PREST", data_ini: "2026-01-01", data_fim: "2026-12-31" });
});
test("invalid filters, path traversal, dates and IDs never call the provider", () => {
  const { provider, calls } = fixture();
  for (const input of [
    { type: "../xml", cnpj }, { type: "nfe", cnpj, limit: 101 },
    { type: "nfe", cnpj, filters: { pagina: 1 } },
    { type: "nfe", cnpj, filters: { data_ini: "2026-02-30", data_fim: "2026-03-01" } },
    { type: "nfe", cnpj, filters: { data_ini: "2026-01-01" } },
    { type: "nfse", cnpj, filters: { ator: "DEST" } },
    { type: "eventonfe", cnpj, filters: { ator: "EMIT" } },
  ]) assert.throws(() => provider.listDocuments(input), TypeError);
  assert.throws(() => provider.getXml({ type: "nfse", cnpj, id: 0 }), TypeError);
  assert.equal(calls.length, 0);
});
test("bootstrap is read-only; all writes blocked by default", async () => {
  const { provider, calls } = fixture();
  await provider.emission({ operation: "bootstrap", company: 12, environment: 2 });
  assert.equal(calls[0].url, "https://www.fiscontrole.com.br/app/api/v1/emissao-api/v1/bootstrap");
  for (const operation of ["create", "save", "validate", "issue", "event", "process_pending"]) {
    assert.throws(() => provider.emission({ operation, company: 12, environment: 2 }), /bloqueadas/);
  }
  assert.equal(calls.length, 1);
});
test("production writes remain blocked even when homologation is enabled", () => {
  const { provider, calls } = fixture({ allowHomologationWrites: true });
  assert.throws(() => provider.emission({ operation: "issue", company: 12, environment: 1, payload: { id }, confirm: true, key }), /bloqueadas/);
  assert.equal(calls.length, 0);
});
test("homologation issue preserves caller-supplied idempotency key and requires explicit confirmation", async () => {
  const { provider, calls } = fixture({ allowHomologationWrites: true });
  const input = { operation: "issue", company: 12, environment: 2, payload: { id }, confirm: true, key };
  assert.throws(() => provider.emission({ ...input, confirm: false }), /Confirmação/);
  assert.throws(() => provider.emission({ ...input, key: undefined }), /Idempotency/);
  await provider.emission(input);
  await provider.emission(input);
  assert.deepEqual(calls[0].body, { company: 12, environment: 2, payload: { id }, confirm: true });
  assert.equal(calls[0].headers["Idempotency-Key"], key);
  assert.equal(calls[1].headers["Idempotency-Key"], key);
});
test("processing is not implicitly triggered and requires its own explicit authorization", async () => {
  const { provider, calls } = fixture({ allowHomologationWrites: true });
  assert.throws(() => provider.emission({ operation: "process_pending", company: 12, environment: 2, payload: { id } }), /Confirmação/);
  await provider.emission({ operation: "process_pending", company: 12, environment: 2, payload: { id }, confirm: true });
  assert.deepEqual(calls[0].body, { company: 12, environment: 2, payload: { id } });
});
test("timeout/communication failure never retries automatically or leaks remote text", async () => {
  let attempts = 0;
  const { provider } = fixture({ allowHomologationWrites: true, fetchImpl: async () => { attempts++; throw new Error("secret"); } });
  await assert.rejects(provider.emission({ operation: "issue", company: 12, environment: 2, payload: { id }, confirm: true, key }), error => error instanceof FiscalProviderError && error.uncertain && !error.message.includes("secret"));
  assert.equal(attempts, 1);
});
test("HTTP 200 does not imply authorization; missing protocol fails closed", () => {
  assert.equal(isAuthorizedFiscalDocument({ processed: true }), false);
  assert.equal(isAuthorizedFiscalDocument({ state: "authorized" }), false);
  assert.equal(isAuthorizedFiscalDocument({ state: "authorized", protocol: " " }), false);
  assert.equal(isAuthorizedFiscalDocument({ state: "authorized", protocol: "123" }), true);
});
