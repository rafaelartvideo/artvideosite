import { supabase } from "@/lib/supabase";
import type { LogisticsJob } from "./logistics-jobs.repository";
export type RoutePoint={latitude:number;longitude:number};
export type RouteStop=RoutePoint&{id:string;window_start:string;window_end:string;serviceMinutes:number};
export type RouteInput={origin:RoutePoint;departure:string;speedKmh:number;returnToOrigin:boolean;stops:RouteStop[]};
export type RoutePlan={id:string;shift_id:string;planned_departure:string;origin_lat:number;origin_lon:number;return_to_origin:boolean;assumed_speed_kmh:number;stops:RouteStop[];created_at:string;method:"geographic"};
export async function listRouteJobs(org:string,shiftId:string):Promise<LogisticsJob[]> {
  const {data,error}=await supabase.from("logistics_jobs").select("id,order_id,order_number,kind,status,address,window_start,window_end,shift_id,created_at,arrived_at,collected_at,finished_at,recipient,notes")
    .eq("organization_id",org).eq("shift_id",shiftId).in("status",["assigned","loaded"]).order("window_start").limit(101);
  if(error)throw error;
  return (data??[]) as LogisticsJob[];
}
export async function listRoutePlans(org:string,shiftId:string):Promise<RoutePlan[]> {
  const {data,error}=await supabase.from("logistics_route_plans").select("id,shift_id,planned_departure,origin_lat,origin_lon,return_to_origin,assumed_speed_kmh,stops,created_at,method")
    .eq("organization_id",org).eq("shift_id",shiftId).order("created_at",{ascending:false}).limit(10);
  if(error)throw error;
  return (data??[]) as RoutePlan[];
}
export async function saveRoutePlan(org:string,shiftId:string,input:RouteInput) {
  const {error}=await supabase.from("logistics_route_plans").insert({organization_id:org,shift_id:shiftId,planned_departure:input.departure,origin_lat:input.origin.latitude,origin_lon:input.origin.longitude,return_to_origin:input.returnToOrigin,assumed_speed_kmh:input.speedKmh,stops:input.stops});
  if(error)throw error;
}
