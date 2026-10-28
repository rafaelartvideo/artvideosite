import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, CalendarClock, CheckCircle2, Clock3, FileClock, Globe, History, Megaphone, Plus, ShieldAlert } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  createManagementTask, listManagementActivity, loadManagementTasks,
  restoreManagementFolder, restoreManagementRecord,
  type ManagementActivity, type ManagementFolder, type ManagementRecord, type ManagementSpace,
} from "../infrastructure/management.repository";

type Tab = "overview" | "domains" | "campaigns" | "activity" | "tasks" | "trash";
const TABS: { id:Tab;label:string }[] = [
  {id:"overview",label:"Visão geral"}, {id:"domains",label:"Sites e domínios"},
  {id:"campaigns",label:"Campanhas"}, {id:"activity",label:"Histórico"},
  {id:"tasks",label:"Tarefas"}, {id:"trash",label:"Lixeira"},
];
const fieldClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none";
const metaString = (r:ManagementRecord,key:string) => typeof r.metadata?.[key] === "string" ? String(r.metadata[key]) : "";
const toDate = (v:string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v+"T12:00:00") : null;
const daysTo = (date:string) => {
  const d=toDate(date);
  if(!d || Number.isNaN(d.getTime()))return null;
  const today=new Date();today.setHours(12,0,0,0);
  return Math.round((d.getTime()-today.getTime())/86400000);
};
function dateLabel(date:string) {
  const d=toDate(date);
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "Não informado";
}
function deadlineLabel(date:string) {
  const days=daysTo(date);
  return days===null ? "Sem vencimento" : days<0 ? `Vencido há ${Math.abs(days)} dia(s)` : days===0 ? "Vence hoje" : `Faltam ${days} dia(s)`;
}
function Deadline({date}:{date:string}) {
  const days=daysTo(date);
  return <span className={`rounded-md px-2 py-1 text-xs font-semibold ${days!==null&&days<=7?"bg-red-500/10 text-red-700 dark:text-red-300":days!==null&&days<=30?"bg-amber-500/10 text-amber-700 dark:text-amber-300":"bg-muted text-muted-foreground"}`}>{deadlineLabel(date)}</span>;
}
const openLink=(url:string) => /^https?:\/\//i.test(url) ? url : null;

