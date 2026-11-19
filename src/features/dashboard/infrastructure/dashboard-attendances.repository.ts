import { supabase } from "@/lib/supabase";

// Uma única RPC indexada para protocolos, conversas e encaminhamentos.
// Não lê mensagens, arquivos, fotos, logs ou o SAC Digital desativado.
export type AttendanceMetrics = {
  active:number; waiting:number; unread:number; unanswered:number;
  forwarded:number; opened:number; finished:number;
  avg_first_reply_minutes:number|null; avg_handle_minutes:number|null;
  sla_valid:number; sla_met:number; invalid_reply_times:number;
  transfers:number; reopened:number;
};
export type AttendanceOperator = {
  id:string; name:string; active:number; opened:number; finished:number;
  avg_first_reply_minutes:number|null; answered:number; within_sla:number;
};
export type AttendanceAlert = {
  conversation_id:string; contact_name:string|null; contact_phone:string|null;
  last_protocol_number:number|null; status:string; waiting_since:string|null;
  operator_name:string; department_name:string;
};
export type AttendanceDashboardData = {
  threshold_minutes:number;
  unanswered_after_minutes:number;
  metrics:AttendanceMetrics;
  trend:Array<{day:string;opened:number;finished:number}>;
  operators:AttendanceOperator[];
  departments:Array<{name:string;total:number}>;
  hours:Array<{hour:number;total:number}>;
  recurrent_contacts:number;
  attention:AttendanceAlert[];
};
export async function loadDashboardAttendances({
  organizationId,periodDays,signal,
}:{
  organizationId:string;periodDays:number;signal?:AbortSignal;
}):Promise<AttendanceDashboardData>{
  const days=Math.max(1,Math.min(365,Math.trunc(periodDays||30)));
  const query=supabase.rpc("load_dashboard_attendances_v1",{
    p_organization_id:organizationId,p_period_days:days,
  });
  const {data,error}=await (signal?query.abortSignal(signal):query);
  if(error)throw error;
  const result=data as Partial<AttendanceDashboardData>|null;
  if(!result?.metrics || !Array.isArray(result.trend) || !Array.isArray(result.operators)){
    throw new Error("O resumo de atendimentos retornou dados incompletos.");
  }
  return {
    threshold_minutes:Number(result.threshold_minutes||15),
    unanswered_after_minutes:Number(result.unanswered_after_minutes||15),
    metrics:result.metrics,
    trend:result.trend,
    operators:result.operators,
    departments:Array.isArray(result.departments)?result.departments:[],
    hours:Array.isArray(result.hours)?result.hours:[],
    recurrent_contacts:Number(result.recurrent_contacts||0),
    attention:Array.isArray(result.attention)?result.attention:[],
  };
}
