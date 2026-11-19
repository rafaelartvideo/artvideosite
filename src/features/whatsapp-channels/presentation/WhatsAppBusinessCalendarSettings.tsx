import {useCallback,useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {useQueryClient} from "@tanstack/react-query";
import {CalendarClock,Plus,Trash2} from "lucide-react";
import {useAuth} from "@/lib/auth";
import {supabase} from "@/lib/supabase";
import {AdminButton} from "@/shared/ui/admin/AdminLayout";
import {LoadingState,notifyAdmin} from "@/shared/ui/admin/AdminFeedback";
import {systemErrorMessage} from "@/shared/domain/error-message";

type Slot={start:string;end:string};
type Weekly=Record<string,Slot[]>;
type Exception={date:string;closed:boolean;reason:string;intervals:Slot[]};
type CalendarValue={
  id:string;timezone:string;weekly:Weekly;exceptions:Exception[];
  effective_at:string;retrospective_effective_date?:string|null;
};
type ScopeType="company"|"department"|"operator";
type Option={id:string;name:string};
type Result={calendar:CalendarValue|null;departments:Option[];operators:Option[]};
const DAYS=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const TIMEZONES=[
  ["America/Maceio","Aracaju / Maceió (UTC−3)"],
  ["America/Sao_Paulo","Brasília / São Paulo"],
  ["America/Fortaleza","Fortaleza / Nordeste"],
  ["America/Recife","Recife"],
  ["America/Belem","Belém"],
  ["America/Campo_Grande","Campo Grande"],
  ["America/Cuiaba","Cuiabá"],
  ["America/Manaus","Manaus"],
  ["America/Rio_Branco","Rio Branco"],
  ["America/Noronha","Fernando de Noronha"],
] as const;
const empty=():Weekly=>Object.fromEntries(DAYS.map((_,index)=>[String(index),[]])) as Weekly;
const inputStyle="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const example=():Weekly=>Object.fromEntries(DAYS.map((_,index)=>[String(index),
  index===0||index===6?[]:[{start:"08:00",end:"12:00"},{start:"13:00",end:"18:00"}]])) as Weekly;
