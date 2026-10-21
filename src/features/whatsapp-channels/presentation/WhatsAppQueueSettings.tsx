import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  DEFAULT_WHATSAPP_QUEUE_SETTINGS, operateUnionWhatsAppInbox,
  type UnionWhatsAppQueueSettings,
} from "../infrastructure/union-whatsapp-inbox.repository";

const numeric=(value:number)=>Number.isFinite(value)?value:0;

export function WhatsAppQueueSettings() {
  const {activeOrganizationId}=useAuth();
  const [values,setValues]=useState<UnionWhatsAppQueueSettings>(DEFAULT_WHATSAPP_QUEUE_SETTINGS);
  const [saved,setSaved]=useState<UnionWhatsAppQueueSettings>(DEFAULT_WHATSAPP_QUEUE_SETTINGS);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const dirty=JSON.stringify(values)!==JSON.stringify(saved);
  const valid=Number.isInteger(values.warning_minutes) && values.warning_minutes>=1 &&
    values.warning_minutes<=720 && Number.isInteger(values.critical_minutes) &&
    values.critical_minutes>values.warning_minutes && values.critical_minutes<=1440;
  const load=useCallback(async()=>{
    if(!activeOrganizationId)return;
    setLoading(true);
    try{
      const response=await operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),"queue_settings_get");
      const result=response.queue_settings||DEFAULT_WHATSAPP_QUEUE_SETTINGS;
      setValues(result);setSaved(result);
    }catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível consultar as preferências da fila."),"error");}
    finally{setLoading(false);}
  },[activeOrganizationId]);
  useEffect(()=>{void load();},[load]);
  const save=async()=>{
    if(!activeOrganizationId||!dirty||!valid||saving)return;
    setSaving(true);
    try{
      const result=await operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),"queue_settings_save",values);
      const effective=result.queue_settings||values;
      setSaved(effective);setValues(effective);
      notifyAdmin("Configuração da fila salva com sucesso.","success");
    }catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível salvar a configuração."),"error");}
    finally{setSaving(false);}
  };
  return <section className="space-y-4 border-t border-border pt-4">
    <h3 className="text-sm font-bold text-foreground">Preferências da fila</h3>
    {loading ? <LoadingState text="Carregando preferências da fila..."/> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-foreground">
          Atenção após (minutos) <span className="text-red-600">*</span>
          <input type="number" min={1} max={720} step={1} value={values.warning_minutes}
            onChange={event=>setValues(current=>({...current,warning_minutes:numeric(Number(event.target.value))}))}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"/>
          <span className="mt-1 block font-normal text-muted-foreground">Muda a identificação de espera para laranja.</span>
        </label>
        <label className="block text-xs font-semibold text-foreground">
          Espera crítica após (minutos) <span className="text-red-600">*</span>
          <input type="number" min={2} max={1440} step={1} value={values.critical_minutes}
            onChange={event=>setValues(current=>({...current,critical_minutes:numeric(Number(event.target.value))}))}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"/>
          <span className="mt-1 block font-normal text-muted-foreground">Muda a identificação de espera para vermelho.</span>
        </label>
      </div>
      {!valid && <p role="alert" className="text-xs text-red-600">A espera crítica precisa ser maior que a de atenção, respeitando os limites indicados.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["show_wait_time","Exibir tempo de espera","Atualizado automaticamente enquanto o atendimento está na fila."],
          ["show_queue_position","Mostrar posição na fila","Exibe a colocação no atendimento, respeitando a ordem de chegada."],
          ["show_forward_badges","Exibir indicadores de encaminhamento","Identifica quem encaminhou e quem recebeu o atendimento."],
        ] as const).map(([key,label,description])=>
          <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
            <Checkbox checked={values[key]} onCheckedChange={checked=>setValues(current=>({...current,[key]:checked===true}))}/>
            <span className="min-w-0"><span className="block text-xs font-semibold">{label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
          </label>)}
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <AdminButton variant="secondary" disabled={!dirty||saving} onClick={()=>setValues({...saved})}>Descartar</AdminButton>
        <AdminButton disabled={!dirty||!valid||saving} loading={saving} onClick={()=>void save()}>Salvar configurações</AdminButton>
      </div>
    </>}
  </section>;
}
