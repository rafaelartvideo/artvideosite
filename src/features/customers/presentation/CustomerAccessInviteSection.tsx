import { useEffect, useState } from "react";
import { CheckCircle2, Copy, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Section, AdminButton } from "@/shared/ui/admin/AdminLayout";

type State={
  invitation?:{status:string;created_at:string;expires_at:string;activated_at:string|null}|null;
  account?:{active:boolean;whatsapp_verified_at:string|null;phone_mask:string}|null;
};
async function access(action:string,customerId:string,more:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("artvideo-customer-access",{
    body:{action,customer_id:customerId,...more},
  });
  if(error||!data?.success)throw new Error(data?.error||"Não foi possível concluir a solicitação.");
  return data;
}
export function CustomerAccessInviteSection({customerId,canManage,whatsapp}:{
  customerId:string;canManage:boolean;whatsapp?:string|null;
}){
  const [state,setState]=useState<State|null>(null);
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [link,setLink]=useState("");
  useEffect(()=>{
    let active=true;
    access("staff_status",customerId).then(data=>{if(active)setState(data);})
      .catch(()=>{if(active)setMessage("Não foi possível consultar o acesso do cliente.");});
    return ()=>{active=false;};
  },[customerId]);
  async function run(action:"staff_invite"|"staff_revoke"){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const result=await access(action,customerId,{identity_confirmed:confirmed});
      if(action==="staff_invite"){
        setLink(result.link);
        setMessage("Convite enviado pelo WhatsApp. Válido por 24 horas.");
        setConfirmed(false);
      }else{
        setLink("");setMessage("Acesso ao histórico do CRM revogado.");
      }
      setState(await access("staff_status",customerId));
    }catch(e){setMessage(e instanceof Error?e.message:"Operação não concluída.");}
    finally{setBusy(false);}
  }
  return <Section title="Acesso ao site">
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={"rounded-lg px-2.5 py-1 text-xs font-semibold "+(state?.account?.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600")}>
          {state?.account?.active?"Conta ativada":"Acesso ao CRM não ativado"}
        </span>
        {state?.account?.whatsapp_verified_at&&<span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={14}/> WhatsApp verificado</span>}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        O acesso às OS e aos documentos só será liberado após convite autorizado e confirmação do WhatsApp.
      </p>
      {state?.account?.phone_mask&&<p className="text-xs">Número confirmado: <strong>{state.account.phone_mask}</strong></p>}
      {state?.invitation?.status==="pending"&&<p className="text-xs text-muted-foreground">
        Convite pendente até {new Date(state.invitation.expires_at).toLocaleString("pt-BR")}.
      </p>}
      {!state&&<div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="animate-spin" size={15}/> Consultando acesso...</div>}
      {canManage&&<>
        {!state?.account?.active&&<label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs leading-5">
          <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>
          <span>Confirmei a identidade do cliente e o número WhatsApp informado no cadastro.</span>
        </label>}
        <div className="flex flex-wrap gap-2">
          {!state?.account?.active&&<AdminButton size="sm" disabled={busy||!confirmed||!whatsapp} onClick={()=>void run("staff_invite")}>
            {busy?<RefreshCw size={15} className="animate-spin"/>:<MessageCircle size={15}/>} {state?.invitation?.status==="pending"?"Reenviar convite":"Convidar para Minha Conta"}
          </AdminButton>}
          {state?.account?.active&&<AdminButton variant="secondary" size="sm" disabled={busy} onClick={()=>void run("staff_revoke")}>
            <ShieldCheck size={15}/> Revogar acesso
          </AdminButton>}
        </div>
      </>}
      {message&&<p role="status" className="rounded-lg bg-muted/50 p-2.5 text-xs">{message}</p>}
      {link&&<div className="flex items-center gap-2">
        <input className="min-w-0 flex-1 rounded-lg border border-border p-2 text-xs" value={link} readOnly aria-label="Link de ativação"/>
        <AdminButton variant="secondary" size="sm" onClick={()=>void navigator.clipboard.writeText(link)}><Copy size={15}/> Copiar</AdminButton>
      </div>}
      {!whatsapp&&<p className="text-xs text-amber-700">Cadastre o WhatsApp do cliente antes de enviar o convite.</p>}
    </div>
  </Section>;
}
