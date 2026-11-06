export type RuleMode = "required" | "optional" | "hidden";
export type RuleStage = "create" | "start" | "finish";
export type RuleItem = { mode: RuleMode; stage: RuleStage; minCount?: number };
export type CustomField = { key: string; label: string; type: "text"|"number"|"date"|"select"|"checkbox"; mode: RuleMode; stage: RuleStage; options?: string[] };
export type RuleSet = { fields: Record<string,RuleItem>; photos: Record<string,RuleItem>; custom_fields: CustomField[] };
export type Scope = "company"|"service_type"|"equipment_type"|"combination";
export type RuleRow = { id?: string; organization_id: string; scope: Scope; service_type_id: string|null; equipment_type_id: string|null; rules: Partial<RuleSet> };
export const fieldLabels: Record<string,string> = { customer_notes:"Descrição do problema",equipment_type_id:"Tipo de equipamento",equipment_brand_id:"Marca",equipment_model_id:"Modelo",serial_number:"Número de série",accessories:"Acessórios",internal_notes:"Observações internas",external_os_number:"OS externa",diagnosis:"Diagnóstico",solution:"Solução" };
export const photoLabels: Record<string,string> = { label:"Foto da etiqueta",equipment:"Fotos do equipamento" };
export const defaultRules: RuleSet = {
 fields: Object.fromEntries(Object.keys(fieldLabels).map(key=>[key,{mode:key==="customer_notes"?"required":"optional",stage:["diagnosis","solution"].includes(key)?"finish":"create"}])) as RuleSet["fields"],
 photos:{label:{mode:"required",stage:"create",minCount:1},equipment:{mode:"optional",stage:"create",minCount:1}},
 custom_fields:[]
};
export const visible=(item?:RuleItem)=>item?.mode!=="hidden";
export const requiredAt=(item:RuleItem|undefined,stage:RuleStage)=>Boolean(item?.mode==="required" && ({create:0,start:1,finish:2})[stage]>=({create:0,start:1,finish:2})[item.stage||"create"]);

export function findRuleRow(rows:RuleRow[],scope:Scope,serviceId:string|null,equipmentId:string|null){
 return rows.find(row=>row.scope===scope&&(row.service_type_id||null)===serviceId&&(row.equipment_type_id||null)===equipmentId);
}
export function resolveRules(rows:RuleRow[],serviceId?:string|null,equipmentId?:string|null):RuleSet {
 const chain=[
  findRuleRow(rows,"company",null,null),
  serviceId?findRuleRow(rows,"service_type",serviceId,null):undefined,
  equipmentId?findRuleRow(rows,"equipment_type",null,equipmentId):undefined,
  serviceId&&equipmentId?findRuleRow(rows,"combination",serviceId,equipmentId):undefined
 ];
 const result:RuleSet={fields:{...defaultRules.fields},photos:{...defaultRules.photos},custom_fields:[]};
 for(const row of chain){if(!row)continue;
  result.fields={...result.fields,...row.rules.fields};
  result.photos={...result.photos,...row.rules.photos};
  if(Array.isArray(row.rules.custom_fields))result.custom_fields=[...row.rules.custom_fields];
 }
 return result;
}
export function validateRules(rules:RuleSet,form:Record<string,any>,images:Array<{kind?:string}>,stage:RuleStage):string|null {
 for(const [key,label] of Object.entries(fieldLabels)){
  if(requiredAt(rules.fields[key],stage)&&!String(form[key]??"").trim())return "Preencha o campo obrigatório: "+label+".";
 }
 for(const [key,label] of Object.entries(photoLabels)){
  const item=rules.photos[key];if(!requiredAt(item,stage))continue;
  const count=images.filter(image=>(image.kind==="label"?"label":"equipment")===key).length;
  const min=Math.min(20,Math.max(1,Number(item.minCount)||1));
  if(count<min)return "Adicione pelo menos "+min+" foto(s) em "+label+".";
 }
 for(const field of rules.custom_fields){
  if(!requiredAt(field,stage))continue;
  const value=form.custom_field_values?.[field.key];
  if(value==null||String(value).trim()===""||(field.type==="checkbox"&&value!==true&&value!=="true"))
   return "Preencha o campo personalizado: "+field.label+".";
 }
 return null;
}
