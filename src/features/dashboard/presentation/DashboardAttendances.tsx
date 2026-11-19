import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Activity,AlertCircle,ArrowLeftRight,CheckCircle2,Clock3,MessageSquare,RefreshCw,Users} from "lucide-react";
import {CartesianGrid,Legend,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import {AdminButton,AdminCard} from "@/shared/ui/admin/AdminLayout";
import {systemErrorMessage} from "@/shared/domain/error-message";
import {loadDashboardAttendances,type AttendanceDashboardData,type AttendanceAlert}
  from "../infrastructure/dashboard-attendances.repository";

type View="overview"|"operators"|"analytics";
type InboxFilter="waiting"|"in_att"|"unanswered"|"unread"|"forwarded"|"finished";
type Props={
  organizationId:string;periodDays:number;
  visible:(key:string)=>boolean;onRestore:()=>void;
  onOpenInbox?:(filter:InboxFilter,conversationId?:string,operatorId?:string)=>void;
};
const number=(value:number|null|undefined)=>Number(value||0).toLocaleString("pt-BR");
const duration=(value:number|null|undefined)=>{
  if(value==null||!Number.isFinite(value))return "—";
  const n=Math.max(0,Math.round(value));
  return n>=60?Math.floor(n/60)+"h "+(n%60)+"min":n+"min";
};
const ratio=(n:number,total:number)=>total>0?Math.round(100*n/total)+"%":"—";
const waitingDuration=(value:string|null)=>{
  const delta=value?Math.max(0,Math.floor((Date.now()-Date.parse(value))/60000)):NaN;
  return Number.isFinite(delta)?duration(delta):"—";
};
function Panel({title,subtitle,children}:{
  title:string;subtitle?:string;children:React.ReactNode;
}){
  return <AdminCard className="min-w-0 p-4 sm:p-5">
    <div className="mb-4">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {subtitle&&<p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
    {children}
  </AdminCard>;
}
function Stat({title,value,detail,icon:Icon,tone="blue",onClick}:{
  title:string;value:string|number;detail:string;icon:typeof Activity;
  tone?:"blue"|"red"|"amber"|"green";onClick?:()=>void;
}){
  const tones={blue:"bg-blue-500/10 text-blue-600 dark:text-blue-400",
    red:"bg-red-500/10 text-red-600 dark:text-red-400",
    amber:"bg-amber-500/10 text-amber-700 dark:text-amber-300",
    green:"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"};
  const card=<div className="flex min-h-28 items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
    <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl "+tones[tone]}><Icon size={19}/></div>
  </div>;
  return onClick?<button type="button" onClick={onClick} className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{card}</button>
    :<div className="min-w-0">{card}</div>;
}
function Trend({values}:{values:AttendanceDashboardData["trend"]}){
  const rows=values.map(r=>({day:r.day.slice(8,10)+"/"+r.day.slice(5,7),
    novos:Number(r.opened||0),finalizados:Number(r.finished||0)}));
  if(!rows.length)return <p className="py-16 text-center text-xs text-muted-foreground">Nenhum protocolo no período.</p>;
  return <div className="h-[300px] w-full min-w-0">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{top:8,right:16,left:-24,bottom:8}}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
        <XAxis dataKey="day" minTickGap={16} tick={{fontSize:10,fill:"var(--muted-foreground)"}}/>
        <YAxis allowDecimals={false} tick={{fontSize:11,fill:"var(--muted-foreground)"}}/>
        <Tooltip contentStyle={{background:"var(--card)",color:"var(--card-foreground)",
          border:"1px solid var(--border)",borderRadius:9}}/>
        <Legend wrapperStyle={{fontSize:12}}/>
        <Line dataKey="novos" name="Novos" stroke="#0131CD" strokeWidth={2.5} dot={false} isAnimationActive={false}/>
        <Line dataKey="finalizados" name="Finalizados" stroke="#059669" strokeWidth={2.5} dot={false} isAnimationActive={false}/>
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
function Bars({values,limit=12}:{
  values:Array<{name:string;total:number}>;limit?:number;
}){
  const rows=[...values].sort((a,b)=>b.total-a.total).slice(0,limit);
  if(!rows.length)return <p className="py-14 text-center text-xs text-muted-foreground">Sem registros no período.</p>;
  const largest=Math.max(1,...rows.map(r=>Number(r.total||0)));
  return <div className="max-h-[360px] space-y-4 overflow-y-auto">
    {rows.map((row,index)=><div key={row.name+"-"+index}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-semibold text-foreground" title={row.name}>{row.name}</span>
        <strong className="tabular-nums text-foreground">{number(row.total)}</strong>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{width:(100*row.total/largest)+"%"}}/>
      </div>
    </div>)}
  </div>;
}
function Queue({rows,limit,onOpenInbox}:{
  rows:AttendanceAlert[];limit:number;onOpenInbox?:Props["onOpenInbox"];
}){
  if(!rows.length)return <p className="py-14 text-center text-xs text-muted-foreground">Nenhum cliente aguardando resposta.</p>;
  return <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
    {rows.map(row=>{
      const diff=row.waiting_since?(Date.now()-Date.parse(row.waiting_since))/60000:0;
      const critical=diff>=limit;
      return <button key={row.conversation_id} type="button"
        onClick={()=>onOpenInbox?.(row.status==="waiting"?"waiting":"in_att",row.conversation_id)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left hover:bg-muted/40">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{row.contact_name||row.contact_phone||"Contato"}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{row.operator_name+" · "+row.department_name}</p>
        </div>
        <span className={"shrink-0 rounded-md px-2 py-1 text-[11px] font-bold "+(critical?"bg-red-500/10 text-red-600 dark:text-red-400":"bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
          {waitingDuration(row.waiting_since)}
        </span>
      </button>;
    })}
  </div>;
}
export function DashboardAttendances({organizationId,periodDays,visible,onRestore,onOpenInbox}:Props){
  const [view,setView]=useState<View>("overview");
  // Só é montado quando o usuário abre esta subseção. Nenhuma consulta no Dashboard geral.
  const report=useQuery({
    queryKey:["dashboard","attendances",organizationId,periodDays],
    queryFn:({signal})=>loadDashboardAttendances({organizationId,periodDays,signal}),
    enabled:Boolean(organizationId),
    staleTime:90_000,refetchInterval:120_000,refetchIntervalInBackground:false,
    refetchOnWindowFocus:false,retry:false,
  });
  const data=report.data;
  if(report.isPending&&!data)return <div className="grid grid-cols-2 gap-4 lg:grid-cols-3" aria-label="Preparando dashboard de atendimentos">
    {Array.from({length:6},(_,i)=><div key={i} className="h-28 animate-pulse rounded-xl bg-muted"/>)}
  </div>;
  if(report.isError&&!data)return <AdminCard className="mx-auto flex min-h-64 max-w-2xl flex-col items-center justify-center gap-3 p-6 text-center">
    <AlertCircle className="text-destructive" size={24}/>
    <p className="font-bold text-foreground">Não foi possível consultar os atendimentos.</p>
    <p className="text-xs text-muted-foreground">{systemErrorMessage(report.error)}</p>
    <AdminButton size="sm" onClick={()=>void report.refetch()}>Tentar novamente</AdminButton>
  </AdminCard>;
  if(!data)return null;
  const m=data.metrics;
  const visibleCount=["metrics","trend","situation","attention","operators","departments","hours","operations"].filter(visible).length;
  if(visibleCount===0)return <AdminCard className="p-8 text-center">
    <p className="mb-3 font-semibold text-foreground">Nenhum painel selecionado nesta seção.</p>
    <AdminButton size="sm" onClick={onRestore}>Mostrar todos</AdminButton>
  </AdminCard>;
  const status:Array<{name:string;total:number;filter:InboxFilter;color:string}>=[
    {name:"Em atendimento",total:m.active,filter:"in_att",color:"#0131CD"},
    {name:"Aguardando",total:m.waiting,filter:"waiting",color:"#eab308"},
    {name:"Encaminhados",total:m.forwarded,filter:"forwarded",color:"#8b5cf6"},
    {name:"Finalizados no período",total:m.finished,filter:"finished",color:"#059669"},
  ];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Painéis de atendimentos" className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {([["overview","Visão geral"],["operators","Operadores"],["analytics","Análises"]] as const).map(([id,label])=>
          <button key={id} type="button" role="tab" aria-selected={view===id} onClick={()=>setView(id)}
            className={"rounded-md px-3 py-2 text-xs font-bold "+(view===id?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted")}>
            {label}
          </button>)}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">WhatsApp Union · dados reais</span>
        <button type="button" aria-label="Atualizar indicadores" title="Atualizar indicadores"
          disabled={report.isFetching} onClick={()=>void report.refetch()}
          className="rounded-lg border border-border bg-card p-2 text-foreground hover:bg-muted disabled:opacity-50">
          <RefreshCw size={15} className={report.isFetching?"animate-spin":""}/>
        </button>
      </div>
    </div>
    {view==="overview"&&<>
      {visible("metrics")&&<div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat title="Em atendimento" value={number(m.active)} detail="Conversas ativas" icon={Activity} onClick={()=>onOpenInbox?.("in_att")}/>
        <Stat title="Aguardando" value={number(m.waiting)} detail="Na fila agora" icon={Clock3} tone="amber" onClick={()=>onOpenInbox?.("waiting")}/>
        <Stat title="Sem resposta" value={number(m.unanswered)} detail="Clientes esperando" icon={MessageSquare} tone="red" onClick={()=>onOpenInbox?.("unanswered")}/>
        <Stat title="Finalizados" value={number(m.finished)} detail="No período" icon={CheckCircle2} tone="green" onClick={()=>onOpenInbox?.("finished")}/>
        <Stat title="Primeira resposta" value={duration(m.avg_first_reply_minutes)} detail="Média válida" icon={Clock3}/>
        <Stat title="Dentro do SLA" value={ratio(m.sla_met,m.sla_valid)}
          detail={"Até "+data.threshold_minutes+" min · "+number(m.sla_valid)+" respostas"} icon={CheckCircle2} tone="green"/>
      </div>}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {visible("trend")&&<Panel title="Evolução dos atendimentos" subtitle="Novos protocolos x finalizados por dia">
          <Trend values={data.trend}/>
        </Panel>}
        {visible("situation")&&<Panel title="Distribuição por situação" subtitle="Status atual e encerramentos no período">
          <div className="space-y-4">
            {status.map(row=><button key={row.name} type="button" onClick={()=>onOpenInbox?.(row.filter)}
              className="block w-full rounded-lg p-1 text-left hover:bg-muted/40">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="font-semibold text-foreground">{row.name}</span><strong className="text-foreground">{number(row.total)}</strong>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{background:row.color,width:(100*row.total/Math.max(1,...status.map(s=>s.total)))+"%"}}/>
              </div>
            </button>)}
            <p className="text-[11px] text-muted-foreground">Encaminhados integra as conversas em atendimento; não deve ser somado às demais situações.</p>
          </div>
        </Panel>}
        {visible("attention")&&<Panel title="Clientes que precisam de atenção" subtitle="Fila e conversas sem resposta mais antigas">
          <Queue rows={data.attention} limit={data.threshold_minutes} onOpenInbox={onOpenInbox}/>
        </Panel>}
        {visible("operators")&&<Panel title="Carga de trabalho" subtitle="Conversas ativas por operador">
          <Bars values={data.operators.filter(o=>o.active>0).map(o=>({name:o.name,total:o.active}))}/>
          <button type="button" onClick={()=>setView("operators")} className="mt-4 text-xs font-bold text-primary hover:underline">Ver desempenho da equipe</button>
        </Panel>}
      </div>
    </>}
    {view==="operators"&&<>
      {visible("operators")&&<Panel title="Desempenho dos operadores" subtitle="Protocolos atribuídos no período; sem contagem artificial de mensagens">
        {data.operators.length===0?<p className="py-14 text-center text-xs text-muted-foreground">Nenhum operador no período.</p>
        :<div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground"><tr>
              {["Operador","Ativos","Recebidos","Finalizados","1ª resposta","SLA"].map(h=><th key={h} className="border-b border-border px-3 py-3 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">{data.operators.map(o=><tr key={o.id} className="hover:bg-muted/30">
              <td className="px-3 py-3"><button type="button" onClick={()=>onOpenInbox?.("in_att",undefined,o.id)} className="font-semibold text-primary hover:underline">{o.name}</button></td>
              <td className="px-3 py-3 tabular-nums">{number(o.active)}</td>
              <td className="px-3 py-3 tabular-nums">{number(o.opened)}</td>
              <td className="px-3 py-3 tabular-nums">{number(o.finished)}</td>
              <td className="px-3 py-3 tabular-nums">{duration(o.avg_first_reply_minutes)}</td>
              <td className="px-3 py-3 tabular-nums">{ratio(o.within_sla,o.answered)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Panel>}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {visible("operators")&&<Panel title="Carga atual por operador"><Bars values={data.operators.map(o=>({name:o.name,total:o.active}))}/></Panel>}
        {visible("operations")&&<Panel title="Critérios de medição">
          <p className="text-sm leading-6 text-muted-foreground">
            A primeira resposta só é calculada quando o horário é válido e posterior à abertura.
            O SLA usa o limite crítico configurado de {data.threshold_minutes} minutos.
            O tempo médio até a finalização inclui somente protocolos encerrados.
            O número de mensagens enviadas não é usado como indicador de produtividade.
          </p>
        </Panel>}
      </div>
    </>}
    {view==="analytics"&&<>
      {visible("operations")&&<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat title="Novos protocolos" value={number(m.opened)} detail="Abertos no período" icon={MessageSquare}/>
        <Stat title="Duração média" value={duration(m.avg_handle_minutes)} detail="Finalizados com horários válidos" icon={Clock3}/>
        <Stat title="Encaminhamentos" value={number(m.transfers)} detail="Transferências do período" icon={ArrowLeftRight}/>
        <Stat title="Clientes que retornaram" value={number(data.recurrent_contacts)} detail="Possuem protocolo anterior" icon={Users}/>
        <Stat title="Reaberturas" value={number(m.reopened)} detail="Eventos do período" icon={RefreshCw}/>
        <Stat title="Não lidas" value={number(m.unread)} detail="Conversas agora" icon={MessageSquare} onClick={()=>onOpenInbox?.("unread")}/>
      </div>}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {visible("hours")&&<Panel title="Horários de maior movimento" subtitle="Aberturas por hora local">
          <Bars limit={24} values={data.hours.map(h=>({name:String(h.hour).padStart(2,"0")+":00",total:h.total}))}/>
        </Panel>}
        {visible("departments")&&<Panel title="Atendimentos por departamento" subtitle="Protocolos abertos no período">
          <Bars values={data.departments}/>
        </Panel>}
      </div>
    </>}
    {Number(m.invalid_reply_times||0)>0&&<div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
      <AlertCircle size={17} className="shrink-0"/>
      {number(m.invalid_reply_times)} protocolos apresentam resposta anterior à abertura e foram excluídos das médias e do SLA.
    </div>}
    <p className="text-[11px] leading-5 text-muted-foreground">
      Dados exclusivos do WhatsApp Union. Situação atual e métricas históricas são diferentes.
      Atualização automática a cada 2 minutos apenas enquanto esta subseção estiver aberta.
      Não realiza consultas no histórico de mensagens nem no SAC Digital antigo.
    </p>
  </div>;
}
