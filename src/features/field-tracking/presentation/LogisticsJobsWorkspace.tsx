import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useAuth } from "@/lib/auth";
import { advanceJob, listJobs, requestJob, type JobKind, type JobStatus, type LogisticsJob } from "../infrastructure/logistics-jobs.repository";
import { listFleet } from "../infrastructure/logistics.repository";

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const labels:Record<JobStatus,string>={requested:"Solicitada",assigned:"Atribuída",loaded:"Carregada",arrived:"Chegada ao cliente",collected:"Coletada · em transporte",received:"Recebida na assistência",delivered:"Entregue ao cliente",cancelled:"Cancelada"};
const title=(kind:JobKind)=>kind==="pickup"?"Coleta":"Entrega";
const date=(value:string)=>new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
const next=(job:LogisticsJob):JobStatus|null=>{
  if(job.status==="requested")return "assigned";
  if(job.kind==="pickup")return ({assigned:"arrived",arrived:"collected",collected:"received"} as Partial<Record<JobStatus,JobStatus>>)[job.status]??null;
  return ({assigned:"loaded",loaded:"arrived",arrived:"delivered"} as Partial<Record<JobStatus,JobStatus>>)[job.status]??null;
};

export function OrderLogisticsSection({order}:{order:any}) {
  const {activeOrganizationId,hasPermission,hasModule}=useAuth();
  if(!activeOrganizationId||order.organization_id!==activeOrganizationId||!hasModule("field_tracking")||!hasPermission("field_tracking.view")||!hasPermission("field_tracking.manage")) return null;
  return <OrderLogisticsDialog key={activeOrganizationId+":"+order.id} org={activeOrganizationId} order={order}/>;
}
function OrderLogisticsDialog({org,order}:{org:string;order:any}) {
  const [open,setOpen]=useState(false);
  const [kind,setKind]=useState<JobKind>("pickup");
  const [address,setAddress]=useState([order.service_street,order.service_number,order.service_neighborhood,order.service_city,order.service_state,order.service_zip_code].filter(Boolean).join(", "));
  const [start,setStart]=useState("");
  const [end,setEnd]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const qc=useQueryClient();
  const jobs=useQuery({queryKey:["logistics-jobs",org,order.id],queryFn:()=>listJobs(org,order.id),enabled:open,retry:false,refetchOnWindowFocus:false,staleTime:30000});
  const save=async()=>{
    if(busy||address.trim().length<5||!start||!end||!(Date.parse(end)>Date.parse(start)))return;
    setBusy(true);setError("");setSuccess("");
    try{
      await requestJob(org,order.id,{kind,address:address.trim(),window_start:new Date(start).toISOString(),window_end:new Date(end).toISOString()});
      setSuccess("Solicitação registrada.");setStart("");setEnd("");
      await qc.invalidateQueries({queryKey:["logistics-jobs",org]});
    }catch(e){setError(systemErrorMessage(e));}finally{setBusy(false);}
  };
  return <AdminCard className="flex flex-wrap items-center justify-between gap-2 p-3">
    <div><h2 className="text-sm font-semibold">Logística</h2><p className="text-xs text-muted-foreground">Solicitações de coleta e entrega desta OS</p></div>
    <AdminButton variant="secondary" onClick={()=>{setOpen(true);setError("");setSuccess("");}}>Coletas e entregas</AdminButton>
    <AdminDialog open={open} onClose={()=>{if(!busy)setOpen(false);}} title="Coletas e entregas" className="max-w-xl">
      <div className="space-y-3 p-1">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void save();}}>
          <label className="text-xs sm:col-span-2">Operação<select className={field} value={kind} onChange={e=>setKind(e.target.value as JobKind)}><option value="pickup">Solicitar coleta</option><option value="delivery">Solicitar entrega</option></select></label>
          <label className="text-xs sm:col-span-2">Endereço confirmado<textarea className={field} required minLength={5} maxLength={1000} value={address} onChange={e=>setAddress(e.target.value)}/></label>
          <label className="text-xs">Início da janela<input className={field} type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label className="text-xs">Fim da janela<input className={field} type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
          <p className="text-xs text-muted-foreground sm:col-span-2">Horário local do dispositivo. Confirme o endereço antes de solicitar.</p>
          <button disabled={busy||jobs.isError||jobs.isPending||!start||!end||!(Date.parse(end)>Date.parse(start))||address.trim().length<5} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50 sm:col-span-2">Registrar solicitação</button>
        </form>
        {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
        {success&&<p role="status" className="text-sm text-emerald-600">{success}</p>}
        <h3 className="text-sm font-semibold">Histórico logístico</h3>
        {jobs.isError?<p role="alert" className="text-sm text-muted-foreground">Estrutura logística indisponível ou sem acesso.</p>:jobs.isPending?<p className="text-sm">Carregando...</p>:!jobs.data?.length?<p className="text-sm text-muted-foreground">Nenhuma solicitação.</p>:jobs.data.map(job=><div key={job.id} className="border-t border-border pt-2 text-sm"><strong>{title(job.kind)} · {labels[job.status]}</strong><p className="text-xs text-muted-foreground">{date(job.window_start)} – {date(job.window_end)}</p><p className="text-xs">{job.address}</p></div>)}
      </div>
    </AdminDialog>
  </AdminCard>;
}
export function LogisticsJobsWorkspace({organizationId:org}:{organizationId:string}) {
  const jobs=useQuery({queryKey:["logistics-jobs",org],queryFn:()=>listJobs(org),staleTime:30000,retry:false,refetchOnWindowFocus:false});
  const fleet=useQuery({queryKey:["logistics-fleet",org],queryFn:()=>listFleet(org),staleTime:60000,retry:false,refetchOnWindowFocus:false});
  const qc=useQueryClient();
  const [selected,setSelected]=useState<{job:LogisticsJob;status:JobStatus}|null>(null);
  const [shift,setShift]=useState("");
  const [person,setPerson]=useState("");
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const choose=(job:LogisticsJob,status:JobStatus)=>{setSelected({job,status});setShift("");setPerson("");setNotes("");setError("");};
  const needsPerson=selected&&["loaded","collected","received","delivered"].includes(selected.status);
  const confirm=async()=>{
    if(!selected||busy||(selected.status==="assigned"&&!shift)||(needsPerson&&!person.trim())||(selected.status==="cancelled"&&!notes.trim()))return;
    setBusy(true);setError("");
    try{
      await advanceJob(org,selected.job,selected.status,{...(selected.status==="assigned"?{shift_id:shift}:{}),...(needsPerson?{recipient:person.trim()}:{}),...(notes.trim()?{notes:notes.trim()}: {})});
      setSelected(null);await qc.invalidateQueries({queryKey:["logistics-jobs",org]});
    }catch(e){setError(systemErrorMessage(e));}finally{setBusy(false);}
  };
  if(jobs.isPending||fleet.isPending)return <AdminCard className="p-4">Carregando operações...</AdminCard>;
  if(jobs.isError||fleet.isError||!fleet.data)return <AdminCard className="space-y-2 p-4"><p role="alert" className="text-sm">Não foi possível consultar operações e jornadas.</p><AdminButton variant="secondary" onClick={()=>{void jobs.refetch();void fleet.refetch();}}>Atualizar</AdminButton></AdminCard>;
  const {drivers,employees,vehicles,activeShifts}=fleet.data;
  const shiftName=(id:string)=>{const s=activeShifts.find(x=>x.id===id);if(!s)return "Jornada indisponível";return (employees.find(e=>e.id===drivers.find(d=>d.id===s.driver_id)?.employee_id)?.full_name??"Motorista")+" · "+(vehicles.find(v=>v.id===s.vehicle_id)?.name??"Veículo");};
  return <AdminCard className="space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Coletas e entregas em aberto</h2><AdminButton variant="secondary" loading={jobs.isFetching} onClick={()=>{void jobs.refetch();void fleet.refetch();}}>Atualizar</AdminButton></div>
    <p className="text-xs text-muted-foreground">Até 200 operações, ordenadas por horário agendado. Solicite novas operações nos detalhes da OS.</p>
    {!jobs.data?.length&&<p className="text-sm text-muted-foreground">Nenhuma operação aberta.</p>}
    {jobs.data?.map(job=><div key={job.id} className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-sm">{title(job.kind)} · OS {job.order_number??"—"}</strong><p className="text-xs text-muted-foreground">{labels[job.status]}</p></div><span className="text-xs">{date(job.window_start)} – {date(job.window_end)}</span></div>
      <p className="text-sm">{job.address}</p>
      {job.shift_id&&<p className="text-xs text-muted-foreground">{shiftName(job.shift_id)}</p>}
      <div className="flex flex-wrap gap-2">{next(job)&&<AdminButton variant="primary" onClick={()=>choose(job,next(job)!)}>{({assigned:"Atribuir jornada",loaded:"Confirmar carregamento",arrived:"Confirmar chegada",collected:"Confirmar coleta",received:"Confirmar recebimento",delivered:"Confirmar entrega"} as Partial<Record<JobStatus,string>>)[next(job)!]}</AdminButton>}{["requested","assigned"].includes(job.status)&&<AdminButton variant="secondary" onClick={()=>choose(job,"cancelled")}>Cancelar</AdminButton>}</div>
    </div>)}
    <AdminDialog open={Boolean(selected)} onClose={()=>{if(!busy)setSelected(null);}} title={selected?labels[selected.status]:"Operação"} className="max-w-lg">
      {selected&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void confirm();}}>
        {selected.status==="assigned"&&<label className="block text-xs">Jornada aberta<select className={field} value={shift} onChange={e=>setShift(e.target.value)} required><option value="">Selecione</option>{activeShifts.map(s=><option key={s.id} value={s.id}>{shiftName(s.id)}</option>)}</select></label>}
        {needsPerson&&<label className="block text-xs">Nome de quem entregou ou recebeu<input className={field} required maxLength={200} value={person} onChange={e=>setPerson(e.target.value)}/></label>}
        <label className="block text-xs">{selected.status==="cancelled"?"Motivo do cancelamento":"Observação (opcional)"}<textarea className={field} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000} required={selected.status==="cancelled"}/></label>
        {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy||(selected.status==="assigned"&&!shift)||(Boolean(needsPerson)&&!person.trim())||(selected.status==="cancelled"&&!notes.trim())}>Confirmar</button>
      </form>}
    </AdminDialog>
  </AdminCard>;
}
