import test from "node:test";
import assert from "node:assert/strict";
import { summarizeEmissionBootstrap } from "./emission-diagnostics.mjs";

const cnpj="12345678000199";
const fixture={company:{id:123,cnpj:"12.345.678/0001-99"},launch:{diagnosis:{models:{"55":{ready:true,status:"ready",token:"do-not-return"},"NFSE":{ready:false,pending:["certificate"]}}}},catalog:{profiles:[{id:7,secret:"private"}]}};
test("diagnosis confirms explicit identity and projects only allowed fields",()=>{
 const result=summarizeEmissionBootstrap(fixture,cnpj,123);
 assert.equal(result.identity,"confirmed");
 assert.equal(result.profileCount,1);
 assert.deepEqual(result.models,{"55":{ready:true,status:"ready"},"NFSE":{ready:false,pending:["certificate"]}});
 assert.equal(JSON.stringify(result).includes("do-not-return"),false);
 assert.equal(JSON.stringify(result).includes("private"),false);
});
test("different CNPJ or ID is not treated as the bound issuer",()=>{
 const wrongCnpj=summarizeEmissionBootstrap(fixture,"99999999000199",123);
 assert.equal(wrongCnpj.identity,"mismatch");
 assert.equal(wrongCnpj.models,null);
 assert.equal(summarizeEmissionBootstrap(fixture,cnpj,456).identity,"mismatch");
});
test("no identity returned does not confirm issuer",()=>{
 const result=summarizeEmissionBootstrap({...fixture,company:undefined},cnpj,123);
 assert.equal(result.identity,"unverified");
});
test("unknown schema fails closed instead of inventing readiness",()=>{
 assert.throws(()=>summarizeEmissionBootstrap({},cnpj,123),/FISCAL_BOOTSTRAP_SCHEMA_UNRECOGNIZED/);
});

test("preserves long Portuguese issues and nested message fields, while masking secrets",()=>{
 const data={...fixture,launch:{diagnosis:{models:{"NFSE":{issues:[
  "A configuração municipal precisa ser conferida pelo responsável fiscal; valide os parâmetros aplicáveis ao ambiente antes de prosseguir.",
  {message:"Informe o código municipal de serviço.",token:"do-not-return"},
  "token: private-token",
  "Contate suporte@example.com."
 ]}}}}};
 const issues=summarizeEmissionBootstrap(data,cnpj,123).models.NFSE.issues;
 assert.match(issues[0],/parâmetros aplicáveis/);
 assert.equal(issues[1],"Informe o código municipal de serviço.");
 assert.equal(issues[2],null);
 assert.equal(issues[3],"Contate [oculto].");
});

test("explicit nested issuer confirms identity; conflicting issuer blocks metadata",()=>{
 const nested={...fixture,company:undefined,launch:{...fixture.launch,issuer:{tax_id:"12345678000199",company_id:123}},catalog:{profiles:[{profile_id:7,profile_version:2,model:"55",catalog_code:"7870",secret:"never-return"}]}};
 const result=summarizeEmissionBootstrap(nested,cnpj,123);
 assert.equal(result.identity,"confirmed");
 assert.equal(result.profiles[0].id,7);
 assert.equal(result.profiles[0].version,2);
 assert.equal(result.profiles[0].catalogCode,"7870");
 assert.equal(JSON.stringify(result).includes("never-return"),false);
 const conflict=summarizeEmissionBootstrap({...nested,company:{id:123,cnpj:"99999999000199"}},cnpj,123);
 assert.equal(conflict.identity,"mismatch");
 assert.deepEqual(conflict.profiles,[]);
});
test("unknown issuer exposes field names only, no profile values",()=>{
 const result=summarizeEmissionBootstrap({...fixture,company:undefined},cnpj,123);
 assert.deepEqual(result.profiles,[]);
 assert.equal(result.profileFields.includes("id"),true);
});
