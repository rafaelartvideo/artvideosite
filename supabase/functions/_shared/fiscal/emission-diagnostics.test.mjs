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
