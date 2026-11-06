import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { Section, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { useOrganizationOrderRules } from "../application/useOrganizationOrderRules";
import { findRuleRow, resolveRules, fieldLabels, photoLabels, type RuleItem, type RuleSet, type Scope, type CustomField } from "../domain/order-rules";
import { OrderCustomFieldsEditor } from "./OrderCustomFieldsEditor";
import { saveOrderRules, removeOrderRules } from "../infrastructure/order-rules.repository";

const modes=[{value:"required",label:"Obrigatório"},{value:"optional",label:"Opcional"},{value:"hidden",label:"Oculto"}];
const stages=[{value:"create",label:"Criar OS"},{value:"start",label:"Iniciar serviço"},{value:"finish",label:"Concluir OS"}];
const scopes=[{value:"company",label:"Geral da empresa"},{value:"service_type",label:"Tipo de atendimento"},{value:"equipment_type",label:"Equipamento"},{value:"combination",label:"Atendimento + equipamento"}];
const fieldTypes=[{value:"text",label:"Texto"},{value:"number",label:"Número"},{value:"date",label:"Data"},{value:"select",label:"Seleção"},{value:"checkbox",label:"Checkbox"}];
const control="min-w-0 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-foreground";
function RuleSelect({value,options,onChange,disabled}:{value:string;options:{value:string;label:string}[];onChange:(v:string)=>void;disabled?:boolean}){
 return <select className={control} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>
  {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
 </select>;
}
export function OrderRulesSettings({organizationId,canEdit}:{organizationId:string;canEdit:boolean}){
 const client=useQueryClient();
 const rulesQuery=useOrganizationOrderRules(organizationId);
 const catalog=useQuery({queryKey:["order-rules-catalog",organizationId],queryFn:async()=>{
  const [types,equipment]=await Promise.all([
   supabase.from("service_types").select("id,title").eq("organization_id",organizationId).order("title"),
   supabase.from("equipment_types").select("id,name").eq("organization_id",organizationId).order("name")
  ]);
  if(types.error)throw types.error;if(equipment.error)throw equipment.error;
  return {types:types.data||[],equipment:equipment.data||[]};
 },staleTime:120_000});
 const [scope,setScope]=useState<Scope>("company");
 const [serviceId,setServiceId]=useState("");
 const [equipmentId,setEquipmentId]=useState("");
 const [draft,setDraft]=useState<Partial<RuleSet>>({});
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const sId=scope==="service_type"||scope==="combination"?serviceId:null;
 const eId=scope==="equipment_type"||scope==="combination"?equipmentId:null;
 const configured=Boolean(scope==="company"||(scope==="service_type"&&sId)||(scope==="equipment_type"&&eId)||(scope==="combination"&&sId&&eId));
 const row=findRuleRow(rulesQuery.data||[],scope,sId,eId);
 const rowId=row?.id;
 useEffect(()=>{setDraft(row?.rules||{});setMessage("");},[rowId,scope,sId,eId,rulesQuery.data]);
 const preview=resolveRules([...(rulesQuery.data||[]).filter(item=>item.id!==rowId),{organization_id:organizationId,scope,service_type_id:sId,equipment_type_id:eId,rules:draft}],sId,eId);
 const editRule=(group:"fields"|"photos",key:string,patch:Partial<RuleItem>)=>{
  const old=preview[group][key]||{mode:"optional",stage:"create"};
  setDraft(current=>({...current,[group]:{...current[group],[key]:{...old,...current[group]?.[key],...patch}}}));
 };
 const setCustom=(items:CustomField[])=>setDraft(current=>({...current,custom_fields:items}));
 const save=async()=>{if(!canEdit||!configured||saving)return;setSaving(true);setMessage("");
  try{await saveOrderRules(organizationId,scope,sId,eId,draft);
   await client.invalidateQueries({queryKey:["organization-order-rules",organizationId]});
   setMessage("Configurações de OS salvas para esta empresa.");
  }catch(error){setMessage(systemErrorMessage(error));}finally{setSaving(false);}
 };
 const reset=async()=>{if(!canEdit||!rowId||saving)return;setSaving(true);setMessage("");
  try{await removeOrderRules(organizationId,rowId);
   await client.invalidateQueries({queryKey:["organization-order-rules",organizationId]});
   setMessage("Regras específicas removidas. Padrões herdados restaurados.");
  }catch(error){setMessage(systemErrorMessage(error));}finally{setSaving(false);}
 };

 return <Section title="Configurações de Ordens de Serviço">
  <div className="space-y-4">
   <p className="text-xs text-muted-foreground">Regras independentes por empresa. As opções específicas substituem os padrões gerais; mudanças não devem invalidar OS antigas.</p>
   <div className="grid gap-3 sm:grid-cols-3">
    <label className="space-y-1"><span className="text-xs font-semibold">Aplicar a</span><RuleSelect value={scope} options={scopes} onChange={v=>setScope(v as Scope)}/></label>
    {(scope==="service_type"||scope==="combination")&&<label className="space-y-1"><span className="text-xs font-semibold">Tipo de atendimento</span>
     <RuleSelect value={serviceId} onChange={setServiceId} options={[{value:"",label:"Selecionar..."},...(catalog.data?.types||[]).map(x=>({value:x.id,label:x.title}))]}/></label>}
    {(scope==="equipment_type"||scope==="combination")&&<label className="space-y-1"><span className="text-xs font-semibold">Equipamento</span>
     <RuleSelect value={equipmentId} onChange={setEquipmentId} options={[{value:"",label:"Selecionar..."},...(catalog.data?.equipment||[]).map(x=>({value:x.id,label:x.name}))]}/></label>}
   </div>
   {(rulesQuery.isLoading||catalog.isLoading)&&<p className="text-sm text-muted-foreground">Carregando configurações...</p>}
   {(rulesQuery.error||catalog.error)&&<p role="alert" className="text-sm text-red-600">Não foi possível carregar configurações: {systemErrorMessage(rulesQuery.error||catalog.error)}</p>}
   {configured&&!rulesQuery.error&&<div className="space-y-5">
    <div className="space-y-2">
     <h3 className="font-semibold text-sm">Campos da OS</h3>
     {Object.entries(fieldLabels).map(([key,label])=><div key={key} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_160px_160px] sm:items-center">
       <span className="text-sm font-medium">{label}</span>
       <RuleSelect value={preview.fields[key]?.mode||"optional"} disabled={!canEdit} options={modes} onChange={v=>editRule("fields",key,{mode:v as RuleItem["mode"]})}/>
       <RuleSelect value={preview.fields[key]?.stage||"create"} disabled={!canEdit} options={stages} onChange={v=>editRule("fields",key,{stage:v as RuleItem["stage"]})}/>
     </div>)}
    </div>
    <div className="space-y-2">
     <h3 className="font-semibold text-sm">Fotos e evidências</h3>
     {Object.entries(photoLabels).map(([key,label])=><div key={key} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_145px_145px_80px] sm:items-center">
       <span className="text-sm font-medium">{label}</span>
       <RuleSelect value={preview.photos[key]?.mode||"optional"} disabled={!canEdit} options={modes} onChange={v=>editRule("photos",key,{mode:v as RuleItem["mode"]})}/>
       <RuleSelect value={preview.photos[key]?.stage||"create"} disabled={!canEdit} options={stages} onChange={v=>editRule("photos",key,{stage:v as RuleItem["stage"]})}/>
       <input className={control} type="number" aria-label={"Quantidade mínima: "+label} min={1} max={20} disabled={!canEdit} value={preview.photos[key]?.minCount||1} onChange={e=>editRule("photos",key,{minCount:Math.max(1,Math.min(20,Number(e.target.value)||1))})}/>
     </div>)}
    </div>
   </div>}
   {configured&&!rulesQuery.error&&<OrderCustomFieldsEditor fields={preview.custom_fields} onChange={setCustom} disabled={!canEdit}/>}
   <div className="flex flex-wrap justify-end gap-2">
    {rowId&&<BtnSecondary disabled={!canEdit||saving} onClick={reset}>Restaurar padrão</BtnSecondary>}
    <BtnPrimary disabled={!canEdit||saving||!configured||rulesQuery.isLoading} loading={saving} onClick={save}>Salvar configurações de OS</BtnPrimary>
   </div>
   {message&&<p role="status" className="text-sm text-foreground">{message}</p>}
  </div>
 </Section>;
}
