import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { FCurrencyInput, FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  listFinanceWarrantyPartners,
  prepareFinanceWarrantyReceivable,
  type FinanceWarrantyPartner,
} from "../infrastructure/finance-warranty-receivables.repository";

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

// Etapa inicial da própria ação Dar baixa. A OS não solicita dados de cobrança.
export function FinanceWarrantyReceivableSetup({
  organizationId, entryId, onClose, onPrepared,
}:{
  organizationId:string;
  entryId:string;
  onClose:()=>void;
  onPrepared:()=>Promise<void>;
}){
  const [partners,setPartners]=useState<FinanceWarrantyPartner[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState("");
  const [partnerId,setPartnerId]=useState("");
  const [amount,setAmount]=useState("");
  const [dueDate,setDueDate]=useState(todayDate);
  const [notes,setNotes]=useState("");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setLoadError("");
    void listFinanceWarrantyPartners(organizationId)
      .then(items=>{if(!cancelled)setPartners(items);})
      .catch(reason=>{if(!cancelled)setLoadError(systemErrorMessage(reason,"Não foi possível consultar os parceiros."));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,retry]);

  const save=async()=>{
    if(saving)return;
    const value=Number(amount);
    if(!partnerId){setError("Selecione o fabricante ou parceiro responsável pelo pagamento.");return;}
    if(!Number.isFinite(value)||value<=0){setError("Informe o valor a receber, maior que zero.");return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)){setError("Informe uma data de vencimento válida.");return;}
    setSaving(true);setError("");
    try{
      await prepareFinanceWarrantyReceivable({
        organizationId,entryId,partnerId,amount:Math.round(value*100)/100,
        dueDate,notes,
      });
      await onPrepared();
    }catch(reason){
      setError(systemErrorMessage(reason,"Não foi possível preparar a conta a receber."));
    }finally{
      setSaving(false);
    }
  };

  return <section aria-label="Preencher conta de garantia para dar baixa" className="space-y-4">
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
      Esta OS já foi concluída sem cobrança ao cliente. Preencha os dados do fabricante para
      definir o título em Contas a Receber. Na próxima etapa, confirme o pagamento para efetuar a baixa.
    </div>
    {loading?<p role="status" className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
      <LoaderCircle size={16} className="animate-spin"/> Consultando parceiros...
    </p>:<div className="space-y-4">
      <FSelect label="Fabricante / parceiro responsável" required value={partnerId}
        disabled={saving||Boolean(loadError)}
        onChange={(event:any)=>{setPartnerId(event.target.value);setError("");}}
        options={[{value:"",label:"Selecionar parceiro..."},
          ...partners.map(item=>({value:item.id,label:item.name}))]}/>
      {!partners.length&&!loadError&&<p className="text-xs text-muted-foreground">
        Nenhum parceiro cadastrado. Cadastre o fabricante em Cadastros → Parceiros para continuar.
      </p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FCurrencyInput label="Valor a receber" required value={amount} disabled={saving}
          onChange={(event:any)=>{setAmount(event.target.value);setError("");}}/>
        <FInput label="Vencimento" type="date" required value={dueDate} disabled={saving}
          onChange={(event:any)=>{setDueDate(event.target.value);setError("");}}/>
      </div>
      <div className="space-y-1">
        <label htmlFor="finance-warranty-receivable-notes" className="block text-xs font-semibold text-foreground">
          Observações
        </label>
        <textarea id="finance-warranty-receivable-notes"
          className="w-full min-h-[76px] resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          rows={3} maxLength={500} disabled={saving}
          placeholder="Autorização, referência do fabricante, informações do repasse..."
          value={notes} onChange={event=>setNotes(event.target.value)}/>
      </div>
    </div>}
    {loadError&&<p role="alert" className="text-xs text-destructive">{loadError}{" "}
      <button type="button" className="font-bold underline" onClick={()=>setRetry(value=>value+1)}>
        Tentar novamente
      </button>
    </p>}
    {error&&<p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
    <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
      <AdminButton variant="secondary" disabled={saving} onClick={onClose}><ArrowLeft size={15}/> Voltar</AdminButton>
      <AdminButton disabled={loading||Boolean(loadError)||saving||partners.length===0}
        loading={saving} onClick={()=>void save()}>
        Continuar para baixa <ArrowRight size={16}/>
      </AdminButton>
    </div>
  </section>;
}
