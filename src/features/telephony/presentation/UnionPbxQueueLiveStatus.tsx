import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pbxRequest } from "../application/pbx-request";
import { mergeAvailability, newestQueueSnapshot, type AvailabilityMap, type QueueMemberControl } from '../application/queue-availability';

export type PbxMemberLive = {
  number: number;
  state: "available" | "busy" | "ringing" | "paused" | "unavailable" | "unknown";
};
export type PbxQueueLive = {
  queue_id: string;
  organization_id: string;
  queue_state: "active" | "missing" | "unknown";
  waiting_count: number;
  sampled_at: string;
  members: PbxMemberLive[];
};
type LiveMap = Record<string, PbxQueueLive>;
const ACTIVE_WINDOW_MS = 95_000;

export function usePbxQueueLive(organizationId: string | null | undefined, revision=0) {
  const [items,setItems]=useState<LiveMap>({});
  const [now,setNow]=useState(() => Date.now());
  const [error,setError]=useState("");
  const [controls,setControls]=useState<AvailabilityMap>({});
  const [ready,setReady]=useState(false);
  const [controlError,setControlError]=useState('');
  const [controlsRevision,setControlsRevision]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    const controller=new AbortController();
    setControlError('');
    if(!organizationId)return()=>controller.abort();
    void pbxRequest(signal=>Promise.all([
      supabase.from('pbx_queue_member_controls').select('organization_id,queue_id,extension_id,revision,request_generation,desired_paused,status,updated_at,last_checked_at,last_error')
       .eq('organization_id',organizationId).limit(1000).abortSignal(signal),
      supabase.rpc('pbx_queue_controls_ready',{p_organization_id:organizationId}).abortSignal(signal),
    ]),'Disponibilidade dos atendentes',{signal:controller.signal}).then(([rows,availability])=>{
      if(cancelled)return;
      if(rows.error || availability.error){setReady(false);setControlError('Não foi possível confirmar os controles de pausa.');return;}
      setControls(previous=>mergeAvailability(previous,(rows.data||[]) as QueueMemberControl[],organizationId));
      setReady(availability.data===true);
    }).catch(()=>{if(!cancelled){setReady(false);setControlError('A consulta da disponibilidade não foi confirmada.');}});
    return()=>{cancelled=true;controller.abort();};
  },[organizationId,revision,controlsRevision]);

  useEffect(()=>{
    let cancelled=false;
    const controller=new AbortController();
    setItems({});
    setControls({});setReady(false);
    setError("");
    if(!organizationId) return () => {cancelled=true;};

    // One initial fetch and one realtime channel per open management screen.
    // No repeated database queries, even with many queues.
    void pbxRequest(signal => supabase.from("pbx_queue_live_status")
      .select("queue_id,organization_id,queue_state,waiting_count,members,sampled_at")
      .eq("organization_id",organizationId)
      .limit(50).abortSignal(signal), 'Acompanhamento das filas', { signal: controller.signal })
      .then(({data,error:fetchError})=>{
        if(cancelled) return;
        if(fetchError) setError("Não foi possível consultar o acompanhamento das filas.");
        else setItems(previous=>{
          const next={...previous};
          for(const item of (data||[]) as PbxQueueLive[]){
            next[item.queue_id]=newestQueueSnapshot(next[item.queue_id],item);
          }
          return next;
        });
      }).catch(()=>{if(!cancelled)setError('A consulta das filas não foi confirmada. Atualize a página para tentar novamente.');});

    const channel=supabase.channel("pbx-queue-live-"+organizationId)
      .on("postgres_changes",{
        event:"*",schema:"public",table:"pbx_queue_live_status",
        filter:"organization_id=eq."+organizationId,
      },(payload)=>{
        if(cancelled) return;
        if(payload.eventType==="DELETE"){
          const removed=(payload.old as {queue_id?:string})?.queue_id;
          if(removed) setItems(prev=>{
            const next={...prev};delete next[removed];return next;
          });
        } else if(payload.new && typeof payload.new==="object") {
          const item=payload.new as PbxQueueLive;
          if(item.organization_id!==organizationId) return;
          setItems(prev=>({...prev,[item.queue_id]:newestQueueSnapshot(prev[item.queue_id],item)}));
          setNow(Date.now());
        }
      }).on('postgres_changes',{
        event:'*',schema:'public',table:'pbx_queue_member_controls',filter:'organization_id=eq.'+organizationId,
      },payload=>{
        if(cancelled || payload.eventType==='DELETE')return;
        const row=payload.new as QueueMemberControl;
        if(row.organization_id!==organizationId)return;
        setControls(previous=>mergeAvailability(previous,[row],organizationId));
      }).subscribe();
    return ()=>{
      cancelled=true;
      controller.abort();
      void supabase.removeChannel(channel);
    };
  },[organizationId,revision]);

  useEffect(()=>{
    const id=window.setInterval(()=>setNow(Date.now()),15_000);
    return ()=>window.clearInterval(id);
  },[]);

  return {items,now,error,controls,ready,controlError,refreshControls:()=>setControlsRevision(value=>value+1)};
}