const verifySlots=(slots:Slot[])=>{
  const sorted=[...slots].sort((a,b)=>a.start.localeCompare(b.start));
  return slots.length<=8&&sorted.every((slot,index)=>
    /^\d{2}:\d{2}$/.test(slot.start)&&/^\d{2}:\d{2}$/.test(slot.end)
    &&slot.start<slot.end&&(!index||sorted[index-1].end<=slot.start))
    &&slots.every((slot,index)=>slot.start===sorted[index]?.start&&slot.end===sorted[index]?.end);
};
export function WhatsAppBusinessCalendarSettings({footerTarget,footerInParent=false}:{
  footerTarget?:HTMLElement|null;footerInParent?:boolean;
}={}){
  const {activeOrganizationId,hasPermission}=useAuth();
  const queryClient=useQueryClient();
  const canManage=hasPermission("settings.channels.manage");
  const [scope,setScope]=useState<ScopeType>("company");
  const [scopeId,setScopeId]=useState("");
  const [timezone,setTimezone]=useState("America/Maceio");
  const [weekly,setWeekly]=useState<Weekly>(empty);
  const [exceptions,setExceptions]=useState<Exception[]>([]);
  const [departments,setDepartments]=useState<Option[]>([]);
  const [operators,setOperators]=useState<Option[]>([]);
  const [effectiveAt,setEffectiveAt]=useState<string|null>(null);
  const [retrospectiveSet,setRetrospectiveSet]=useState(false);
  const [retroDate,setRetroDate]=useState("");
  const [retroNote,setRetroNote]=useState("");
  const [retroConfirmed,setRetroConfirmed]=useState(false);
  const [retroSaving,setRetroSaving]=useState(false);
  const [savedSignature,setSavedSignature]=useState("");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const serial=JSON.stringify({timezone,weekly,exceptions});
  const dirty=serial!==savedSignature;
  const valid=Object.values(weekly).every(verifySlots) &&
    exceptions.length<=200&&exceptions.every((x,i)=>
      /^\d{4}-\d{2}-\d{2}$/.test(x.date)
      &&!exceptions.slice(0,i).some(previous=>previous.date===x.date)
      &&(x.closed?x.intervals.length===0:verifySlots(x.intervals)));

  const read=useCallback(async()=>{
    if(!activeOrganizationId)return;
    setLoading(true);
    try{
      const {data,error}=await supabase.rpc("union_whatsapp_business_calendar",{
        p_org:activeOrganizationId,p_action:"get",p_scope:(scope!=="company"&&!scopeId)?"company":scope,p_scope_id:scopeId||null,
      });
      if(error)throw error;
      const response=data as Result;
      const cal=response?.calendar;
      const tz=cal?.timezone||"America/Maceio";
      const days=cal?.weekly?{...empty(),...cal.weekly}:empty();
      const special=Array.isArray(cal?.exceptions)?cal.exceptions:[];
      setTimezone(tz);setWeekly(days);setExceptions(special);
      setSavedSignature(JSON.stringify({timezone:tz,weekly:days,exceptions:special}));
      setEffectiveAt(cal?.effective_at||null);
      setRetrospectiveSet(Boolean(cal?.retrospective_effective_date));
      setRetroDate("");setRetroNote("");setRetroConfirmed(false);
      setDepartments(response?.departments||[]);setOperators(response?.operators||[]);
    }catch(error){
      notifyAdmin(systemErrorMessage(error,"Não foi possível consultar os horários de atendimento."),"error");
    }finally{setLoading(false);}
  },[activeOrganizationId,scope,scopeId]);
  useEffect(()=>{void read();},[read]);
  const save=async()=>{
    if(!canManage||!activeOrganizationId||saving||!valid||!dirty)return;
    setSaving(true);
    try{
      const {data,error}=await supabase.rpc("union_whatsapp_business_calendar",{
        p_org:activeOrganizationId,p_action:"save",p_scope:scope,p_scope_id:scopeId||null,
        p_timezone:timezone,p_weekly:weekly,p_exceptions:exceptions,
      });
      if(error)throw error;
      const result=data as Result;
      setSavedSignature(serial);
      setEffectiveAt(result?.calendar?.effective_at||null);
      await queryClient.invalidateQueries({queryKey:["dashboard","attendances",activeOrganizationId]});
      notifyAdmin("Expediente salvo. A nova versão vale a partir de agora.","success");
    }catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível salvar o expediente."),"error");}
    finally{setSaving(false);}
  };
  const confirmHistory=async()=>{
    if(!canManage||!activeOrganizationId||!effectiveAt||!retroDate||
      retroNote.trim().length<8||!retroConfirmed||retroSaving||dirty)return;
    if(!window.confirm("Confirma que este horário era válido desde a data informada? Isso recalculará indicadores históricos quando existirem mensagens suficientes."))return;
    setRetroSaving(true);
    try{
      const {error}=await supabase.rpc("union_whatsapp_business_calendar_backdate",{
        p_org:activeOrganizationId,p_scope:scope,p_scope_id:scopeId||null,
        p_date:retroDate,p_note:retroNote.trim(),p_confirmed:true,
      });
      if(error)throw error;
      await queryClient.invalidateQueries({queryKey:["dashboard","attendances",activeOrganizationId]});
      notifyAdmin("Vigência histórica confirmada. Indicadores serão calculados com os eventos existentes.","success");
      await read();
    }catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível confirmar o calendário anterior."),"error");}
    finally{setRetroSaving(false);}
  };
  const switchScope=(next:ScopeType)=>{
    if(dirty&&!window.confirm("Descartar alterações não salvas e trocar o calendário?"))return;
    setScope(next);setScopeId("");
  };
  const updateSlot=(day:string,index:number,key:keyof Slot,value:string)=>{
    setWeekly(old=>({...old,[day]:(old[day]||[]).map((slot,i)=>i===index?{...slot,[key]:value}:slot)}));
  };
  const intervalEditor=(slots:Slot[],update:(next:Slot[])=>void)=><div className="space-y-2">
    {slots.map((slot,index)=><div key={index} className="flex items-center gap-2">
      <input aria-label="Início" type="time" value={slot.start}
        onChange={event=>update(slots.map((s,i)=>i===index?{...s,start:event.target.value}:s))}
        className={inputStyle}/>
      <span className="text-xs text-muted-foreground">até</span>
      <input aria-label="Fim" type="time" value={slot.end}
        onChange={event=>update(slots.map((s,i)=>i===index?{...s,end:event.target.value}:s))}
        className={inputStyle}/>
      <button type="button" aria-label="Remover intervalo" title="Remover intervalo"
        onClick={()=>update(slots.filter((_,i)=>i!==index))}
        className="rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive"><Trash2 size={15}/></button>
    </div>)}
    {slots.length<8&&<button type="button" onClick={()=>{
      const previous=slots[slots.length-1];
      update([...slots,{start:previous?.end||"08:00",end:"18:00"}]);
    }} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
      <Plus size={14}/> Adicionar intervalo
    </button>}
    {!slots.length&&<p className="text-xs text-muted-foreground">Fechado neste dia.</p>}
  </div>;
  const footer=<div className="flex flex-wrap justify-end gap-2">
    <AdminButton variant="secondary" disabled={!dirty||saving} onClick={()=>void read()}>Descartar</AdminButton>
    <AdminButton disabled={!canManage||!dirty||!valid||loading||saving||(scope!=="company"&&!scopeId)}
      loading={saving} onClick={()=>void save()}>Salvar expediente</AdminButton>
  </div>;
  return <section className="space-y-5">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><CalendarClock size={17}/> Horário de atendimento e SLA</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Os prazos comerciais contam somente os intervalos configurados, respeitando feriados, exceções
        e fuso. O tempo corrido permanece disponível. Nenhum horário é presumido antes de salvar.
        Mudanças criam uma versão válida a partir do momento do salvamento, sem falsificar métricas antigas.
      </p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-xs font-semibold">Calendário
        <select value={scope} onChange={event=>switchScope(event.target.value as ScopeType)} className={inputStyle}>
          <option value="company">Empresa inteira</option><option value="department">Departamento</option>
          <option value="operator">Escala de operador</option>
        </select>
      </label>
      {scope!=="company"&&<label className="space-y-1 text-xs font-semibold">
        {scope==="department"?"Departamento":"Operador"}
        <select value={scopeId} onChange={event=>{if(dirty&&!window.confirm("Descartar alterações?"))return;setScopeId(event.target.value);}}
          className={inputStyle}>
          <option value="">Selecione</option>
          {(scope==="department"?departments:operators).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      <label className="space-y-1 text-xs font-semibold">Fuso horário
        <select value={timezone} onChange={event=>setTimezone(event.target.value)} className={inputStyle}>
          {TIMEZONES.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    {loading?<LoadingState text="Preparando calendário..."/>:
      (scope!=="company"&&!scopeId)?<p className="p-6 text-center text-xs text-muted-foreground">Selecione um departamento ou operador para editar sua escala.</p>
      :<>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{effectiveAt?
            "Horário configurado · nova edição cria versão futura":"Ainda não configurado · SLAs úteis permanecerão indisponíveis"}</p>
          <AdminButton variant="secondary" size="sm" onClick={()=>setWeekly(example())}>
            Preencher exemplo semanal
          </AdminButton>
        </div>
        <h3 className="text-sm font-bold text-foreground">Expediente semanal</h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {DAYS.map((label,index)=>{
            const key=String(index);
            return <div key={key} className="rounded-xl border border-border p-3">
              <p className="mb-2 text-xs font-bold text-foreground">{label}</p>
              {intervalEditor(weekly[key]||[],next=>setWeekly(old=>({...old,[key]:next})))}
            </div>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-sm font-bold text-foreground">Feriados e exceções</h3>
            <p className="text-xs text-muted-foreground">Cadastre feriados nacionais, estaduais, municipais, recessos ou horário especial.</p></div>
          <AdminButton variant="secondary" size="sm" onClick={()=>setExceptions(old=>[
            ...old,{date:"",reason:"",closed:true,intervals:[]}])}><Plus size={15}/> Nova exceção</AdminButton>
        </div>
        <div className="space-y-3">
          {exceptions.map((row,index)=><div key={index} className="rounded-xl border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-[165px_minmax(0,1fr)_auto_auto]">
              <input type="date" aria-label="Data da exceção" value={row.date}
                onChange={event=>setExceptions(old=>old.map((x,i)=>i===index?{...x,date:event.target.value}:x))}
                className={inputStyle}/>
              <input type="text" aria-label="Motivo" placeholder="Ex.: feriado municipal" maxLength={120}
                value={row.reason} onChange={event=>setExceptions(old=>old.map((x,i)=>i===index?{...x,reason:event.target.value}:x))}
                className={inputStyle}/>
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" checked={row.closed}
                  onChange={event=>setExceptions(old=>old.map((x,i)=>i===index?
                    {...x,closed:event.target.checked,intervals:event.target.checked?[]:x.intervals}:x))}/>
                Fechado
              </label>
              <button type="button" aria-label="Excluir exceção" onClick={()=>setExceptions(old=>old.filter((_,i)=>i!==index))}
                className="rounded-lg border border-border p-2 text-destructive"><Trash2 size={16}/></button>
            </div>
            {!row.closed&&<div className="mt-3">{intervalEditor(row.intervals,next=>setExceptions(old=>
              old.map((x,i)=>i===index?{...x,intervals:next}:x)))}</div>}
          </div>)}
          {!exceptions.length&&<p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">Nenhuma exceção cadastrada.</p>}
        </div>
        {effectiveAt&&canManage&&<details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">
            Confirmar expediente anterior para recalcular o histórico
          </summary>
          {retrospectiveSet?<p className="mt-3 text-xs text-muted-foreground">
            A data histórica deste calendário já foi confirmada e registrada em auditoria.
          </p>:<div className="mt-3 space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">
              Opcional e somente na primeira versão: use se puder confirmar que estes mesmos horários
              já valiam anteriormente. Nenhuma informação é inventada nem mensagens são alteradas.
              Uma data histórica incorreta distorcerá SLAs antigos.
            </p>
            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              <label className="space-y-1 text-xs font-semibold">Válido desde
                <input type="date" value={retroDate}
                  min={new Date(Date.now()-365*86400000).toISOString().slice(0,10)}
                  max={new Date().toISOString().slice(0,10)}
                  onChange={event=>setRetroDate(event.target.value)} className={inputStyle}/>
              </label>
              <label className="space-y-1 text-xs font-semibold">Justificativa
                <input type="text" value={retroNote} maxLength={500}
                  onChange={event=>setRetroNote(event.target.value)}
                  placeholder="Ex.: horário confirmado no registro interno da empresa"
                  className={inputStyle}/>
              </label>
            </div>
            <label className="flex items-start gap-2 text-xs text-foreground">
              <input type="checkbox" checked={retroConfirmed}
                onChange={event=>setRetroConfirmed(event.target.checked)}/>
              Confirmo que o expediente era este durante o período informado.
            </label>
            <AdminButton size="sm" variant="secondary" loading={retroSaving}
              disabled={dirty||!retroDate||retroNote.trim().length<8||!retroConfirmed||retroSaving}
              onClick={()=>void confirmHistory()}>Confirmar vigência anterior</AdminButton>
          </div>}
        </details>}
        {!valid&&<p role="alert" className="text-xs text-destructive">Revise as datas e intervalos. Não pode haver sobreposição ou duplicação.</p>}
      </>}
    {footerTarget?createPortal(footer,footerTarget):!footerInParent&&<div className="border-t border-border pt-3">{footer}</div>}
  </section>;
}