import { Pause, Play } from 'lucide-react';
import { AdminButton } from '@/shared/ui/admin/AdminLayout';
import { queueControlState, type AvailabilityMap } from '../application/queue-availability';
import { isQueueSnapshotCurrent, type PbxQueueLive } from './UnionPbxQueueLiveStatus';

export function UnionPbxMemberAvailability({queueId,members,controls,status,now,ready,busy,onChange}:{
 queueId:string;members:{id:string;number:number;name:string}[];controls:AvailabilityMap;
 status:PbxQueueLive|undefined;now:number;ready:boolean;busy:boolean;
 onChange:(extensionId:string,paused:boolean)=>Promise<void>;
}) {
 const current=isQueueSnapshotCurrent(status,now);
 return <section className="mt-3 space-y-2 border-t border-border pt-3" aria-label="Pausa dos atendentes">
  <h3 className="text-xs font-semibold">Pausa dos atendentes</h3>
  {!ready && <p className="text-xs text-muted-foreground">Controle de pausa ainda indisponível nesta central. Atualize o acompanhamento após a habilitação.</p>}
  {members.map(member=>{
   const control=controls[queueId+'/'+member.id];
   const observed=status?.members.find(item=>item.number===member.number);
   const state=queueControlState(control,observed?.state==='paused',status?.sampled_at,now);
   const confirmed=current && Boolean(observed);
   return <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
    <div className="min-w-0"><p className="text-xs font-semibold">{member.number} · {member.name}</p>
     <p role="status" className="mt-1 text-[11px] text-muted-foreground">{state.pending
      ?control.desired_paused?'Pausa solicitada · aguardando confirmação':'Retomada solicitada · aguardando confirmação'
      :state.failed?'Última solicitação sem confirmação':!confirmed?'Sem leitura recente':state.paused?'Pausado nesta fila':'Sem pausa nesta fila'}</p></div>
    <AdminButton variant="secondary" size="sm" disabled={!ready || !confirmed || busy || state.pending}
     onClick={()=>onChange(member.id,!state.paused)} ariaLabel={`${state.paused?'Retomar':'Pausar'} ramal ${member.number} nesta fila`}>
     {state.paused?<Play size={14}/>:<Pause size={14}/>} {state.paused?'Retomar':'Pausar'}
    </AdminButton>
   </div>;
  })}
  <p className="text-[11px] leading-5 text-muted-foreground">A pausa impede novas ofertas apenas nesta fila e preserva a conversa em andamento. O estado só é confirmado após a leitura da central.</p>
 </section>;
}
