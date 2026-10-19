import { Plus, Trash2 } from 'lucide-react';
import { Section, BtnSecondary } from '@/shared/ui/admin/AdminLayout';
import { FInput, FIntegerInput, FSelect, FTextarea, FToggle } from '@/shared/ui/admin/AdminFormControls';
import { bookingConfig } from '@/features/public-services/domain/service-booking.mjs';
import { formatZipCode } from '@/lib/address';

export function ServiceBookingSettings({ value, onChange }: {value:any;onChange:(value:any)=>void}) {
 const c=bookingConfig(value);
 const set=(key:string,v:any)=>onChange({...c,[key]:v});
 return <div className="space-y-5">
  <Section title="Cobertura do atendimento"><div className="space-y-4">
   <FSelect label="Consulta de CEP" value={c.coverage_mode} onChange={(e:any)=>set('coverage_mode',e.target.value)} options={[{value:'consult',label:'A equipe confirma a cobertura'},{value:'ranges',label:'Atender somente nas faixas de CEP configuradas'}]}/>
   {c.coverage_mode==='ranges' && <>{c.cep_ranges.map((r:any,i:number)=><div key={i} className="flex items-end gap-3"><FInput label="CEP inicial" value={r.start} onChange={(e:any)=>set('cep_ranges',c.cep_ranges.map((v:any,j:number)=>i===j?{...v,start:formatZipCode(e.target.value)}:v))}/><FInput label="CEP final" value={r.end} onChange={(e:any)=>set('cep_ranges',c.cep_ranges.map((v:any,j:number)=>i===j?{...v,end:formatZipCode(e.target.value)}:v))}/><button type="button" aria-label="Remover faixa de CEP" className="p-3 text-red-600" onClick={()=>set('cep_ranges',c.cep_ranges.filter((_:any,j:number)=>i!==j))}><Trash2 size={16}/></button></div>)}<BtnSecondary onClick={()=>set('cep_ranges',[...c.cep_ranges,{start:'',end:''}])}><Plus size={15}/> Adicionar faixa</BtnSecondary></>}
  </div></Section>
  <Section title="Dias e horários"><div className="space-y-4">
   <FToggle label="Permitir escolher uma preferência de agendamento" description="A data será confirmada pela Artvideo após a análise do orçamento." checked={c.schedule_enabled} onChange={(v:boolean)=>set('schedule_enabled',v)}/>
   {c.schedule_enabled && <>
    <div><p className="mb-2 text-xs font-bold">Dias de atendimento</p><div className="flex flex-wrap gap-2">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((d,i)=><button key={d} type="button" aria-pressed={c.weekdays.includes(i)} onClick={()=>set('weekdays',c.weekdays.includes(i)?c.weekdays.filter((v:number)=>v!==i):[...c.weekdays,i].sort())} className={`rounded-lg border px-4 py-2 text-sm ${c.weekdays.includes(i)?'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950':'border-border'}`}>{d}</button>)}</div></div>
    {c.slots.map((s:any,i:number)=><div key={i} className="flex items-end gap-3"><FInput label="Início" type="time" value={s.start} onChange={(e:any)=>set('slots',c.slots.map((v:any,j:number)=>i===j?{...v,start:e.target.value}:v))}/><FInput label="Fim" type="time" value={s.end} onChange={(e:any)=>set('slots',c.slots.map((v:any,j:number)=>i===j?{...v,end:e.target.value}:v))}/><button type="button" aria-label="Remover horário" className="p-3 text-red-600" onClick={()=>set('slots',c.slots.filter((_:any,j:number)=>j!==i))}><Trash2 size={16}/></button></div>)}
    <BtnSecondary onClick={()=>set('slots',[...c.slots,{start:'08:00',end:'10:00'}])}><Plus size={15}/> Adicionar intervalo</BtnSecondary>
    <div className="grid gap-4 sm:grid-cols-2"><FIntegerInput label="Antecedência mínima (dias)" value={String(c.lead_days)} onChange={(e:any)=>set('lead_days',Number(e.target.value))}/><FIntegerInput label="Exibir próximos dias (até 90)" value={String(c.horizon_days)} onChange={(e:any)=>set('horizon_days',Number(e.target.value))}/></div>
    <FTextarea label="Datas bloqueadas (uma por linha, AAAA-MM-DD)" value={c.blocked_dates.join('\n')} onChange={(e:any)=>set('blocked_dates',e.target.value.split('\n').map((v:string)=>v.trim()))} rows={3}/>
   </>}
  </div></Section>
  <Section title="Apresentação da página"><div className="space-y-4"><FSelect label="Serviços relacionados" value={c.related_position} onChange={(e:any)=>set('related_position',e.target.value)} options={[{value:'after_coverage',label:'Após a consulta de CEP'},{value:'bottom',label:'No final da página'},{value:'hidden',label:'Não exibir'}]}/><p className="text-xs font-bold">Por que contratar?</p>{c.benefits.map((b:any,i:number)=><div key={i} className="space-y-3 rounded-lg border border-border p-4"><FInput label="Título" value={b.title} onChange={(e:any)=>set('benefits',c.benefits.map((v:any,j:number)=>i===j?{...v,title:e.target.value}:v))}/><FTextarea label="Descrição" value={b.content} onChange={(e:any)=>set('benefits',c.benefits.map((v:any,j:number)=>i===j?{...v,content:e.target.value}:v))} rows={2}/><button type="button" className="text-xs font-bold text-red-600" onClick={()=>set('benefits',c.benefits.filter((_:any,j:number)=>j!==i))}>Remover benefício</button></div>)}<BtnSecondary onClick={()=>set('benefits',[...c.benefits,{title:'',content:''}])}><Plus size={15}/> Adicionar benefício</BtnSecondary></div></Section>
  <Section title="Orientações para este serviço"><div className="space-y-4">
   <p className="text-xs text-muted-foreground">Cada orientação aparece como um card com o botão Saiba mais e abre seu próprio modal.</p>
   {c.orientations.map((o:any,i:number)=><div key={i} className="space-y-3 rounded-lg border border-border p-4"><FInput label="Título do card" value={o.title} onChange={(e:any)=>set('orientations',c.orientations.map((v:any,j:number)=>i===j?{...v,title:e.target.value}:v))}/><FTextarea label="Conteúdo do modal" value={o.content} onChange={(e:any)=>set('orientations',c.orientations.map((v:any,j:number)=>i===j?{...v,content:e.target.value}:v))} rows={4}/><button type="button" className="text-xs font-bold text-red-600" onClick={()=>set('orientations',c.orientations.filter((_:any,j:number)=>j!==i))}>Remover orientação</button></div>)}
   <BtnSecondary onClick={()=>set('orientations',[...c.orientations,{title:'',content:''}])}><Plus size={15}/> Adicionar orientação</BtnSecondary>
   <FInput label="Tempo estimado de execução" value={c.duration} onChange={(e:any)=>set('duration',e.target.value)} placeholder="Ex.: aproximadamente 2 horas"/>
   <FTextarea label="Condições do serviço" value={c.terms} onChange={(e:any)=>set('terms',e.target.value)} rows={6}/>
  </div></Section>
 </div>;
}
