import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createFiscalSyncWorker, fiscalFilterKey } from "./sync-worker.mjs";
const xml = "<nfe>original</nfe>";
const sha256 = createHash("sha256").update(xml).digest("hex");
const scope = { bindingId:"binding-a",organizationId:"org-a",accountId:"account-a",cnpj:"00000000000001",enabled:true,syncEnabled:true };
function fixture(overrides = {}) {
  const calls=[];
  const deps = {
    resolveScope: async () => scope,
    providerFor: async () => ({
      listDocuments: async () => ({data:[{id:5,tipo:"nfe",chave:"key",data:"2026-11-01"}],paginacao:{quantidade:1,ultimo_id:5,tem_mais:true}}),
      getXml: async () => ({id:5,tipo:"nfe",chave:"key",dfe:xml,sha256}),
    }),
    loadCursor: async () => 0,
    storeOriginal: async value => { calls.push(["store",value]); },
    persistPage: async value => { calls.push(["commit",value]); return true; },
    ...overrides,
  };
  return { calls, run: createFiscalSyncWorker(deps) };
}
const input={bindingId:"binding-a",type:"nfe"};
test("canonical filter key separates historical and actor cursors",()=>{
  assert.equal(fiscalFilterKey({ator:"DEST",data_ini:"2026-01-01"}),fiscalFilterKey({data_ini:"2026-01-01",ator:"DEST"}));
  assert.notEqual(fiscalFilterKey({ator:"DEST"}),fiscalFilterKey({ator:"EMIT"}));
  assert.throws(()=>fiscalFilterKey({pagina:2}));
});
test("original XML is saved before atomic cursor advance",async()=>{
  const f=fixture(); assert.deepEqual(await f.run(input),{processed:1,cursor:5,hasMore:true});
  assert.equal(f.calls[0][0],"store"); assert.equal(f.calls[0][1].xml,xml);
  assert.equal(f.calls[0][1].storageKey,"org-a/binding-a/nfe/5/"+sha256+".xml");
  assert.equal(f.calls[1][0],"commit"); assert.equal(f.calls[1][1].nextCursor,5);
});
test("checksum error cannot advance cursor or store XML",async()=>{
  const f=fixture({providerFor:async()=>({
    listDocuments:async()=>({data:[{id:5,tipo:"nfe",chave:"key"}],paginacao:{quantidade:1,ultimo_id:5,tem_mais:false}}),
    getXml:async()=>({id:5,tipo:"nfe",chave:"key",dfe:xml+"changed",sha256}),
  })}); await assert.rejects(f.run(input),/CHECKSUM/); assert.equal(f.calls.length,0);
});
test("failed storage, conflicting cursor and disabled scope fail closed",async()=>{
  await assert.rejects(fixture({storeOriginal:async()=>{throw Error("storage");}}).run(input),/storage/);
  await assert.rejects(fixture({persistPage:async()=>false}).run(input),/CURSOR_CONFLICT/);
  await assert.rejects(fixture({resolveScope:async()=>({...scope,syncEnabled:false})}).run(input),/SYNC_DISABLED/);
});
test("invalid pagination cannot advance cursor",async()=>{
  const f=fixture({providerFor:async()=>({listDocuments:async()=>({data:[],paginacao:{quantidade:0,ultimo_id:9,tem_mais:true}})})});
  await assert.rejects(f.run(input),/CURSOR_INCONSISTENT/); assert.equal(f.calls.length,0);
});
test("scope changes before commit prevent metadata and cursor updates",async()=>{
  let n=0;const f=fixture({resolveScope:async()=>({...scope,enabled:++n===1})});
  await assert.rejects(f.run(input),/SCOPE_CHANGED/);assert.deepEqual(f.calls.map(c=>c[0]),["store"]);
});
