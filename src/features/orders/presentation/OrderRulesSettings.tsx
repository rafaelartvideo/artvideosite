import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { Section, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { useOrganizationOrderRules } from "../application/useOrganizationOrderRules";
import { findRuleRow, resolveRules, fieldLabels, photoLabels, type RuleItem, type RuleSet, type Scope, type CustomField } from "../domain/order-rules";
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
