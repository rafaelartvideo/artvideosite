import { supabase } from "@/lib/supabase";
import type { RuleRow, Scope, RuleSet } from "../domain/order-rules";

export async function loadOrderRules(organizationId:string):Promise<RuleRow[]> {
 const {data,error}=await supabase.from("organization_order_rules")
  .select("id,organization_id,scope,service_type_id,equipment_type_id,rules")
  .eq("organization_id",organizationId);
 if(error)throw error;
 return (data||[]) as RuleRow[];
}
export async function saveOrderRules(
 organizationId:string,scope:Scope,serviceTypeId:string|null,equipmentTypeId:string|null,
 rules:Partial<RuleSet>
){
 const payload={organization_id:organizationId,scope,service_type_id:serviceTypeId,
  equipment_type_id:equipmentTypeId,rules,updated_at:new Date().toISOString()};
 const {data,error}=await supabase.from("organization_order_rules")
  .upsert(payload,{onConflict:"organization_id,scope,service_type_id,equipment_type_id"})
  .select("id").single();
 if(error)throw error;
 return data;
}
export async function removeOrderRules(organizationId:string,rowId:string){
 const {error}=await supabase.from("organization_order_rules")
  .delete().eq("organization_id",organizationId).eq("id",rowId);
 if(error)throw error;
}
