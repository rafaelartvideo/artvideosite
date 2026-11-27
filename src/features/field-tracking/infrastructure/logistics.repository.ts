import { supabase } from "@/lib/supabase";

export type Driver = { id: string; employee_id: string; is_active: boolean };
export type Vehicle = { id: string; name: string; plate: string; capacity_kg: number | null; capacity_m3: number | null; is_active: boolean };
export type Shift = { id: string; driver_id: string; vehicle_id: string; tracker_id: string; started_at: string; ended_at: string | null; initial_odometer_km: number; final_odometer_km: number | null };
export type EmployeeOption = { id: string; full_name: string; is_active: boolean };
function result<T>(response: { data: unknown; error: unknown }): T {
  if (response.error) throw response.error;
  return response.data as T;
}
export async function listFleet(org: string) {
  const [drivers, vehicles, employees, activeShifts, recentShifts] = await Promise.all([
    supabase.from("logistics_drivers").select("id,employee_id,is_active").eq("organization_id",org).order("id").limit(500),
    supabase.from("logistics_vehicles").select("id,name,plate,capacity_kg,capacity_m3,is_active").eq("organization_id",org).order("name").limit(500),
    supabase.from("employees").select("id,full_name,is_active").eq("organization_id",org).order("full_name").limit(500),
    supabase.from("logistics_shifts").select("id,driver_id,vehicle_id,tracker_id,started_at,ended_at,initial_odometer_km,final_odometer_km").eq("organization_id",org).is("ended_at",null).order("started_at",{ascending:false}).limit(500),
    supabase.from("logistics_shifts").select("id,driver_id,vehicle_id,tracker_id,started_at,ended_at,initial_odometer_km,final_odometer_km").eq("organization_id",org).not("ended_at","is",null).order("started_at",{ascending:false}).limit(50),
  ]);
  return { drivers: result<Driver[]>(drivers), vehicles: result<Vehicle[]>(vehicles), employees: result<EmployeeOption[]>(employees), activeShifts: result<Shift[]>(activeShifts), recentShifts: result<Shift[]>(recentShifts) };
}
export async function addDriver(org: string, employeeId: string) {
  result(await supabase.from("logistics_drivers").insert({organization_id:org,employee_id:employeeId}));
}
export async function addVehicle(org: string, input: {name:string;plate:string;capacity_kg:number|null;capacity_m3:number|null}) {
  result(await supabase.from("logistics_vehicles").insert({...input,organization_id:org}));
}
export async function startShift(org: string, input: {driver_id:string;vehicle_id:string;tracker_id:string;initial_odometer_km:number;departure_checklist:{tires:boolean;lights:boolean;cargo:boolean}}) {
  result(await supabase.from("logistics_shifts").insert({...input,organization_id:org}));
}
export async function finishShift(org: string, id:string, final:number, checklist:{cargo:boolean;damage_notes:string}) {
  const rows = result<{id:string}[]>(await supabase.from("logistics_shifts").update({final_odometer_km:final,return_checklist:checklist}).eq("organization_id",org).eq("id",id).is("ended_at",null).select("id"));
  if (rows.length !== 1) throw new Error("Jornada não encontrada ou já encerrada.");
}
