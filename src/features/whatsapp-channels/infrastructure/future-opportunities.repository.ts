import { supabase } from "@/lib/supabase";

export type FutureOpportunityStatus = "waiting"|"available"|"contacted"|"converted"|"lost";
export type FutureOpportunityReason = "service_unavailable"|"equipment_unavailable"|"capacity"|"other";
export type FutureOpportunity = {
  id:string; organization_id:string; channel_id:string; account_phone:string; chat_jid:string;
  contact_id:string|null; conversation_id:string|null; contact_name:string; contact_phone:string|null;
  equipment_type:string; service_interest:string; reason:FutureOpportunityReason; notes:string;
  status:FutureOpportunityStatus; consent_to_contact:boolean; consent_recorded_at:string|null;
  consent_source:"manual_whatsapp"|"manual_in_person"|"other";
  service_type_id:string|null; service_order_id:string|null;
  last_contact_at:string|null; converted_at:string|null;
  created_by:string|null;updated_by:string|null;created_at:string;updated_at:string;
};
export type FutureOpportunityIdentity={
  organization_id:string;channel_id:string;account_phone:string;chat_jid:string;
  conversation_id?:string|null;contact_name?:string;contact_phone?:string|null;
};
export type FutureOpportunityDraft={
  equipment_type:string;service_interest:string;reason:FutureOpportunityReason;
  notes:string;status:FutureOpportunityStatus;consent_to_contact:boolean;
  consent_source:"manual_whatsapp"|"manual_in_person"|"other";
  service_order_id?:string|null;
};

export const FUTURE_STATUSES:Record<FutureOpportunityStatus,string>={
  waiting:"Aguardando serviço",available:"Serviço disponível",
  contacted:"Contato realizado",converted:"Convertida em OS",lost:"Encerrada sem conversão",
};
export const FUTURE_REASONS:Record<FutureOpportunityReason,string>={
  service_unavailable:"Serviço ainda não oferecido",
  equipment_unavailable:"Equipamento ainda não atendido",
  capacity:"Sem capacidade no momento",other:"Outro motivo",
};
const COLUMNS="id,organization_id,channel_id,account_phone,chat_jid,contact_id,conversation_id,contact_name,contact_phone,equipment_type,service_interest,reason,notes,status,consent_to_contact,consent_recorded_at,consent_source,service_type_id,service_order_id,last_contact_at,converted_at,created_by,updated_by,created_at,updated_at";
const table=()=>supabase.from("union_whatsapp_future_opportunities");
export const futureOpportunityQueryKey=(organizationId:string)=>["whatsapp","future-opportunities",organizationId] as const;

export async function listFutureOpportunities(organizationId:string,options:{
  page?:number;pageSize?:number;status?:FutureOpportunityStatus|"all";search?:string;
}={}):Promise<{items:FutureOpportunity[];total:number}>{
  const page=Math.max(0,options.page||0),pageSize=Math.max(1,Math.min(50,options.pageSize||25));
  let query=table().select(COLUMNS,{count:"exact"})
    .eq("organization_id",organizationId)
    .order("updated_at",{ascending:false}).order("id",{ascending:false});
  if(options.status&&options.status!=="all")query=query.eq("status",options.status);
  const search=String(options.search||"").replace(/[%_,.():\\]/g," ").trim().slice(0,100);
  if(search)query=query.or("contact_name.ilike.%"+search+"%,service_interest.ilike.%"+search+"%,equipment_type.ilike.%"+search+"%");
  const {data,error,count}=await query.range(page*pageSize,(page+1)*pageSize-1);
  if(error)throw error;
  return {items:(data||[]) as FutureOpportunity[],total:count||0};
}

export async function listContactFutureOpportunities(identity:FutureOpportunityIdentity):Promise<FutureOpportunity[]>{
  const {data,error}=await table().select(COLUMNS)
    .eq("organization_id",identity.organization_id)
    .eq("channel_id",identity.channel_id)
    .eq("account_phone",identity.account_phone)
    .eq("chat_jid",identity.chat_jid)
    .order("created_at",{ascending:false}).limit(50);
  if(error)throw error;
  return (data||[]) as FutureOpportunity[];
}

export async function saveFutureOpportunity(identity:FutureOpportunityIdentity,draft:FutureOpportunityDraft,id?:string):Promise<FutureOpportunity>{
  const values={
    equipment_type:draft.equipment_type.trim().slice(0,160),
    service_interest:draft.service_interest.trim().slice(0,180),
    reason:draft.reason,
    notes:draft.notes.trim().slice(0,2000),
    status:draft.status,
    consent_to_contact:draft.consent_to_contact,
    consent_source:draft.consent_source,
    service_order_id:draft.service_order_id||null,
  };
  if(values.service_interest.length<2)throw new Error("Informe qual serviço o cliente procura.");
  const result=id?await table().update(values).eq("organization_id",identity.organization_id).eq("id",id).select(COLUMNS).single()
    :await table().insert({...identity,...values}).select(COLUMNS).single();
  if(result.error)throw result.error;
  return result.data as FutureOpportunity;
}

export async function markFutureOpportunityConverted(organizationId:string,id:string,orderId:string):Promise<void>{
  const {data,error}=await table().update({status:"converted",service_order_id:orderId})
    .eq("organization_id",organizationId).eq("id",id).select("id").single();
  if(error)throw error;
  if(!data)throw new Error("A oportunidade não foi encontrada nesta empresa.");
}

export async function listFutureOpportunityHistory(organizationId:string,id:string){
  const {data,error}=await supabase.from("union_whatsapp_future_opportunity_history")
    .select("id,action,before_value,after_value,actor_id,created_at")
    .eq("organization_id",organizationId).eq("opportunity_id",id)
    .order("created_at",{ascending:false}).limit(30);
  if(error)throw error;
  return (data||[]) as Array<{
    id:number;action:string;before_value:Record<string,unknown>;after_value:Record<string,unknown>;
    actor_id:string|null;created_at:string;
  }>;
}

export async function locateServiceOrder(organizationId:string,number:string):Promise<{id:string;os_number:string}|null>{
  const normalized=number.trim();
  if(!normalized||normalized.length>60)return null;
  const {data,error}=await supabase.from("service_orders")
    .select("id,os_number").eq("organization_id",organizationId)
    .eq("os_number",normalized).limit(1).maybeSingle();
  if(error)throw error;
  return data?{id:String(data.id),os_number:String(data.os_number)}:null;
}

export async function countAvailableFutureOpportunities(organizationId:string):Promise<number>{
  const {count,error}=await table().select("id",{count:"exact",head:true})
    .eq("organization_id",organizationId)
    .eq("status","available").eq("consent_to_contact",true);
  if(error)throw error;
  return count||0;
}

export async function futureOpportunitiesSummary(organizationId:string):Promise<Record<FutureOpportunityStatus,number>>{
  const statuses=Object.keys(FUTURE_STATUSES) as FutureOpportunityStatus[];
  const values=await Promise.all(statuses.map(async status=>{
    const {count,error}=await table().select("id",{count:"exact",head:true})
      .eq("organization_id",organizationId).eq("status",status);
    if(error)throw error;
    return [status,count||0] as const;
  }));
  return Object.fromEntries(values) as Record<FutureOpportunityStatus,number>;
}
