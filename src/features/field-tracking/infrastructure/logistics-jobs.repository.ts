import { supabase } from "@/lib/supabase";
export type JobKind = "pickup" | "delivery";
export type JobStatus = "requested"|"assigned"|"loaded"|"arrived"|"collected"|"received"|"delivered"|"cancelled";
export type LogisticsJob = {id:string;order_id:string;order_number:string|null;kind:JobKind;status:JobStatus;address:string;window_start:string;window_end:string;shift_id:string|null;created_at:string;arrived_at:string|null;collected_at:string|null;finished_at:string|null;recipient:string|null;notes:string|null};
const fields = "id,order_id,order_number,kind,status,address,window_start,window_end,shift_id,created_at,arrived_at,collected_at,finished_at,recipient,notes";
export async function listJobs(org:string,orderId?:string):Promise<LogisticsJob[]> {
  let query=supabase.from("logistics_jobs").select(fields).eq("organization_id",org);
  if(orderId) query=query.eq("order_id",orderId);
  else query=query.not("status","in","(received,delivered,cancelled)");
  const {data,error}=await query.order("window_start").limit(orderId?50:200);
  if(error) throw error;
  return (data??[]) as LogisticsJob[];
}
export async function requestJob(org:string,orderId:string,input:{kind:JobKind;address:string;window_start:string;window_end:string}) {
  const {error}=await supabase.from("logistics_jobs").insert({...input,organization_id:org,order_id:orderId});
  if(error) throw error;
}
export async function advanceJob(org:string,job:LogisticsJob,status:JobStatus,extra:{shift_id?:string;recipient?:string;notes?:string}={}) {
  const {data,error}=await supabase.from("logistics_jobs").update({status,notes:extra.notes??null,recipient:extra.recipient??null,...extra}).eq("organization_id",org).eq("id",job.id).eq("status",job.status).select("id");
  if(error) throw error;
  if(data?.length!==1) throw Error("Operação alterada por outro usuário. Atualize a lista.");
}
