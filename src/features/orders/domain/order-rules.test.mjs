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
 assert.match(rules.validateRules(staged,{customer_notes:"Defeito",diagnosis:"Identificado",solution:"Reparo concluído"},[],"finish"),/Fotos do equipamento/);
});

test("diagnóstico e solução podem ser exigidos, ocultos ou opcionais por empresa",()=>{
 const defaults=rules.resolveRules([]);
 assert.equal(defaults.fields.diagnosis.mode,"required");
 assert.equal(defaults.fields.solution.mode,"required");
 const base={...defaults,photos:{...defaults.photos,label:{mode:"optional",stage:"create"}}};
 assert.match(rules.validateRules(base,{customer_notes:"Defeito"},[],"finish"),/Diagnóstico/);
 const customized={...base,fields:{...base.fields,diagnosis:{mode:"hidden",stage:"finish"},solution:{mode:"optional",stage:"finish"}}};
 assert.equal(rules.validateRules(customized,{customer_notes:"Defeito"},[],"finish"),null);
});

test("anexos personalizados são validados somente na etapa configurada",()=>{
 const defaults=rules.resolveRules([]);
 const withFile={...defaults,
  fields:{...defaults.fields,diagnosis:{mode:"optional",stage:"finish"},solution:{mode:"optional",stage:"finish"}},
  photos:{...defaults.photos,label:{mode:"optional",stage:"create"}},
  custom_fields:[{key:"laudo",label:"Laudo técnico",type:"file",mode:"required",stage:"start"}],
 };
 const payload={customer_notes:"Defeito",custom_field_values:{}};
 assert.equal(rules.validateRules(withFile,payload,[],"create"),null);
 assert.match(rules.validateRules(withFile,payload,[],"start"),/Laudo técnico/);
 assert.equal(rules.validateRules(withFile,{
  ...payload,custom_field_values:{laudo:{media_id:"9fb20e0b-2be4-4d2e-913e-10f00af03623",file_name:"laudo.pdf"}}
 },[],"start"),null);
});
