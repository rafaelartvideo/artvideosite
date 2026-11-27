import { resolveFiscalScope } from "./account-policy.mjs";

// Internal backend service only. The caller must authenticate via Supabase Auth.
// Dependencies read trusted records and secrets; never resolve scope from client
// claims, client-supplied account identifiers or user_metadata.
// This service exposes only the read contract; emission remains disconnected.
export function createFiscalDocumentService({ loadAccess, loadProvider }) {
  if (typeof loadAccess !== "function" || typeof loadProvider !== "function") throw new TypeError("Dependências fiscais inválidas");
  async function scoped({ actorId, organizationId, bindingId }) {
    if (![actorId, organizationId, bindingId].every(v => typeof v === "string" && v.trim().length > 0)) throw new Error("FISCAL_ACCESS_DENIED");
    const access = await loadAccess({ actorId, organizationId, bindingId, permission: "fiscal.documents.view" });
    if (!access || access.binding?.id !== bindingId ||
        access.binding?.cnpj !== access.verifiedCnpj ||
        access.binding?.externalCompanyId !== access.verifiedExternalCompanyId ||
        access.inventoryVerified !== true) throw new Error("FISCAL_ACCESS_DENIED");
    const decision = resolveFiscalScope({
      tenantId: organizationId,
      binding: access.binding,
      account: access.account,
      tenantFiscalEnabled: access.tenantFiscalEnabled,
      membershipVerified: access.membershipVerified,
      permissionGranted: access.permissionGranted,
    });
    if (!decision.allowed) throw new Error(decision.code);
    const provider = await loadProvider({ accountId: decision.scope.accountId });
    if (!provider) throw new Error("FISCAL_PROVIDER_UNAVAILABLE");
    return { provider, cnpj: decision.scope.cnpj };
  }
  return Object.freeze({
    async listDocuments(context, { type, cursor = 0, limit = 50, filters = {} }) {
      const { provider, cnpj } = await scoped(context);
      return provider.listDocuments({ type, cnpj, cursor, limit, filters });
    },
    async getXml(context, { type, id }) {
      // A separate permission is required for downloading original fiscal XML.
      // The verified scope must be resolved again, not cached in the browser.
      const { provider, cnpj } = await scoped(context);
      const access = await loadAccess({ actorId: context.actorId, organizationId: context.organizationId, bindingId: context.bindingId, permission: "fiscal.documents.download" });
      const decision = resolveFiscalScope({
        tenantId: context.organizationId, binding: access?.binding, account: access?.account,
        tenantFiscalEnabled: access?.tenantFiscalEnabled, membershipVerified: access?.membershipVerified,
        permissionGranted: access?.permissionGranted,
      });
      if (!decision.allowed || access?.binding?.id !== context.bindingId ||
          access?.inventoryVerified !== true || access?.verifiedCnpj !== cnpj ||
          decision.scope.cnpj !== cnpj || access.verifiedExternalCompanyId !== decision.scope.externalCompanyId) {
        throw new Error("FISCAL_ACCESS_DENIED");
      }
      // Reload using the latest verified account to avoid a stale credential scope.
      const currentProvider = await loadProvider({ accountId: decision.scope.accountId });
      if (!currentProvider) throw new Error("FISCAL_PROVIDER_UNAVAILABLE");
      return currentProvider.getXml({ type, cnpj, id });
    },
  });
}
