import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Section, BtnSecondary } from '@/shared/ui/admin/AdminLayout';
import { FInput, FIntegerInput, FSelect, FTextarea, FToggle } from '@/shared/ui/admin/AdminFormControls';
import { bookingConfig, effectiveWeeklySlots } from '@/features/public-services/domain/service-booking.mjs';
import { formatZipCode } from '@/lib/address';
import { RichTextEditor } from '@/shared/ui/admin/RichTextEditor';

export function ServiceBookingSettings({ value, onChange }: {value:any;onChange:(value:any)=>void}) {
 const c=bookingConfig(value);
 const testimonials=Array.isArray(c.testimonials)?c.testimonials:[];
 const set=(key:string,v:any)=>onChange({...c,[key]:v});
 const moveOrientation=(index:number,direction:number)=>{
  const target=index+direction;
  if(target<0||target>=c.orientations.length)return;
  const copy=[...c.orientations];
  [copy[index],copy[target]]=[copy[target],copy[index]];
  set('orientations',copy);
 };
 const dayNames=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
 const weekly=effectiveWeeklySlots(c);
 const setDaySlots=(day:number,slots:{start:string;end:string}[])=>onChange({...c,weekly_slots:{...weekly,[String(day)]:slots}});
 const toggleDay=(day:number,enabled:boolean)=>{
  const weekdays=enabled?[...new Set([...(c.weekdays||[]),day])].sort((a,b)=>a-b):(c.weekdays||[]).filter((d:number)=>d!==day);
  const daySlots=weekly[String(day)]||[];
  onChange({...c,weekdays,weekly_slots:{...weekly,[String(day)]:enabled && !daySlots.length?[{start:'',end:''}]:daySlots}});
 };
 return <div className="space-y-5">
  <Section title="Cobertura do atendimento"><div className="space-y-4">
   <FSelect label="Consulta de CEP" value={c.coverage_mode} onChange={(e:any)=>set('coverage_mode',e.target.value)} options={[{value:'consult',label:'A equipe confirma a cobertura'},{value:'ranges',label:'Atender somente nas faixas de CEP configuradas'}]}/>
   {c.coverage_mode==='ranges' && <>{c.cep_ranges.map((r:any,i:number)=><div key={i} className="flex items-end gap-3"><FInput label="CEP inicial" value={r.start} onChange={(e:any)=>set('cep_ranges',c.cep_ranges.map((v:any,j:number)=>i===j?{...v,start:formatZipCode(e.target.value)}:v))}/><FInput label="CEP final" value={r.end} onChange={(e:any)=>set('cep_ranges',c.cep_ranges.map((v:any,j:number)=>i===j?{...v,end:formatZipCode(e.target.value)}:v))}/><button type="button" aria-label="Remover faixa de CEP" className="p-3 text-red-600" onClick={()=>set('cep_ranges',c.cep_ranges.filter((_:any,j:number)=>i!==j))}><Trash2 size={16}/></button></div>)}<BtnSecondary onClick={()=>set('cep_ranges',[...c.cep_ranges,{start:'',end:''}])}><Plus size={15}/> Adicionar faixa</BtnSecondary></>}
  </div></Section>
  <Section title="Dias e horários"><div className="space-y-4">
   <FToggle label="Permitir escolher uma preferência de agendamento" description="A data será confirmada pela Artvideo após a análise do orçamento." checked={c.schedule_enabled} onChange={(v:boolean)=>set('schedule_enabled',v)}/>
   {c.schedule_enabled && <>
    <div className="space-y-3">
     <p className="text-xs leading-5 text-muted-foreground">Ative os dias de atendimento e defina um ou mais intervalos de horário para cada dia. Dias desativados não aparecem no calendário do cliente.</p>
     {dayNames.map((name,day)=>{
      const active=(c.weekdays||[]).includes(day);
      const slots=weekly[String(day)]||[];
      const completed=slots.filter((s:{start:string;end:string})=>s.start && s.end && s.end>s.start).length;
      return <div key={day} className={`overflow-hidden rounded-xl border transition-colors ${active?'border-blue-300 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20':'border-border bg-background'}`}>
       <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
         <p className="text-sm font-semibold">{name}</p>
         <p className="mt-0.5 text-xs text-muted-foreground">{active?`${completed} ${completed===1?'intervalo definido':'intervalos definidos'}${completed<slots.length?' · horários a preencher':''}`:'Sem atendimento'}</p>
        </div>
        <FToggle label={active?'Ativo':'Inativo'} checked={active} onChange={(enabled:boolean)=>toggleDay(day,enabled)}/>
       </div>
       {active&&<div className="space-y-3 border-t border-border px-4 pb-4 pt-4">
        {slots.map((slot:{start:string;end:string},index:number)=><div key={index} className="flex min-w-0 items-end gap-2 sm:gap-3">
         <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:gap-3">
          <FInput label="Início" type="time" value={slot.start} onChange={(e:any)=>setDaySlots(day,slots.map((s:{start:string;end:string},i:number)=>i===index?{...s,start:e.target.value}:s))}/>
          <FInput label="Fim" type="time" value={slot.end} onChange={(e:any)=>setDaySlots(day,slots.map((s:{start:string;end:string},i:number)=>i===index?{...s,end:e.target.value}:s))}/>
         </div>
         <button type="button" aria-label={`Remover intervalo de ${name}`} title="Remover intervalo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30" onClick={()=>setDaySlots(day,slots.filter((_:any,i:number)=>i!==index))}><Trash2 size={17}/></button>
        </div>)}
        {!slots.length&&<p className="text-xs text-amber-700 dark:text-amber-300">Adicione pelo menos um intervalo para permitir agendamento neste dia.</p>}
        <BtnSecondary onClick={()=>setDaySlots(day,[...slots,{start:'',end:''}])}><Plus size={15}/> Adicionar horário em {name}</BtnSecondary>
       </div>}
      </div>;
     })}
    </div>
    <div className="grid gap-4 sm:grid-cols-2"><FIntegerInput label="Antecedência mínima (dias)" value={String(c.lead_days)} onChange={(e:any)=>set('lead_days',Number(e.target.value))}/><FIntegerInput label="Exibir próximos dias (até 90)" value={String(c.horizon_days)} onChange={(e:any)=>set('horizon_days',Number(e.target.value))}/></div>
    <FTextarea label="Datas bloqueadas (uma por linha, AAAA-MM-DD)" value={c.blocked_dates.join('\n')} onChange={(e:any)=>set('blocked_dates',e.target.value.split('\n').map((v:string)=>v.trim()))} rows={3}/>
   </>}
  </div></Section>
  <Section title="Apresentação da página"><div className="space-y-4"><FSelect label="Serviços relacionados" value={c.related_position} onChange={(e:any)=>set('related_position',e.target.value)} options={[{value:'after_coverage',label:'Após a seção Por que contratar?'},{value:'bottom',label:'No final da página'},{value:'hidden',label:'Não exibir'}]}/><p className="text-xs font-bold">Por que contratar?</p>{c.benefits.map((b:any,i:number)=><div key={i} className="space-y-3 rounded-lg border border-border p-4"><FInput label="Título" value={b.title} onChange={(e:any)=>set('benefits',c.benefits.map((v:any,j:number)=>i===j?{...v,title:e.target.value}:v))}/><RichTextEditor label="Descrição" value={b.content} onChange={(text)=>set('benefits',c.benefits.map((v:any,j:number)=>i===j?{...v,content:text}:v))} minHeight={90}/><FInput label="URL HTTPS da imagem (opcional, use imagens próprias ou autorizadas)" value={b.image_url||''} onChange={(e:any)=>set('benefits',c.benefits.map((v:any,j:number)=>i===j?{...v,image_url:e.target.value}:v))} placeholder="https://..."/><button type="button" className="text-xs font-bold text-red-600" onClick={()=>set('benefits',c.benefits.filter((_:any,j:number)=>j!==i))}>Remover benefício</button></div>)}<BtnSecondary onClick={()=>set('benefits',[...c.benefits,{title:'',content:''}])}><Plus size={15}/> Adicionar benefício</BtnSecondary></div></Section>
  <Section title="Depoimentos de clientes"><div className="space-y-4">
   <p className="text-xs leading-5 text-muted-foreground">Inclua somente avaliações reais que a Artvideo tenha autorização para divulgar. Elas aparecerão no carrossel da página deste serviço. Sem avaliações cadastradas, a seção não aparece.</p>
   {testimonials.map((review:any,i:number)=><div key={i} className="space-y-3 rounded-lg border border-border p-4">
    <FInput label="Nome do cliente" value={review.name||''} onChange={(e:any)=>set('testimonials',testimonials.map((v:any,j:number)=>i===j?{...v,name:e.target.value}:v))} placeholder="Nome autorizado para exibição"/>
    <FTextarea label="Depoimento" value={review.text||''} onChange={(e:any)=>set('testimonials',testimonials.map((v:any,j:number)=>i===j?{...v,text:e.target.value}:v))} rows={3}/>
    <button type="button" className="text-xs font-bold text-red-600" onClick={()=>set('testimonials',testimonials.filter((_:any,j:number)=>j!==i))}>Remover depoimento</button>
   </div>)}
   <BtnSecondary onClick={()=>set('testimonials',[...testimonials,{name:'',text:''}])}><Plus size={15}/> Adicionar depoimento</BtnSecondary>
  </div></Section>
  <Section title="Orientações para este serviço"><div className="space-y-4">
   <p className="text-xs text-muted-foreground">Cada orientação aparece como um card com o botão Saiba mais e abre seu próprio modal.</p>
   {c.orientations.map((o:any,i:number)=><div key={i} className="space-y-3 rounded-lg border border-border p-4">
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">Orientação {i+1}</span>
     <div className="flex items-center gap-1">
      <button type="button" disabled={i===0} onClick={()=>moveOrientation(i,-1)} aria-label="Mover orientação para cima" className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"><ArrowUp size={15}/></button>
      <button type="button" disabled={i===c.orientations.length-1} onClick={()=>moveOrientation(i,1)} aria-label="Mover orientação para baixo" className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"><ArrowDown size={15}/></button>
      <button type="button" onClick={()=>set('orientations',c.orientations.filter((_:any,j:number)=>j!==i))} aria-label="Remover orientação" className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={15}/></button>
     </div>
    </div>
    <FInput label="Título do card" value={o.title} onChange={(e:any)=>set('orientations',c.orientations.map((v:any,j:number)=>i===j?{...v,title:e.target.value}:v))}/>
    <RichTextEditor label="Conteúdo do modal Saiba mais" value={o.content} onChange={(text)=>set('orientations',c.orientations.map((v:any,j:number)=>i===j?{...v,content:text}:v))} minHeight={125}/>
    <FSelect label="Ícone do card" value={o.icon || ''} onChange={(e:any)=>set('orientations',c.orientations.map((v:any,j:number)=>i===j?{...v,icon:e.target.value}:v))} options={[{value:'',label:'Automático (conforme a ordem)'},{value:'wrench',label:'Ferramenta'},{value:'map-pin',label:'Localização'},{value:'info',label:'Informações'},{value:'file-text',label:'Documento'}]}/>
   </div>)}
   <BtnSecondary onClick={()=>set('orientations',[...c.orientations,{title:'',content:''}])}><Plus size={15}/> Adicionar orientação</BtnSecondary>
   <FInput label="Tempo estimado de execução" value={c.duration} onChange={(e:any)=>set('duration',e.target.value)} placeholder="Ex.: aproximadamente 2 horas"/>
   <RichTextEditor label="Condições do serviço" value={c.terms} onChange={(text)=>set('terms',text)} minHeight={160}/>
  </div></Section>
 </div>;
}
