import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const source=readFileSync("src/features/orders/domain/order-rules.ts","utf8");
const compiled=await transformWithEsbuild(source,"order-rules.ts",{loader:"ts"});
const rules=await import("data:text/javascript;base64,"+Buffer.from(compiled.code).toString("base64"));

test("configuração de empresa não vaza para outra e respeita especializações",()=>{
 const company={organization_id:"empresa-a",scope:"company",service_type_id:null,equipment_type_id:null,
  rules:{photos:{label:{mode:"optional",stage:"create",minCount:1}}}};
 const service={organization_id:"empresa-a",scope:"service_type",service_type_id:"balcao",equipment_type_id:null,
  rules:{photos:{label:{mode:"required",stage:"finish",minCount:2}}}};
 const normal=rules.resolveRules([company,service],"domicilio","tv");
 const specialized=rules.resolveRules([company,service],"balcao","tv");
 assert.equal(normal.photos.label.mode,"optional");
 assert.equal(specialized.photos.label.mode,"required");
 assert.equal(specialized.photos.label.stage,"finish");
 assert.equal(rules.resolveRules([],"balcao","tv").photos.label.mode,"required");
});

test("fotos e campos obrigatórios são validados na etapa correta",()=>{
 const config=rules.resolveRules([]);
 assert.match(rules.validateRules(config,{customer_notes:"Defeito"},[],"create"),/Foto da etiqueta/);
 const optional={...config,photos:{...config.photos,label:{mode:"optional",stage:"create"}}};
 assert.equal(rules.validateRules(optional,{customer_notes:"Defeito"},[],"create"),null);
 assert.match(rules.validateRules(optional,{customer_notes:""},[],"create"),/Descrição do problema/);
 const staged={...optional,photos:{...optional.photos,equipment:{mode:"required",stage:"finish",minCount:2}}};
 assert.equal(rules.validateRules(staged,{customer_notes:"Defeito"},[],"create"),null);
 assert.match(rules.validateRules(staged,{customer_notes:"Defeito"},[],"finish"),/Fotos do equipamento/);
});
