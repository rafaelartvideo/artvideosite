import { useQuery } from "@tanstack/react-query";
import { loadOrderRules } from "../infrastructure/order-rules.repository";
import { resolveRules } from "../domain/order-rules";

export function useOrganizationOrderRules(organizationId?:string|null){
 return useQuery({
  queryKey:["organization-order-rules",organizationId||"none"],
  queryFn:()=>loadOrderRules(organizationId!),
  enabled:Boolean(organizationId),
  staleTime:60_000,
 });
}
export function useEffectiveOrderRules(organizationId?:string|null,serviceTypeId?:string|null,equipmentTypeId?:string|null){
 const query=useOrganizationOrderRules(organizationId);
 return {...query,rules:resolveRules(query.data||[],serviceTypeId,equipmentTypeId)};
}
