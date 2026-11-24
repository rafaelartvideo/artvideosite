import { supabase } from "@/lib/supabase";
import type { Address } from "@/lib/address";
import type { OrderImage } from "../domain/order-image";

export type IntakePayload = { name:string; document:string; phone?:string; cpf_identity_ticket?:string; address:Address; type_id:string; brand_id:string|null; brand_text?:string; type_name?:string; brand_name?:string; model:string; serial:string; problem:string };
export type OrderIntake = {id:string; phone:string; payload:IntakePayload; images:OrderImage[]; conversation_id:string; bound_customer_id?:string|null};
export type IntakeRow = {id:string; status:string; created_at:string; expires_at:string; submitted_at:string|null; order_id:string|null; conversation_id:string; phone?:string; customer_name?:string|null};
export type IntakeCatalog = { status:string; confirmation_phone?:string|null; requires_customer_details?:boolean; requires_cpf_identity?:boolean; company?:string; company_logo_url?:string|null; types?:{id:string;name:string}[]; brands?:{id:string;name:string;equipment_type_id:string}[] };
export type IntakePhoto = {file:File;kind:"label"|"equipment"|"problem"};
export type IntakePrefill = {id:string; payload:IntakePayload; images:OrderImage[]; conversationId?:string; verifiedDemographics?:{customerId:string;document:string;birthDate?:string|null;gender?:string|null}};

export async function intakeCall<T>(body:Record<string,unknown>|FormData):Promise<T> {
  const {data,error}=await supabase.functions.invoke("order-intake",{body});
  if(error){
    const response=(error as {context?:unknown}).context;
    if(response instanceof Response){
      const detail=await response.clone().json().catch(()=>null);
      if(typeof detail?.error==="string")throw new Error(detail.error);
    }
    throw new Error("Não foi possível acessar a solicitação. Tente novamente.");
  }
  if(data?.error)throw new Error(data.error);
  return data as T;
}
export const openIntake=(token:string)=>intakeCall<IntakeCatalog>({action:"open",token});
export const validateIntakeIdentity=(token:string,document:string,name:string)=>intakeCall<{required:boolean;ticket?:string}>({action:"identity",token,document,name});
export const listIntakeModels=(token:string,brandId:string)=>intakeCall<{models:{id:string;name:string}[]}>({action:"models",token,brand_id:brandId});
export const createIntake=(org:string,conversationId:string)=>intakeCall<{id:string;token:string;requires_customer_details?:boolean}>({action:"create",organization_id:org,conversation_id:conversationId});
export const countActiveIntakes=(org:string)=>intakeCall<{active:number}>({action:"active_count",organization_id:org});
export const listIntakes=(org:string,conversationId?:string,page=0)=>intakeCall<{rows:IntakeRow[];total?:number;active?:number;completed?:number}>({action:"list",organization_id:org,conversation_id:conversationId,page});
export const reviewIntake=(org:string,id:string)=>intakeCall<{intake:OrderIntake}>({action:"review",organization_id:org,id});
export const getIntakeLink=(org:string,id:string,replaceLegacy=false)=>intakeCall<{id?:string;token?:string;legacy?:boolean;requires_customer_details?:boolean}>({action:"link",organization_id:org,id,replace_legacy:replaceLegacy});
export const cancelIntake=(org:string,id:string)=>intakeCall({action:"cancel",organization_id:org,id});
export async function submitIntake(token:string,payload:IntakePayload,photos:IntakePhoto[]){
  const body=new FormData();
  body.set("token",token);body.set("payload",JSON.stringify(payload));
  photos.forEach(({file,kind})=>{body.append("photo",file);body.append("kind",kind);});
  return intakeCall<{status:string;confirmation_phone?:string|null}>(body);
}
