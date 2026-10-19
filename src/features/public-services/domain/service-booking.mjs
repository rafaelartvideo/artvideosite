export const EMPTY_BOOKING_CONFIG = { coverage_mode:'consult', cep_ranges:[], schedule_enabled:false, weekdays:[], slots:[], lead_days:1, horizon_days:30, blocked_dates:[], related_position:'after_coverage', testimonials:[], benefits:[
 {title:'Atendimento próximo',content:'Converse diretamente com a equipe da Artvideo sobre o que você precisa.'},
 {title:'Orçamento antes da execução',content:'Conheça os valores e os detalhes do serviço antes de aprovar.'},
 {title:'Atendimento combinado',content:'A equipe confirma o local, o dia e as condições para realizar o serviço.'}
 ], orientations:[
 {title:'Sobre o equipamento',content:'Informe o modelo e as características do equipamento ao solicitar o orçamento. A equipe avaliará as condições e os materiais necessários antes de confirmar o serviço.'},
 {title:'Local de atendimento',content:'Informe o endereço completo. Mantenha o acesso ao equipamento livre e, em condomínios, confira as regras de entrada e os horários permitidos para o atendimento.'},
 {title:'Responsável no local',content:'Combine com a Artvideo quem acompanhará o atendimento e poderá esclarecer as informações sobre o equipamento e aprovar o orçamento.'},
 {title:'Orçamento e confirmação',content:'A solicitação pelo site não gera cobrança antecipada. A Artvideo entrará em contato para informar os valores, conferir os detalhes e confirmar a disponibilidade de atendimento.'}
 ], terms:'O envio da solicitação não confirma o agendamento nem gera pagamento antecipado. A Artvideo avaliará as informações, entrará em contato e apresentará o orçamento. Materiais, condições de execução, prazos e valores serão confirmados pela equipe antes da sua aprovação.', duration:'' };
const digits = value => String(value ?? '').replace(/\D/g,'');
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '');
const dayNames = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

// Per-day hours take precedence. Existing records with only `slots` retain
// their original hours until a manager configures their weekly schedule.
export function scheduleSlotsForDay(value, weekday) {
 const c=bookingConfig(value);
 const perDay=c.weekly_slots;
 if(perDay && typeof perDay==='object' && !Array.isArray(perDay))
  return Array.isArray(perDay[String(weekday)]) ? perDay[String(weekday)] : [];
 return Array.isArray(c.slots) ? c.slots : [];
}
export function effectiveWeeklySlots(value) {
 return Object.fromEntries(Array.from({length:7}, (_,day)=>[
  String(day), scheduleSlotsForDay(value,day).map(slot=>({start:slot.start,end:slot.end}))
 ]));
}
function normalizedIntervals(value) {
 return value.filter(s=>s && validTime(s.start) && validTime(s.end) && s.end>s.start)
  .sort((a,b)=>a.start.localeCompare(b.start));
}
export function bookingConfig(value) { return { ...EMPTY_BOOKING_CONFIG, ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}) }; }
export function coverageForCep(value, cep) {
 const c=bookingConfig(value), code=digits(cep);
 if(code.length!==8 || /^0+$/.test(code)) return 'invalid';
 if(c.coverage_mode!=='ranges' || !Array.isArray(c.cep_ranges) || !c.cep_ranges.length) return 'consult';
 return c.cep_ranges.some(r=>code>=digits(r.start) && code<=digits(r.end)) ? 'available':'unavailable';
}
export function brazilNow(now=new Date()) {
 const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
export function bookingDates(value, now=new Date()) {
 const c=bookingConfig(value); if(!c.schedule_enabled) return [];
 const today=brazilNow(now).date, dates=[];
 const horizon=Math.max(1,Math.min(90,Number(c.horizon_days)||30));
 const lead=Math.max(0,Number(c.lead_days)||0);
 for(let i=lead;i<horizon;i++) {
  const d=new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+i);
  const iso=d.toISOString().slice(0,10), weekday=d.getUTCDay();
  if(c.weekdays?.includes(weekday) && !c.blocked_dates?.includes(iso)
   && normalizedIntervals(scheduleSlotsForDay(c,weekday)).length>0) dates.push(iso);
 }
 return dates;
}
export function slotsForDate(value, date, now=new Date()) {
 const c=bookingConfig(value); if(!bookingDates(c,now).includes(date)) return [];
 const today=brazilNow(now);
 const day=new Date(`${date}T12:00:00Z`).getUTCDay();
 return normalizedIntervals(scheduleSlotsForDay(c,day))
  .filter(s=>date>today.date || s.start>today.time);
}
export function validateBookingConfig(value) {
 const c=bookingConfig(value);
 if(c.coverage_mode==='ranges' && (!c.cep_ranges?.length || c.cep_ranges.some(r=>digits(r.start).length!==8 || digits(r.end).length!==8 || digits(r.start)>digits(r.end)))) return 'Informe faixas de CEP válidas, com o CEP final maior ou igual ao inicial.';
 if(c.blocked_dates?.some(d=>d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d+'T12:00:00Z')) || new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d))) return 'Informe datas bloqueadas válidas no formato AAAA-MM-DD.';
 if(c.schedule_enabled) {
  if(!Array.isArray(c.weekdays) || !c.weekdays.length || c.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)) return 'Selecione ao menos um dia de atendimento.';
  for(const day of c.weekdays) {
   const slots=scheduleSlotsForDay(c,day);
   if(!slots.length) return `Adicione um intervalo de horário para ${dayNames[day]}.`;
   if(slots.some(s=>!s || !validTime(s.start)||!validTime(s.end)||s.end<=s.start))
    return `Informe um horário válido para ${dayNames[day]}, com o fim após o início.`;
   const sorted=[...slots].sort((a,b)=>a.start.localeCompare(b.start));
   if(sorted.some((slot,index)=>index>0 && slot.start<sorted[index-1].end))
    return `Existem horários sobrepostos em ${dayNames[day]}. Ajuste os intervalos.`;
  }
  if(!Number.isInteger(Number(c.lead_days)) || c.lead_days<0 || c.lead_days>89 || !Number.isInteger(Number(c.horizon_days)) || c.horizon_days<1 || c.horizon_days>90 || c.lead_days>=c.horizon_days) return 'A antecedência deve ser menor que o horizonte de 1 a 90 dias.';
 }
 return null;
}
export function mergeResolvedAddress(current, resolved) {
 return {...current, ...Object.fromEntries(['street','neighborhood','city','state'].map(k=>[k,current[k]||resolved[k]||'']))};
}
export function displayBookingDate(value) { return value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',timeZone:'America/Sao_Paulo'}) : ''; }