export function ManagementWorkspaceTools({space,records,folders,canManage,organizationId,onRefresh}:{
  space:ManagementSpace;records:ManagementRecord[];folders:ManagementFolder[];
  canManage:boolean;organizationId:string|null;onRefresh:()=>void;
}) {
  const [tab,setTab]=useState<Tab>("overview");
  const [activity,setActivity]=useState<ManagementActivity[]>([]);
  const [tasks,setTasks]=useState<Awaited<ReturnType<typeof loadManagementTasks>>>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [taskDialog,setTaskDialog]=useState(false);
  const [taskTitle,setTaskTitle]=useState("");
  const [taskDue,setTaskDue]=useState("");
  const [taskPriority,setTaskPriority]=useState<"normal"|"high"|"urgent">("normal");
  const [revision,setRevision]=useState(0);
  const active=useMemo(()=>records.filter(r=>!r.deleted_at),[records]);
  const domains=useMemo(()=>active.filter(r=>r.kind==="website"),[active]);
  const campaigns=useMemo(()=>active.filter(r=>r.kind==="campaign"),[active]);
  const expiring=useMemo(()=>domains.flatMap(r=>["renewal_date","ssl_expires_at"]
    .map(key=>({record:r,key,date:metaString(r,key),days:daysTo(metaString(r,key))}))
    .filter(x=>x.days!==null&&x.days<=30)).sort((a,b)=>(a.days??0)-(b.days??0)),[domains]);
  const trashedRecords=records.filter(r=>Boolean(r.deleted_at));
  const trashedFolders=folders.filter(f=>Boolean(f.deleted_at) && (!f.parent_id || !folders.find(p=>p.id===f.parent_id)?.deleted_at));
  useEffect(()=>{setTab("overview");setActivity([]);setTasks([]);},[space.id]);
  useEffect(()=>{
    if(tab!=="activity"&&tab!=="tasks")return;
    let alive=true;
    setLoading(true);
    const request=tab==="activity"?listManagementActivity(space.id):loadManagementTasks(space.id);
    request.then(data=>{if(!alive)return;if(tab==="activity")setActivity(data as ManagementActivity[]);else setTasks(data as typeof tasks);})
      .catch(error=>{if(alive)notifyAdmin(systemErrorMessage(error,"Não foi possível carregar esta seção."),"error");})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[space.id,tab,revision]);
  const restore=async(kind:"record"|"folder",id:string)=>{
    setBusy(true);
    try {
      if(kind==="record")await restoreManagementRecord(id);else await restoreManagementFolder(id);
      notifyAdmin("Item restaurado.");onRefresh();setRevision(x=>x+1);
    }catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível restaurar."),"error");}
    finally{setBusy(false);}
  };
  const createTask=async()=>{
    if(!canManage||!organizationId||!taskTitle.trim())return;
    setBusy(true);
    try {
      const dueAt=taskDue?new Date(taskDue).toISOString():null;
      await createManagementTask({organizationId,spaceId:space.id,title:taskTitle,dueAt,priority:taskPriority});
      setTaskTitle("");setTaskDue("");setTaskDialog(false);
      setRevision(v=>v+1);notifyAdmin("Tarefa adicionada ao módulo Compromissos e Tarefas.");
    }catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível criar a tarefa."),"error");}
    finally{setBusy(false);}
  };
  return <section className="space-y-3">
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Gestão do projeto">
      {TABS.map(item=><button key={item.id} type="button" role="tab" aria-selected={tab===item.id}
        onClick={()=>setTab(item.id)} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${tab===item.id?"border-primary bg-primary text-primary-foreground":"border-border bg-card text-muted-foreground hover:bg-muted"}`}>{item.label}{item.id==="trash"&&trashedRecords.length+trashedFolders.length>0?` (${trashedRecords.length+trashedFolders.length})`:""}</button>)}
    </div>
    {tab==="overview"&&<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[
        {label:"Registros ativos",value:active.length,Icon:FileClock},
        {label:"Sites e domínios",value:domains.length,Icon:Globe},
        {label:"Campanhas",value:campaigns.length,Icon:Megaphone},
        {label:"Prazos próximos",value:expiring.length,Icon:CalendarClock},
      ].map(m=><div key={m.label} className="rounded-xl border border-border bg-card p-4">
        <m.Icon size={19} className="mb-3 text-primary"/><p className="text-2xl font-bold text-foreground">{m.value}</p><p className="text-xs text-muted-foreground">{m.label}</p>
      </div>)}
      {expiring.length>0&&<div className="col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 md:col-span-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldAlert size={17}/>Atenção aos vencimentos</div>
        <div className="mt-3 flex flex-col gap-2">{expiring.slice(0,6).map(e=><div key={e.record.id+e.key} className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-foreground">{e.record.title} · {e.key==="renewal_date"?"Renovação do domínio":"Certificado SSL"}</span><Deadline date={e.date}/>
        </div>)}</div>
      </div>}
    </div>}
    {tab==="domains"&&<div className="space-y-2">
      <p className="text-xs text-muted-foreground">Prazos sinalizados automaticamente nesta Central. Cadastre ou edite os detalhes pelo registro do tipo Site / domínio.</p>
      {!domains.length?<p className="py-8 text-center text-sm text-muted-foreground">Nenhum site ou domínio cadastrado.</p>:domains.map(r=><div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
        <Globe size={18} className="text-primary"/><div className="min-w-[160px] flex-1"><p className="font-semibold text-foreground">{r.title}</p>
          <p className="text-xs text-muted-foreground">Registro: {metaString(r,"registrar")||"—"} · Hospedagem: {metaString(r,"hosting")||"—"}</p>
          {r.url&&openLink(r.url)&&<a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Abrir site</a>}
        </div>
        <div className="space-y-1 text-right text-xs"><p>Renovação: {dateLabel(metaString(r,"renewal_date"))}</p><Deadline date={metaString(r,"renewal_date")}/></div>
        <div className="space-y-1 text-right text-xs"><p>SSL: {dateLabel(metaString(r,"ssl_expires_at"))}</p><Deadline date={metaString(r,"ssl_expires_at")}/></div>
      </div>)}
    </div>}
    {tab==="campaigns"&&<div className="space-y-2">
      {!campaigns.length?<p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha cadastrada.</p>:campaigns.map(r=><div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
        <Megaphone size={18} className="text-primary"/><div className="min-w-[170px] flex-1"><p className="text-sm font-semibold text-foreground">{r.title}</p><p className="text-xs text-muted-foreground">{metaString(r,"platform")||"Sem plataforma"} · {metaString(r,"objective")||"Sem objetivo"}</p></div>
        <span className="text-xs text-muted-foreground">{metaString(r,"campaign_status")||"Planejada"}</span>
        <div className="text-right text-xs text-muted-foreground"><p>{dateLabel(metaString(r,"campaign_start"))} até {dateLabel(metaString(r,"campaign_end"))}</p><p>Orçamento: {Number(metaString(r,"budget")||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p></div>
      </div>)}
    </div>}
    {loading&&(tab==="activity"||tab==="tasks")?<LoadingState text="Carregando informações"/>:null}
    {!loading&&tab==="activity"&&<div className="max-h-[450px] space-y-2 overflow-y-auto">
      {!activity.length?<p className="py-8 text-center text-sm text-muted-foreground">Ainda não há atividades registradas.</p>:activity.map(a=><div key={a.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
        <History size={16} className="shrink-0 text-primary"/><div className="flex-1"><p className="text-sm font-medium text-foreground">{a.label||a.entity_type}</p><p className="text-xs text-muted-foreground">{a.entity_type} · {a.operation}</p></div>
        <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
      </div>)}
    </div>}
    {tab==="tasks"&&<div className="space-y-3">
      {canManage&&<div className="flex justify-end"><AdminButton size="sm" onClick={()=>setTaskDialog(true)}><Plus size={14}/>Nova tarefa</AdminButton></div>}
      {!loading&&(!tasks.length?<p className="py-8 text-center text-sm text-muted-foreground">Nenhuma tarefa vinculada. As tarefas criadas aqui também ficam no módulo de Compromissos e Tarefas.</p>:tasks.map(t=><div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        {t.status==="completed"?<CheckCircle2 size={18} className="text-emerald-600"/>:<Clock3 size={18} className="text-primary"/>}
        <div className="flex-1"><p className="text-sm font-semibold text-foreground">{t.title}</p><p className="text-xs text-muted-foreground">{t.status} · {t.priority}</p></div>
        <span className="text-xs text-muted-foreground">{t.due_at?new Date(t.due_at).toLocaleDateString("pt-BR"):"Sem prazo"}</span>
      </div>))}
    </div>}
    {tab==="trash"&&<div className="space-y-2">
      {!trashedFolders.length&&!trashedRecords.length?<p className="py-8 text-center text-sm text-muted-foreground">A lixeira está vazia.</p>:<>
        <p className="text-xs text-muted-foreground">Os arquivos e versões são preservados. Para restaurar itens de uma subpasta, restaure primeiro a pasta superior.</p>
        {trashedFolders.map(f=><div key={f.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <span className="flex-1 text-sm text-foreground">Pasta: {f.name}</span>
          {canManage&&<AdminButton size="sm" variant="secondary" disabled={busy} onClick={()=>void restore("folder",f.id)}><ArchiveRestore size={14}/>Restaurar</AdminButton>}
        </div>)}
        {trashedRecords.filter(r=>!folders.find(f=>f.id===r.folder_id)?.deleted_at).map(r=><div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <span className="flex-1 text-sm text-foreground">{r.title}</span>
          {canManage&&<AdminButton size="sm" variant="secondary" disabled={busy} onClick={()=>void restore("record",r.id)}><ArchiveRestore size={14}/>Restaurar</AdminButton>}
        </div>)}
      </>}
    </div>}
    <AdminDialog open={taskDialog} title="Nova tarefa do projeto" onClose={()=>!busy&&setTaskDialog(false)}
      footer={<div className="flex justify-end gap-2"><AdminButton variant="secondary" disabled={busy} onClick={()=>setTaskDialog(false)}>Cancelar</AdminButton><AdminButton loading={busy} disabled={!taskTitle.trim()||!organizationId} onClick={()=>void createTask()}>Salvar tarefa</AdminButton></div>}>
      <div className="space-y-4">
        <label className="block space-y-1"><span className="text-xs font-semibold">Título</span><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} maxLength={160} className={fieldClass}/></label>
        <label className="block space-y-1"><span className="text-xs font-semibold">Vencimento (opcional)</span><input type="datetime-local" value={taskDue} onChange={e=>setTaskDue(e.target.value)} className={fieldClass}/></label>
        <label className="block space-y-1"><span className="text-xs font-semibold">Prioridade</span><select value={taskPriority} onChange={e=>setTaskPriority(e.target.value as typeof taskPriority)} className={fieldClass}>
          <option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
        </select></label>
        <p className="text-xs text-muted-foreground">Prazos com data ativam lembretes do módulo de tarefas (24 horas e 1 hora antes), conforme o sistema de notificações existente.</p>
      </div>
    </AdminDialog>
  </section>;
}
