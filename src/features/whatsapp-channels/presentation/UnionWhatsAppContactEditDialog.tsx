import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { RequiredFieldLabel } from "@/shared/ui/admin/AdminFormControls";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { WhatsAppContactAvatar, formatWhatsAppPhone } from "./WhatsAppInboxVisuals";
import { operateUnionWhatsAppInbox, type UnionWhatsAppContact } from "../infrastructure/union-whatsapp-inbox.repository";

const normalizePhone=(value:string)=>{
  const digits=value.replace(/\D/g,"");
  return digits.startsWith("55")&&digits.length>11 ? digits.slice(2,13) : digits.slice(0,11);
};
const maskPhone=(raw:string)=>{
  const digits=normalizePhone(raw);
  if(digits.length<3)return digits?"("+digits:"";
  const local=digits.slice(2),split=local.startsWith("9")?5:4;
  return "("+digits.slice(0,2)+") "+local.slice(0,split)+(local.length>split?"-"+local.slice(split):"");
};

export function UnionWhatsAppContactEditDialog({
  organizationId,accountPhone,contact,initialName,onClose,onSaved,
}:{
  organizationId:string;
  accountPhone:string;
  contact:UnionWhatsAppContact;
  initialName:string;
  onClose:()=>void;
  onSaved:(contact:UnionWhatsAppContact)=>void;
}) {
  const [name,setName]=useState(initialName);
  const [phone,setPhone]=useState(maskPhone(contact.contact_phone||""));
  const [busy,setBusy]=useState(false);
  const [verifying,setVerifying]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [phoneNotice,setPhoneNotice]=useState("");
  const [phoneError,setPhoneError]=useState("");
  const [requestVersion,setRequestVersion]=useState(0);
  useEffect(()=>{
    setName(initialName);setPhone(maskPhone(contact.contact_phone||""));
    setNotice("");setError("");setPhoneNotice("");setPhoneError("");
  },[organizationId,contact.chat_jid,initialName,contact.contact_phone]);

  const checkPhone=async()=>{
    if(busy||verifying)return;
    const number=normalizePhone(phone),version=requestVersion;
    setPhoneNotice("");setPhoneError("");
    if(!/^[1-9][0-9][0-9]{8,9}$/.test(number)){
      setPhoneError("Informe DDD e telefone válido.");return;
    }
    setVerifying(true);
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),
        "check_number",{phone:"55"+number,account_phone:accountPhone});
      if(requestVersion!==version)return;
      if(!result.phone)throw Error("Não foi possível confirmar o número.");
      setPhone(maskPhone(result.phone));
      setPhoneNotice(result.distinct_identities
        ?"Número confirmado, mas outra variante pertence a uma identidade WhatsApp diferente."
        : result.adjusted?"Número confirmado com ajuste do nono dígito."
          :"Número confirmado no WhatsApp.");
    }catch(reason){
      if(requestVersion===version)
        setPhoneError(systemErrorMessage(reason,"Não foi possível verificar o número."));
    }finally{setVerifying(false);}
  };

  const save=async()=>{
    if(busy||verifying)return;
    const displayName=name.trim().replace(/\s+/g," ");
    const number=normalizePhone(phone);
    setError("");setNotice("");
    if(displayName.length<2){setError("Informe um nome com pelo menos dois caracteres.");return;}
    if((contact.contact_phone||number) && !/^[1-9][0-9][0-9]{8,9}$/.test(number)){
      setError("Informe DDD e telefone válido.");return;
    }
    setBusy(true);
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),
        "contacts_save",{
          chat_jid:contact.chat_jid,phone:number?"55"+number:undefined,
          display_name:displayName,account_phone:accountPhone,
        });
      if(!result.contact)throw Error("Não foi possível confirmar a atualização do contato.");
      const saved={...contact,...result.contact,display_name:displayName} as UnionWhatsAppContact;
      onSaved(saved);
      onClose();
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível salvar o contato."));}
    finally{setBusy(false);}
  };
  const displayName=name.trim()||initialName||contact.contact_phone||"Contato WhatsApp";
  return <AdminDialog open title="Editar contato" description="Altere apenas os dados deste contato, sem abrir a agenda."
    onClose={()=>{if(!busy)onClose();}} className="w-full max-w-lg" bodyClassName="max-h-[70dvh] overflow-y-auto"
    footer={<div className="flex flex-wrap justify-end gap-2">
      <AdminButton variant="secondary" disabled={busy} onClick={onClose}>Cancelar</AdminButton>
      <AdminButton disabled={busy||verifying||name.trim().length<2} loading={busy}
        onClick={()=>void save()}>Salvar alterações</AdminButton>
    </div>}>
    <form onSubmit={event=>{event.preventDefault();void save();}} className="space-y-4 p-1">
      <div className="flex items-center gap-3">
        <WhatsAppContactAvatar name={displayName} size="detail"/>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
          <p className="text-xs text-muted-foreground">
            {contact.contact_phone?formatWhatsAppPhone(contact.contact_phone):"Número não disponibilizado pelo WhatsApp"}
          </p>
        </div>
      </div>
      <div>
        <label htmlFor="union-contact-edit-name" className="block text-xs font-semibold">
          <RequiredFieldLabel label="Nome salvo na Union" required/>
        </label>
        <input id="union-contact-edit-name" value={name} maxLength={160} required autoFocus
          onChange={event=>setName(event.target.value)}
          className="admin-input mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"/>
      </div>
      <div>
        <label htmlFor="union-contact-edit-phone" className="block text-xs font-semibold">
          <RequiredFieldLabel label="WhatsApp" required={Boolean(contact.contact_phone)}/>
        </label>
        <div className="mt-1 flex overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary">
          <span className="border-r border-border bg-muted px-3 py-2.5 text-sm font-semibold">+55</span>
          <input id="union-contact-edit-phone" inputMode="tel" value={phone}
            onChange={event=>{
              setRequestVersion(v=>v+1);setPhoneNotice("");setPhoneError("");
              setPhone(maskPhone(event.target.value));
            }}
            placeholder="(79) 98803-7605"
            className="admin-input min-w-0 flex-1 bg-background px-3 py-2.5 text-sm outline-none"/>
          <button type="button" aria-label="Verificar número no WhatsApp"
            disabled={busy||verifying||!normalizePhone(phone)} onClick={()=>void checkPhone()}
            className="flex shrink-0 items-center gap-1.5 border-l border-border px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40">
            {verifying?<LoaderCircle size={16} className="animate-spin"/>:
              phoneNotice?<CheckCircle2 size={16}/>:<ShieldCheck size={16}/>}
            <span className="hidden sm:inline">{verifying?"Verificando":"Verificar"}</span>
          </button>
        </div>
        {phoneNotice && <p role="status" className="mt-2 text-xs text-emerald-600">{phoneNotice}</p>}
        {phoneError && <p role="alert" className="mt-2 text-xs text-red-600">{phoneError}</p>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        O nome salvo na Union tem prioridade sobre os nomes importados e o perfil público do WhatsApp.
      </p>
      {notice && <p role="status" className="text-xs text-emerald-600">{notice}</p>}
      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
    </form>
  </AdminDialog>;
}
