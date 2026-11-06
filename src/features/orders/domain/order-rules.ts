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
