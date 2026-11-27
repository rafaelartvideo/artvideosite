import { createFiscalSyncWorker } from "./sync-worker.mjs";
import { createFiscontroleProvider } from "./fiscontrole-provider.mjs";

const bucket = "fiscal-originals";
const deny = () => { throw new Error("FISCAL_SCOPE_UNAVAILABLE"); };
function data(result) {
  if (result.error) throw new Error("FISCAL_PERSISTENCE_UNAVAILABLE");
  return result.data;
}
// Use only a server-owned service client. Never pass a browser client here.
// resolveSecret retrieves a token from a reviewed secret store, not the database.
export function createSupabaseFiscalSync({ admin, resolveSecret, timeoutMs = 15000 }) {
  const resolveScope = async bindingId => {
    const b = data(await admin.from("fiscal_organization_bindings")
      .select("id,organization_id,account_id,cnpj,external_company_id,is_enabled,sync_enabled")
      .eq("id",bindingId).eq("is_enabled",true).eq("sync_enabled",true).maybeSingle());
    if (!b) return deny();
    const [org,module,account,inventory] = await Promise.all([
      admin.from("organizations").select("document").eq("id",b.organization_id).eq("status","active").maybeSingle(),
      admin.from("organization_modules").select("module_key").eq("organization_id",b.organization_id).eq("module_key","fiscal").eq("is_enabled",true).maybeSingle(),
      admin.from("fiscal_provider_accounts").select("id,provider,inventory_verified_at").eq("id",b.account_id).eq("is_active",true).maybeSingle(),
      admin.from("fiscal_account_cnpjs").select("verified_at").eq("account_id",b.account_id).eq("cnpj",b.cnpj).maybeSingle()
    ]);
    if (typeof data(org)?.document !== "string" || org.data.document.replace(/\D/g,"") !== b.cnpj ||
        !data(module) || data(account)?.provider !== "fiscontrole" || !account.data.inventory_verified_at ||
        !data(inventory)?.verified_at) return deny();
    return { bindingId:b.id,organizationId:b.organization_id,accountId:b.account_id,cnpj:b.cnpj,enabled:true,syncEnabled:true };
  };
  return createFiscalSyncWorker({
    resolveScope,
    providerFor: async accountId => {
      const a = data(await admin.from("fiscal_provider_accounts").select("credential_ref").eq("id",accountId)
        .eq("provider","fiscontrole").eq("is_active",true).maybeSingle());
      if (!a) return deny();
      const token = await resolveSecret({ accountId, credentialRef: a.credential_ref });
      return createFiscontroleProvider({token, timeoutMs});
    },
    loadCursor: async s => {
      const row = data(await admin.from("fiscal_sync_cursors").select("last_id")
        .eq("binding_id",s.bindingId).eq("organization_id",s.organizationId)
        .eq("account_id",s.accountId).eq("cnpj",s.cnpj).eq("document_type",s.type)
        .eq("filter_key",s.filterKey).maybeSingle());
      const cursor = row ? Number(row.last_id) : 0;
      if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("FISCAL_CURSOR_INVALID");
      return cursor;
    },
    storeOriginal: async ({storageKey,xml}) => {
      const storage = admin.storage.from(bucket);
      const bytes = new TextEncoder().encode(xml);
      const uploaded = await storage.upload(storageKey, bytes, {contentType:"application/xml",upsert:false});
      if (!uploaded.error) return;
      // A replay may encounter the same immutable object. Verify the entire
      // existing content before accepting; never overwrite on conflict.
      const existing = await storage.download(storageKey);
      if (existing.error || !existing.data || existing.data.size !== bytes.byteLength) throw new Error("FISCAL_STORAGE_UNAVAILABLE");
      const previous = new Uint8Array(await existing.data.arrayBuffer());
      if (!previous.every((byte,index)=>byte===bytes[index])) throw new Error("FISCAL_STORAGE_CONFLICT");
    },
    persistPage: async ({scope:s,expectedCursor,nextCursor,documents}) => {
      const result = await admin.rpc("fiscal_commit_capture_page",{
        p_binding_id:s.bindingId,p_organization_id:s.organizationId,p_account_id:s.accountId,
        p_cnpj:s.cnpj,p_type:s.type,p_filter_key:s.filterKey,p_expected:expectedCursor,p_next:nextCursor,p_documents:documents
      });
      return data(result)===true;
    },
  });
}