export function isQueueSnapshotCurrent(item:PbxQueueLive|null|undefined,now:number) {
  if(!item || item.queue_state!=="active") return false;
  const sampled=Date.parse(item.sampled_at);
  return Number.isFinite(sampled) && sampled<=now+5000 && now-sampled<=ACTIVE_WINDOW_MS;
}

const memberLabels:Record<PbxMemberLive["state"],string>={
  available:"Disponível",
  busy:"Em ligação",
  ringing:"Chamando",
  paused:"Pausado",
  unavailable:"Indisponível",
  unknown:"Não confirmado",
};

export function QueueLiveDetails({status,now}:{
  status:PbxQueueLive|null|undefined;now:number;
}) {
  const current=isQueueSnapshotCurrent(status,now);
  const available=current?(status?.members||[]).filter(item=>item.state==="available").length:0;
  const busy=current?(status?.members||[]).filter(item=>item.state==="busy").length:0;
  const waiting=current?status?.waiting_count:undefined;
  return <section aria-label="Acompanhamento da fila" className="mt-3 space-y-2 border-t border-border pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold text-foreground">Acompanhamento da fila</span>
      <span className="text-xs text-muted-foreground">
        {current ? "Dados recentes da VPS" :
          status?.queue_state==="missing" ? "Fila não encontrada no Asterisk" :
          status ? "Dados desatualizados" : "Aguardando dados da VPS"}
      </span>
    </div>
    {current ? <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 px-2 py-2">
          <p className="text-lg font-semibold tabular-nums text-foreground">{waiting}</p>
          <p className="text-[11px] text-muted-foreground">Na espera</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-2">
          <p className="text-lg font-semibold tabular-nums text-foreground">{available}</p>
          <p className="text-[11px] text-muted-foreground">Disponíveis</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-2">
          <p className="text-lg font-semibold tabular-nums text-foreground">{busy}</p>
          <p className="text-[11px] text-muted-foreground">Ocupados</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(status?.members||[]).map(member=>(
          <span key={member.number} className="rounded-md border border-border px-2 py-1 text-xs text-foreground">
            {member.number} · {memberLabels[member.state]||"Não confirmado"}
          </span>
        ))}
      </div>
    </> : <p className="text-xs leading-5 text-muted-foreground">
      Sem confirmação recente da VPS. Os ramais podem continuar conectados, mas a disponibilidade não pode ser garantida.
    </p>}
    <p className="text-[11px] text-muted-foreground">
      {status && Number.isFinite(Date.parse(status.sampled_at)) ?
        "Última leitura: "+new Date(status.sampled_at).toLocaleString("pt-BR") :
        "A leitura será enviada pelo agente da VPS atualizado."}
      {" · Aproximadamente a cada 30 segundos"}
    </p>
  </section>;
}
