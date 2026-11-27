// Pure server-side policy. Inputs MUST come from trusted persisted records, not request bodies.
const validId = v => typeof v === "string" && v.trim().length > 0 && v.trim() === v;
const validCnpj = v => typeof v === "string" && /^\d{14}$/.test(v);
const validExternalId = v => Number.isSafeInteger(v) && v > 0;
const deny = code => ({ allowed: false, code });
const validBinding = b => b && validId(b.tenantId) && validId(b.accountId) && validCnpj(b.cnpj) && validExternalId(b.externalCompanyId);

// Quota is per contracted provider account. Count distinct CNPJs reserved or linked,
// including disabled tenants: turning off UI access does not release a provider slot.
// The persisted inventory must include provider-side CNPJs not yet linked to CRM tenants.
export function checkFiscalAccountCapacity({ account, inventory, candidateCnpj }) {
  if (!account || !validId(account.id) || account.active !== true ||
      !Number.isSafeInteger(account.cnpjLimit) || account.cnpjLimit < 1 ||
      account.inventoryVerified !== true || !Array.isArray(inventory) ||
      !validCnpj(candidateCnpj)) return deny("ACCOUNT_CONFIGURATION_REQUIRED");
  const used = new Set();
  for (const row of inventory) {
    if (!row || row.accountId !== account.id || !validCnpj(row.cnpj)) return deny("ACCOUNT_INVENTORY_INVALID");
    used.add(row.cnpj);
  }
  if (used.size > account.cnpjLimit || (!used.has(candidateCnpj) && used.size >= account.cnpjLimit)) {
    return { ...deny("ACCOUNT_CNPJ_LIMIT"), used: used.size, limit: account.cnpjLimit };
  }
  const projected = used.size + Number(!used.has(candidateCnpj));
  return { allowed: true, used: used.size, projected, limit: account.cnpjLimit, available: account.cnpjLimit - projected };
}

// Existing bound CNPJs may be reused for the same tenant only. Disabled bindings
// continue reserving their identity; explicit audited unlinking is a separate workflow.
export function checkFiscalBinding({ account, bindings, inventory, candidate }) {
  if (!validBinding(candidate) || candidate.accountId !== account?.id || !Array.isArray(bindings)) return deny("BINDING_INVALID");
  if (!bindings.every(validBinding)) return deny("BINDING_INVENTORY_INVALID");
  for (const b of bindings) {
    const sameTenant = b.tenantId === candidate.tenantId;
    const sameCnpj = b.cnpj === candidate.cnpj;
    const sameExternal = b.accountId === candidate.accountId && b.externalCompanyId === candidate.externalCompanyId;
    const identical = sameTenant && sameCnpj && sameExternal;
    if (!identical && (sameCnpj || sameExternal)) return deny("BINDING_CONFLICT");
  }
  return checkFiscalAccountCapacity({ account, inventory, candidateCnpj: candidate.cnpj });
}

// Fail closed. Membership, tenant feature flag, permission and account/binding
// state must be loaded by the server for every operation, including background jobs.
// Returns only scoped identifiers, never the shared credential or account-wide inventory.
export function resolveFiscalScope({ tenantId, binding, account, tenantFiscalEnabled, membershipVerified, permissionGranted }) {
  if (!validId(tenantId) || membershipVerified !== true || permissionGranted !== true) return deny("FISCAL_ACCESS_DENIED");
  if (tenantFiscalEnabled !== true) return deny("FISCAL_MODULE_DISABLED");
  if (!validBinding(binding) || binding.tenantId !== tenantId || binding.enabled !== true ||
      account?.id !== binding.accountId || account.active !== true) return deny("FISCAL_BINDING_UNAVAILABLE");
  return { allowed: true, scope: { tenantId, accountId: binding.accountId, cnpj: binding.cnpj, externalCompanyId: binding.externalCompanyId } };
}
