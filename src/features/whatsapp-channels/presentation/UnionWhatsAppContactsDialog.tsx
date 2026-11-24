import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, ContactRound, Cpu, Download, History, LoaderCircle, Pencil, Plus, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { RequiredFieldLabel } from "@/shared/ui/admin/AdminFormControls";
import { WhatsAppContactAvatar, formatWhatsAppPhone } from "./WhatsAppInboxVisuals";
import { UnionWhatsAppContactDetails } from "./UnionWhatsAppContactDetails";
import { FutureOpportunityContactSection } from "./FutureOpportunities";
import { formatCrmDocument, formatCrmFullAddress, orderedCrmAddresses, type CrmContactAddress } from "../domain/crm-contact-format";
import { UnionWhatsAppContactHistory } from "./UnionWhatsAppContactHistory";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { findUnionWhatsAppConversationByContact, operateUnionWhatsAppInbox, type UnionWhatsAppContact, type UnionWhatsAppConversation } from "../infrastructure/union-whatsapp-inbox.repository";
import {
  CONTACT_IMPORT_BATCH_SIZE, parseContactTable, parseContactsCSV,
  type ContactImportSummary,
} from "../domain/contact-file-import";

const labelFor = (contact: UnionWhatsAppContact) =>
  contact.display_name || contact.crm_name || contact.device_name || contact.imported_name || contact.profile_name ||
  contact.contact_phone || "Contato sem nome";

const normalizePhone = (value:string) => {
  const digits=value.replace(/\D/g,"");
  return digits.startsWith("55") && digits.length>11?digits.slice(2).slice(0,11):digits.slice(0,11);
};
const mask = (value:string) => {
  const digits=normalizePhone(value);
  if(digits.length<3)return digits?"("+digits:"";
  const local=digits.slice(2), mid=local.startsWith("9")?5:4;
  return "("+digits.slice(0,2)+") "+local.slice(0,mid)+(local.length>mid?"-"+local.slice(mid):"");
};

export function UnionWhatsAppContactsDialog({
  organizationId, accountPhone,channelId,canImport, canCreate, canEdit, onClose, onSaved, onChoose, initialContact, initialName,
}:{
  organizationId:string;
  accountPhone:string;
  channelId:string;
  canImport:boolean;
  canCreate:boolean;
  canEdit:boolean;
  onClose:()=>void;
  onSaved:()=>void;
  onChoose:(contact:UnionWhatsAppContact)=>Promise<boolean>;
  initialContact?:UnionWhatsAppContact|null;
  initialName?:string;
}) {
  const {hasPermission}=useAuth();
  const canReadCrm=hasPermission("customers.view");
  const canReadOrders=hasPermission("orders.details.view");
  const [crmLoading,setCrmLoading]=useState(false);
  const [contactConversation,setContactConversation]=useState<UnionWhatsAppConversation|null>(null);
  const [conversationLoading,setConversationLoading]=useState(false);
  const [openingConversation,setOpeningConversation]=useState(false);
  const [conversationError,setConversationError]=useState("");
  const [historyOpen,setHistoryOpen]=useState(false);
  const [crmPanel,setCrmPanel]=useState<"registration"|"equipments"|"orders"|null>(null);
  const [crmEquipmentId,setCrmEquipmentId]=useState<string|null>(null);
  const [crmData,setCrmData]=useState<{
    customer?:{id:string;name:string;gender?:string|null;phone?:string|null;whatsapp?:string|null;email?:string|null;document?:string|null;cnpj?:string|null;
      addresses?:CrmContactAddress[]|null}|null;
    equipments?:Array<{id:string;equipment_type_name?:string|null;equipment_brand_name?:string|null;equipment_model_name?:string|null}>;
    crm_orders?:Array<{id:string;os_number:string;created_at:string}>;
    ambiguous?:boolean;
  }|null>(null);
  const [contacts,setContacts]=useState<UnionWhatsAppContact[]>([]);
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [selected,setSelected]=useState<UnionWhatsAppContact|null>(initialContact||null);
  const [creating,setCreating]=useState(false);
  const [name,setName]=useState(initialName||"");
  const [phone,setPhone]=useState(initialContact?.contact_phone?mask(initialContact.contact_phone):"");
  // Consultar a conversa sob RLS apenas ao selecionar um contato da agenda.
  useEffect(()=>{
    setHistoryOpen(false);
    if(!selected||creating){
      setContactConversation(null);setConversationLoading(false);setConversationError("");return;
    }
    let cancelled=false;
    setContactConversation(null);setConversationLoading(true);setConversationError("");
    void findUnionWhatsAppConversationByContact(organizationId,channelId,accountPhone,selected.chat_jid)
      .then(result=>{if(!cancelled)setContactConversation(result);})
      .catch(reason=>{if(!cancelled)setConversationError(systemErrorMessage(reason,
        "Não foi possível consultar o histórico do contato."));})
      .finally(()=>{if(!cancelled)setConversationLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,channelId,accountPhone,selected?.chat_jid,creating]);
  const [phoneChecking,setPhoneChecking]=useState(false);
  const [phoneCheckNotice,setPhoneCheckNotice]=useState("");
  const [phoneCheckError,setPhoneCheckError]=useState("");
  const phoneCheckSequence=useRef(0);
  const contactListRequestRef=useRef(0);
  const vcfInputRef=useRef<HTMLInputElement|null>(null);
  const spreadsheetInputRef=useRef<HTMLInputElement|null>(null);
  const [pendingImport,setPendingImport]=useState<{
    filename:string;summary:ContactImportSummary;checkpointKey:string;
  }|null>(null);
  type ImportStatus="ready"|"running"|"pausing"|"paused"|"failed"|"cancelling"|"completed";
  const [importProgress,setImportProgress]=useState<{
    status:ImportStatus;completed:number;retries:number;error:string|null;
  }|null>(null);
  const importControlRef=useRef<{running:boolean;intent:"pause"|"cancel"|null}>({
    running:false,intent:null,
  });
  const importing=importProgress?.status==="running" ||
    importProgress?.status==="pausing" || importProgress?.status==="cancelling";
  // A tab closure pauses after the request in flight. Only the SHA-256 and
  // acknowledged item count are persisted in sessionStorage, never contacts.
  useEffect(()=>()=>{importControlRef.current.intent="pause";},[]);
  useEffect(()=>{
    if(!importing)return;
    const warnIfLeaving=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue="";
    };
    window.addEventListener("beforeunload",warnIfLeaving);
    return()=>window.removeEventListener("beforeunload",warnIfLeaving);
  },[importing]);

  // Buscar vínculo por número EXATO e confirmado no banco, somente depois
  // da seleção do contato. Não gerar uma RPC para cada linha da agenda.
  useEffect(()=>{
    if(!selected||creating||!canReadCrm){
      setCrmData(null);setCrmLoading(false);return;
    }
    let cancelled=false;
    setCrmLoading(true);setCrmData(null);
    const timer=window.setTimeout(()=>{
      void operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),
        "contacts_crm_match",{chat_jid:selected.chat_jid})
        .then(result=>{if(!cancelled)setCrmData({
          customer:result.customer||null,equipments:result.equipments||[],
          crm_orders:result.crm_orders||[],ambiguous:result.ambiguous===true,
        });})
        .catch(()=>{if(!cancelled)setCrmData({customer:null});})
        .finally(()=>{if(!cancelled)setCrmLoading(false);});
    },250);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[organizationId,channelId,accountPhone,selected?.chat_jid,creating,canReadCrm]);

  const refresh=useCallback(async (value:string,index:number)=>{
    const requestId=++contactListRequestRef.current;
    setLoading(true);
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_list",{
        search:value,page:index,
      });
      if(requestId!==contactListRequestRef.current)return;
      setContacts((result.contacts||[]).slice(0,100));
      setTotal(result.total||0);
      setError("");
    }catch(reason){
      if(requestId===contactListRequestRef.current)
        setError(systemErrorMessage(reason,"Não foi possível carregar os contatos."));
    }finally{if(requestId===contactListRequestRef.current)setLoading(false);}
  },[organizationId]);

  useEffect(()=>{
    const t=window.setTimeout(()=>{void refresh(search,page);},search?300:0);
    return()=>window.clearTimeout(t);
  },[refresh,search,page]);

  // Os contatos visíveis e o contato selecionado compartilham o cache global,
  // com carregamento progressivo no próprio componente de avatar.
  const choose=(contact:UnionWhatsAppContact)=>{
    phoneCheckSequence.current+=1;setPhoneCheckNotice("");setPhoneCheckError("");
    setSelected(contact);setCreating(false);
    setCrmPanel(null);setCrmEquipmentId(null);
    setName(contact.display_name||contact.crm_name||contact.device_name||contact.imported_name||contact.profile_name||"");
    setPhone(contact.contact_phone ? mask(contact.contact_phone) : "");
    setNotice("");
  };
  const importContacts=async()=>{
    if(!canImport || busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_import",{account_phone:accountPhone});
      setNotice(result.imported
        ? result.imported+" contato(s) salvos importado(s) do WuzAPI. Perfis públicos e participantes não salvos foram ignorados."+
          (result.truncated?" A importação atingiu o limite de 2.000 registros por execução.":"")
        : "Nenhum contato salvo disponível no WuzAPI. Para trazer os nomes da agenda do celular, utilize Importar VCF.");
      setPage(0);
      await refresh(search,0);
      onSaved();
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível importar a agenda."));}
    finally{setBusy(false);}
  };
  const importVCard=async(file:File|null)=>{
    if(!file || !canImport || busy)return;
    if(file.size>2*1048576 || !/\.vcf$/i.test(file.name)){
      setError("Selecione um arquivo .vcf de até 2 MB exportado da agenda do celular.");
      return;
    }
    setBusy(true);setError("");setNotice("");
    try{
      const raw=await file.text();
      const unfolded=raw.replace(/\r\n/g,"\n").replace(/\n[ \t]/g,"");
      const blocks=unfolded.split(/BEGIN:VCARD/i).slice(1);
      const normalized=new Map<string,{name:string;phone:string}>();
      for(const block of blocks.slice(0,3000)){
        const content=block.split(/END:VCARD/i)[0]||"";
        const lines=content.split("\n");
        const value=(prefix:string)=>{
          const hit=lines.find(line=>new RegExp("^"+prefix+"(?:;[^:]*)?:","i").test(line));
          return hit?hit.slice(hit.indexOf(":")+1).replace(/\\([,;\\nN])/g,(_,v)=>v==="n"||v==="N"?" ":v).trim():"";
        };
        const name=value("FN").slice(0,160);
        const candidates=lines.filter(line=>/^TEL(?:;[^:]*)?:/i.test(line));
        if(name.length<2)continue;
        for(const line of candidates){
          const digits=line.slice(line.indexOf(":")+1).replace(/\D/g,"");
          const national=digits.startsWith("55")&&digits.length>11?digits.slice(2):digits;
          if(/^[1-9][0-9][0-9]{8,9}$/.test(national)){
            const phone="55"+national;
            normalized.set(phone,{name,phone});
            break;
          }
        }
      }
      const entries=[...normalized.values()].slice(0,2000);
      if(!entries.length)throw Error("Nenhum contato brasileiro válido foi encontrado no arquivo.");
      let imported=0;
      for(let i=0;i<entries.length;i+=100){
        const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),
          "contacts_import_device",{contacts:entries.slice(i,i+100),account_phone:accountPhone});
        imported+=result.imported||0;
        setNotice("Importando contatos do celular: "+imported+" de "+entries.length);
      }
      setNotice(imported+" contato(s) importado(s) da agenda do celular."+
        (normalized.size>2000?" Limite de 2.000 contatos por arquivo.":""));
      setPage(0);
      await refresh(search,0);
      onSaved();
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível ler os contatos do arquivo VCF."));}
    finally{
      setBusy(false);
      if(vcfInputRef.current)vcfInputRef.current.value="";
    }
  };
  const readSpreadsheet=async(file:File|null)=>{
    if(!file||!canImport||busy||importing)return;
    if(!/\\.(xlsx|csv)$/i.test(file.name)||file.size>20*1048576){
      setError("Selecione uma planilha .xlsx ou .csv de até 20 MB.");
      return;
    }
    setError("");setNotice("");setBusy(true);
    try{
      const contents=await file.arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",contents)))
        .map(n=>n.toString(16).padStart(2,"0")).join("");
      // Key only a salted digest of file AND account; do not persist numbers.
      const identity=organizationId+":"+channelId+":"+accountPhone+":"+hash;
      const identityBytes=new TextEncoder().encode(identity);
      const identityHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",identityBytes)))
        .map(n=>n.toString(16).padStart(2,"0")).join("");
      const key="union:contacts-import:v4:"+identityHash;
      let rows;
      if(/\\.xlsx$/i.test(file.name)){
        rows=await import("read-excel-file/browser")
          .then(module=>module.readSheet(file));
      }else{
        let source="";
        try{source=new TextDecoder("utf-8",{fatal:true}).decode(contents);}
        catch{source=new TextDecoder("windows-1252").decode(contents);}
        rows=parseContactsCSV(source);
      }
      const summary=parseContactTable(rows);
      if(!summary.entries.length)
        throw Error("Não há contatos brasileiros válidos para importar. Confira Nome, DDI e Número.");
      let saved=0;
      try{saved=Number(sessionStorage.getItem(key)||0)||0;}catch{/* Storage may be disabled. */}
      const completed=Number.isInteger(saved)&&saved>=0&&saved<=summary.entries.length
        ?saved:0;
      setPendingImport({filename:file.name,summary,checkpointKey:key});
      setImportProgress({status:completed?"paused":"ready",completed,retries:0,error:null});
    }catch(reason){
      setError(systemErrorMessage(reason,
        "Não foi possível ler a planilha. Confira Nome, Código do país e Número."));
    }finally{
      setBusy(false);
      if(spreadsheetInputRef.current)spreadsheetInputRef.current.value="";
    }
  };
  const persistCheckpoint=(key:string,completed:number)=>{
    try{sessionStorage.setItem(key,String(completed));}
    catch{/* Checkpoints are best effort when browser storage is disabled. */}
  };
  const clearCheckpoint=(key:string)=>{
    try{sessionStorage.removeItem(key);}catch{/* Storage may be disabled. */}
  };
  const runSpreadsheetImport=async()=>{
    if(!pendingImport||importControlRef.current.running||busy)return;
    const control=importControlRef.current;
    control.running=true;control.intent=null;
    const entries=pendingImport.summary.entries,key=pendingImport.checkpointKey;
    const total=entries.length;
    let completed=importProgress?.completed||0;
    let retries=importProgress?.retries||0;
    setImportProgress({status:"running",completed,retries,error:null});
    setError("");setNotice("");
    try{
      while(completed<total && !control.intent){
        const chunk=entries.slice(completed,completed+CONTACT_IMPORT_BATCH_SIZE);
        let acknowledged=false;
        for(let attempt=1;attempt<=3&&!control.intent;attempt++){
          try{
            const result=await operateUnionWhatsAppInbox(
              organizationId,crypto.randomUUID(),"contacts_import_batch",{contacts:chunk,account_phone:accountPhone},
            );
            if(result.imported!==chunk.length){
              throw Error("O lote não foi confirmado integralmente pelo servidor.");
            }
            acknowledged=true;break;
          }catch(reason){
            if(control.intent)break;
            if(attempt===3)throw reason;
            retries++;
            setImportProgress({status:"running",completed,retries,error:null});
            await new Promise<void>(resolve=>window.setTimeout(resolve,attempt*1000));
          }
        }
        if(!acknowledged)break;
        completed+=chunk.length;
        // Crash-safe checkpoint only after receiving a successful server ack.
        // A lost ack can resend one batch; server upsert is idempotent.
        persistCheckpoint(key,completed);
        setImportProgress({status:control.intent==="pause"?"pausing":
          control.intent==="cancel"?"cancelling":"running",
          completed,retries,error:null});
      }
      // Run the expensive conversation-name synchronization only once, not
      // on each of the approximately 124 batches for 31,000 contacts.
      if(completed>0){
        await operateUnionWhatsAppInbox(
          organizationId,crypto.randomUUID(),"contacts_apply_names",{account_phone:accountPhone},
        );
      }
      if(control.intent==="cancel"){
        clearCheckpoint(key);
        setImportProgress({status:"completed",completed,retries,error:null});
        setPendingImport(null);
        setNotice("Importação cancelada. "+completed+" contato(s) já confirmados permanecem salvos; "+
          (total-completed)+" não foram enviados.");
      }else if(control.intent==="pause"){
        setImportProgress({status:"paused",completed,retries,error:null});
      }else if(completed===total){
        clearCheckpoint(key);
        setImportProgress({status:"completed",completed,retries,error:null});
        setNotice("Importação concluída: "+total+" contato(s) processados, com nomes personalizados preservados.");
      }
      if(completed>0){
        setPage(0);
        await refresh(search,0);
        onSaved();
      }
    }catch(reason){
      const message=systemErrorMessage(reason,
        "Um lote falhou. Os contatos já confirmados estão preservados; retome para continuar.");
      setImportProgress({status:"failed",completed,retries,error:message});
      // Earlier batches are durable. Sync their names even when a later
      // network request fails; do not erase the stored checkpoint.
      if(completed>0){
        try{
          await operateUnionWhatsAppInbox(
            organizationId,crypto.randomUUID(),"contacts_apply_names",{account_phone:accountPhone},
          );
          await refresh(search,0);
          onSaved();
        }catch{/* Show the original failure; retry will reattempt syncing. */}
      }
    }finally{control.running=false;control.intent=null;}
  };
  const pauseSpreadsheetImport=()=>{
    if(!importControlRef.current.running)return;
    importControlRef.current.intent="pause";
    setImportProgress(old=>old?{...old,status:"pausing"}:old);
  };
  const cancelSpreadsheetImport=()=>{
    if(!pendingImport)return;
    if(importControlRef.current.running){
      importControlRef.current.intent="cancel";
      setImportProgress(old=>old?{...old,status:"cancelling"}:old);
      return;
    }
    const completed=importProgress?.completed||0;
    clearCheckpoint(pendingImport.checkpointKey);
    setPendingImport(null);setImportProgress(null);
    setNotice("Importação cancelada. "+completed+" contatos já confirmados permanecem na agenda.");
  };
  const closeContacts=()=>{
    if(importControlRef.current.running){pauseSpreadsheetImport();return;}
    onClose();
  };
  const checkContactPhone=async()=>{
    if(!(creating ? canCreate : canEdit) || phoneChecking || busy)return;
    const sequence=++phoneCheckSequence.current;
    setPhoneCheckNotice("");setPhoneCheckError("");
    const number=normalizePhone(phone);
    if(!/^[1-9][0-9][0-9]{8,9}$/.test(number)){
      setPhoneCheckError("Informe DDD e telefone válido.");return;
    }
    setPhoneChecking(true);
    try {
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),
        "check_number",{phone:"55"+number,account_phone:accountPhone});
      if(sequence!==phoneCheckSequence.current)return;
      if(!result.phone)throw Error("Não foi possível confirmar o número.");
      setPhone(mask(result.phone));
      setPhoneCheckNotice(result.distinct_identities
        ?"Número confirmado; a outra variante do nono dígito pertence a outra identidade WhatsApp."
        : result.adjusted?"Número canônico confirmado com ajuste do nono dígito.":"Número confirmado no WhatsApp.");
    }catch(reason){
      if(sequence===phoneCheckSequence.current)
        setPhoneCheckError(systemErrorMessage(reason,"Não foi possível verificar o contato."));
    }finally{setPhoneChecking(false);}
  };

  const save=async()=>{
    if(!(creating ? canCreate : canEdit) || busy)return;
    if(name.trim().length<2){setError("Informe um nome com pelo menos dois caracteres.");return;}
    const number=normalizePhone(phone);
    if((creating || (selected?.contact_phone && "55"+number!==selected.contact_phone) || (!selected?.contact_phone && number)) && !/^[1-9][0-9][0-9]{8,9}$/.test(number)){
      setError("Informe DDD e telefone válido.");return;
    }
    setBusy(true);setError("");setNotice("");
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_save",
        creating?{phone:"55"+number,display_name:name.trim(),account_phone:accountPhone}:
          {chat_jid:selected?.chat_jid,phone:number?"55"+number:undefined,display_name:name.trim(),account_phone:accountPhone});
      const saved=result.contact;
      if(saved){
        setCreating(false);
        setSelected(old=>old?{...old,...saved,display_name:name.trim()}:
          {...saved,contact_phone:saved.contact_phone||"55"+number,imported_name:null,profile_name:null,updated_at:new Date().toISOString()});
      }
      setNotice("Contato salvo na agenda da Union.");setPhoneCheckNotice("");setPhoneCheckError("");
      await refresh(search,page);
      onSaved();
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível salvar o contato."));}
    finally{setBusy(false);}
  };
  const currentName=selected?(name.trim()||labelFor(selected)):name;
  return <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex min-h-0 items-center justify-center bg-black/60 p-2 sm:p-4"
    onClick={event=>{if(event.target===event.currentTarget)closeContacts();}}>
    <div role="dialog" aria-modal="true" aria-label="Gerenciar contatos WhatsApp"
      className="flex h-full max-h-[960px] min-h-0 w-full max-w-[1180px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-2"><ContactRound size={20} className="shrink-0 text-primary"/>
          <div><h2 className="font-bold">Contatos WhatsApp</h2>
            <p className="text-[11px] text-muted-foreground">Agenda exclusiva desta empresa · {total} registros</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {canImport && <>
            <input ref={vcfInputRef} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden"
              aria-label="Arquivo VCF da agenda do celular"
              onChange={event=>{void importVCard(event.target.files?.[0]||null);}}/>
            <button type="button" disabled={busy} onClick={()=>vcfInputRef.current?.click()}
              title="Importar arquivo VCF exportado do celular"
              className="rounded-lg border border-border px-2.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">
              Importar VCF
            </button>
            <input ref={spreadsheetInputRef} type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden" aria-label="Arquivo Excel ou CSV com contatos"
              onChange={event=>{void readSpreadsheet(event.target.files?.[0]||null);}}/>
            <button type="button" disabled={busy} onClick={()=>spreadsheetInputRef.current?.click()}
              title="Importar até 50.000 contatos via Excel/CSV, inclusive Nome + DDI + Número"
              className="rounded-lg border border-border px-2.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">
              Excel / CSV
            </button>
            <button type="button" disabled={busy} onClick={()=>void importContacts()}
              title="Importar somente os contatos salvos identificados pelo WhatsApp; não importar membros de grupos"
              className="flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-50">
              {busy?<LoaderCircle size={15} className="animate-spin"/>:<Download size={15}/>}
              WuzAPI
            </button>
          </>}
          <button type="button" onClick={closeContacts} title="Fechar" aria-label="Fechar"
            className="rounded-lg p-2 hover:bg-muted"><X size={19}/></button>
        </div>
      </div>
      {(error||notice) && <div role={error?"alert":"status"} className={`mx-4 mt-3 rounded-lg border p-2 text-xs ${error?"border-red-400/40 text-red-600":"border-primary/30 text-foreground"}`}>
        {error||notice}
      </div>}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.2fr)] md:grid-cols-[minmax(320px,41%)_minmax(0,1fr)] md:grid-rows-1">
        <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
          <div className="flex shrink-0 gap-2 p-3">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input aria-label="Buscar contatos" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}}
                placeholder="Nome ou telefone" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-2 text-sm outline-none focus:border-primary"/>
            </div>
            {canCreate && <button type="button" aria-label="Adicionar contato" title="Novo contato"
              onClick={()=>{phoneCheckSequence.current+=1;setPhoneCheckNotice("");setPhoneCheckError("");setCreating(true);setSelected(null);setCrmPanel(null);setCrmEquipmentId(null);setName("");setPhone("");setNotice("");}}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary hover:bg-primary/15">
              <Plus size={18}/>
            </button>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading&&<div role="status" className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 p-6 text-center text-xs text-muted-foreground"><LoaderCircle size={24} className="animate-spin text-primary"/><span>Carregando contatos...</span></div>}
            {!loading && contacts.length===0 && <p className="p-5 text-center text-xs text-muted-foreground">Nenhum contato salvo encontrado. Importe por VCF, Excel ou CSV, sincronize os nomes salvos disponíveis no WuzAPI ou cadastre um contato. Participantes de grupos não entram automaticamente na agenda.</p>}
            {!loading&&contacts.map(contact=>{
              const display=labelFor(contact);
              return <button type="button" key={contact.id} onClick={()=>choose(contact)}
                className={`flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left hover:bg-muted ${selected?.id===contact.id?"bg-primary/10":""}`}>
                <WhatsAppContactAvatar name={display}
                  identity={{organizationId,accountPhone,chatJid:contact.chat_jid}}/>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{display}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {contact.contact_phone ? formatWhatsAppPhone(contact.contact_phone) : "Contato com identificador privado"}
                  </span>
                </span>
                {contact.display_name && <Check size={15} className="shrink-0 text-primary"/>}
              </button>;
            })}
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-border p-3 text-xs">
            <span className="text-muted-foreground">{total?Math.min(page*100+1,total):0}–{Math.min(page*100+contacts.length,total)} de {total}</span>
            <div className="flex gap-2">
              <button type="button" disabled={!page || loading} aria-label="Página anterior" onClick={()=>setPage(n=>Math.max(0,n-1))}
                className="rounded-lg border border-border p-1.5 disabled:opacity-30"><ChevronLeft size={17}/></button>
              <button type="button" disabled={loading || (page+1)*100>=total} aria-label="Próxima página" onClick={()=>setPage(n=>n+1)}
                className="rounded-lg border border-border p-1.5 disabled:opacity-30"><ChevronRight size={17}/></button>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {!selected && !creating ? <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <ContactRound size={34}/>
            <p>Selecione um contato para editar o nome e o número.</p>
          </div> : <div className="space-y-4">
            <div className="flex items-center gap-3">
              <WhatsAppContactAvatar size="detail" name={currentName}
                identity={selected?{organizationId,accountPhone,chatJid:selected.chat_jid}:null}
                gender={crmData?.customer?.gender}
                />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold">{creating?"Novo contato":currentName}</p>
                <p className="text-xs text-muted-foreground">{creating?"Salvar na agenda da Union":
                  selected?.contact_phone?formatWhatsAppPhone(selected.contact_phone):"Número não disponibilizado pelo WhatsApp"}</p>
              </div>
              {!creating&&selected&&<button type="button"
                onClick={()=>setHistoryOpen(value=>!value)} aria-expanded={historyOpen}
                title="Histórico geral do contato" aria-label="Histórico geral do contato"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5">
                <History size={16}/><span className="hidden sm:inline">Histórico</span>
              </button>}
            </div>
            {historyOpen&&selected&&<section aria-label="Histórico geral do contato" className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-bold">Histórico geral do contato</h3>
              {conversationLoading?<p role="status" className="flex items-center justify-center gap-2 py-5 text-center text-xs text-muted-foreground">
                <LoaderCircle size={15} className="animate-spin"/> Consultando histórico...
              </p>:<>
                {conversationError&&<p role="alert" className="mb-2 text-xs text-destructive">{conversationError}</p>}
                <UnionWhatsAppContactHistory key={organizationId+":"+selected.id+":"+(selected.updated_at||"")} organizationId={organizationId}
                  contactJid={selected.chat_jid} accountPhone={accountPhone} contactId={selected.id} channelId={channelId}
                  conversation={contactConversation?.chat_jid===selected.chat_jid?contactConversation:null}/>
              </>}
            </section>}
            <div>
              <label className="block text-xs font-semibold" htmlFor="union-contact-name"><RequiredFieldLabel label="Nome salvo na Union" required/></label>
              <input id="union-contact-name" value={name} disabled={!(creating ? canCreate : canEdit)}
                onChange={event=>setName(event.target.value)} maxLength={160} placeholder="Nome do contato"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"/>
            </div>
            {(creating || selected) && <div>
              <label htmlFor="union-contact-phone" className="block text-xs font-semibold"><RequiredFieldLabel label="WhatsApp" required/></label>
              <div className="mt-1 flex overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary">
                <span className="border-r border-border bg-muted px-3 py-2.5 text-sm font-semibold">+55</span>
                <input id="union-contact-phone" inputMode="tel" value={phone} disabled={!(creating ? canCreate : canEdit)}
                  onChange={event=>{
                    phoneCheckSequence.current+=1;setPhoneCheckNotice("");setPhoneCheckError("");
                    setPhone(mask(event.target.value));
                  }} placeholder="(79) 98803-7605"
                  className="min-w-0 flex-1 bg-background px-3 py-2.5 text-sm outline-none disabled:opacity-60"/>
                <button type="button" aria-label="Verificar número no WhatsApp" title="Verificar número no WhatsApp"
                  disabled={!(creating ? canCreate : canEdit) || busy || phoneChecking || !phone.trim()}
                  onClick={()=>void checkContactPhone()}
                  className="inline-flex shrink-0 items-center justify-center gap-2 border-l border-border px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">
                  {phoneChecking?<LoaderCircle size={16} className="animate-spin"/>:
                    phoneCheckNotice?<CheckCircle2 size={16}/>:<ShieldCheck size={16}/>}
                  <span className="hidden sm:inline">{phoneChecking?"Verificando":"Verificar"}</span>
                </button>
              </div>
              {phoneCheckNotice && <p role="status" className="mt-2 text-xs font-medium text-emerald-600">{phoneCheckNotice}</p>}
              {phoneCheckError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{phoneCheckError}</p>}
            </div>}
            {!creating && selected && canReadCrm && <section aria-label="Dados do cliente vinculado no CRM"
              className="overflow-hidden rounded-xl border border-border text-xs">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-bold">Dados do CRM</h3>
                {crmData?.customer&&<a href={adminPath("customers",crmData.customer.id,"customer")}
                  target="_blank" rel="noopener noreferrer"
                  className="shrink-0 font-semibold text-primary hover:underline">Abrir cadastro</a>}
              </div>
              <div className="p-2.5 sm:p-3">
                {crmLoading?<p role="status" className="flex items-center justify-center gap-2 px-2 py-4 text-center text-muted-foreground">
                  <LoaderCircle size={14} className="animate-spin"/> Consultando dados do CRM...
                </p>:!crmData?.customer?<p className="px-2 py-4 text-center text-muted-foreground">
                  {crmData?.ambiguous
                    ?"Mais de um cadastro possui este número. Verifique antes de vincular."
                    :"Nenhum cliente do CRM encontrado para este número."}
                </p>:crmPanel===null?<div className="space-y-1">
                  <button type="button" onClick={()=>setCrmPanel("registration")}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-semibold hover:bg-muted">
                    <UserRound size={17} className="shrink-0"/>
                    <span className="min-w-0 flex-1">Dados de cadastro</span>
                    <ChevronRight size={16} className="text-muted-foreground"/>
                  </button>
                  <button type="button" onClick={()=>{setCrmPanel("equipments");setCrmEquipmentId(null);}}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-semibold hover:bg-muted">
                    <Cpu size={17} className="shrink-0"/>
                    <span className="min-w-0 flex-1">Equipamentos</span>
                    <span className="text-muted-foreground">{crmData.equipments?.length||0}</span>
                    <ChevronRight size={16} className="text-muted-foreground"/>
                  </button>
                  {canReadOrders&&<button type="button" onClick={()=>setCrmPanel("orders")}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-semibold hover:bg-muted">
                    <ClipboardList size={17} className="shrink-0"/>
                    <span className="min-w-0 flex-1">OS recentes</span>
                    <span className="text-muted-foreground">{crmData.crm_orders?.length||0}</span>
                    <ChevronRight size={16} className="text-muted-foreground"/>
                  </button>}
                </div>:<div className="min-w-0">
                  <button type="button" onClick={()=>{
                    if(crmPanel==="equipments"&&crmEquipmentId)setCrmEquipmentId(null);
                    else setCrmPanel(null);
                  }} className="mb-3 inline-flex items-center gap-2 rounded-lg px-2 py-2 font-semibold text-primary hover:bg-primary/5">
                    <ArrowLeft size={15}/> Voltar
                  </button>
                  {crmPanel==="registration"?<div className="space-y-3 px-2 pb-2">
                    <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                      {([
                        ["Cliente",crmData.customer.name],
                        [crmData.customer.cnpj || String(crmData.customer.document||"").replace(/\D/g,"").length===14 ? "CNPJ" : "CPF",
                          formatCrmDocument(crmData.customer.cnpj||crmData.customer.document)],
                        ["Telefone",crmData.customer.phone?formatWhatsAppPhone(crmData.customer.phone):"Não informado"],
                        ["WhatsApp",crmData.customer.whatsapp?formatWhatsAppPhone(crmData.customer.whatsapp):"Não informado"],
                        ["E-mail",crmData.customer.email||"Não informado"],
                      ] as Array<[string,string]>).map(([label,value])=><div key={label} className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
                        <p className="mt-1 break-words font-medium text-foreground">{value}</p>
                      </div>)}
                    </div>
                    <div className="space-y-2 border-t border-border pt-3">
                      {crmData.customer.addresses?.length
                        ? orderedCrmAddresses(crmData.customer.addresses).map((address,index)=><div key={address.id||index} className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                              {address.is_default || index===0 ? "Endereço principal" : "Endereço "+(index+1)}
                            </p>
                            <p className="mt-1 break-words font-medium leading-5 text-foreground">{formatCrmFullAddress(address)}</p>
                          </div>)
                        : <div className="text-xs text-muted-foreground">
                            <p className="font-semibold uppercase">Endereço</p>
                            <p className="mt-1">Nenhum endereço cadastrado.</p>
                          </div>}
                    </div>
                  </div>:crmPanel==="equipments"?(
                    !crmData.equipments?.length?<p className="px-2 py-3 text-muted-foreground">Nenhum equipamento cadastrado.</p>
                    :crmEquipmentId?<div className="grid grid-cols-1 gap-3 px-2 pb-2 sm:grid-cols-2">
                      {(()=>{
                        const equipment=crmData.equipments.find(item=>item.id===crmEquipmentId);
                        return equipment?([
                          ["Tipo",equipment.equipment_type_name||"Não informado"],
                          ["Marca",equipment.equipment_brand_name||"Não informada"],
                          ["Modelo",equipment.equipment_model_name||"Não informado"],
                        ] as Array<[string,string]>).map(([label,value])=><div key={label}>
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
                          <p className="mt-1 font-medium">{value}</p>
                        </div>):null;
                      })()}
                    </div>:<div className="space-y-1">
                      {crmData.equipments.map(item=><button type="button" key={item.id}
                        onClick={()=>setCrmEquipmentId(item.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted">
                        <Cpu size={16} className="shrink-0"/>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {[item.equipment_type_name,item.equipment_brand_name,item.equipment_model_name].filter(Boolean).join(" · ")||"Equipamento sem descrição"}
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-muted-foreground"/>
                      </button>)}
                    </div>
                  ):<div className="space-y-1">
                    {!crmData.crm_orders?.length?<p className="px-2 py-3 text-muted-foreground">Nenhuma OS encontrada.</p>
                    :crmData.crm_orders.map(order=><a key={order.id}
                      href={adminPath("orders",order.id)} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-3 py-3 font-semibold hover:bg-muted">
                      <ClipboardList size={16} className="shrink-0"/>
                      <span className="min-w-0 flex-1">OS {order.os_number}</span>
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground"/>
                    </a>)}
                  </div>}
                </div>}
              </div>
            </section>}
            {!creating&&selected&&<section aria-label="Mídias, documentos e links do WhatsApp">
              {conversationLoading?<div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-6 text-xs text-muted-foreground">
                <LoaderCircle size={15} className="animate-spin"/> Consultando arquivos da conversa...
              </div>:contactConversation?.chat_jid===selected.chat_jid?
                <UnionWhatsAppContactDetails key={contactConversation.id} inline
                  conversation={contactConversation} organizationId={organizationId}
                  canRecordOpportunity={hasPermission("whatsapp.inbox.send")}
                  onClose={()=>undefined}/>:
                <div className="overflow-hidden rounded-xl border border-border text-xs">
                  <h3 className="border-b border-border bg-muted/30 px-4 py-3 text-sm font-bold">Mídias, documentos e links</h3>
                  <p className="px-4 py-6 text-center text-muted-foreground">
                    {conversationError||"Nenhuma conversa registrada para consultar arquivos deste contato."}
                  </p>
                </div>}
            </section>}
            {!creating && selected && (!contactConversation || contactConversation.chat_jid!==selected.chat_jid) &&
              <FutureOpportunityContactSection key={selected.id} identity={{
                organization_id:organizationId,channel_id:channelId,account_phone:accountPhone,
                chat_jid:selected.chat_jid,contact_name:labelFor(selected),contact_phone:selected.contact_phone,
                conversation_id:null,
              }} canEdit={hasPermission("whatsapp.inbox.send")}/>}
            {!creating && selected && !selected.contact_phone &&
              <p className="text-xs text-muted-foreground">Se este identificador privado ainda não tiver conversa, será preciso receber uma mensagem antes de iniciar pelo número.</p>}
          </div>}
          </div>
          <div className="flex min-h-[58px] shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-2.5 sm:px-5">
            {(selected||creating) && <>
              {(creating ? canCreate : canEdit)&&<AdminButton disabled={busy||name.trim().length<2} onClick={()=>void save()}>
                <Pencil size={15}/> {busy?"Salvando...":"Salvar contato"}
              </AdminButton>}
              {!creating&&selected&&<AdminButton variant="secondary"
                disabled={openingConversation} onClick={()=>{
                  if(openingConversation)return;
                  setOpeningConversation(true);
                  void onChoose(selected).then(opened=>{if(opened)onClose();})
                    .catch(reason=>setError(systemErrorMessage(reason,"Não foi possível abrir a conversa.")))
                    .finally(()=>setOpeningConversation(false));
                }}>{openingConversation?<><LoaderCircle size={16} className="animate-spin"/> Abrindo conversa...</>:"Abrir conversa"}</AdminButton>}
            </>}
          </div>
        </div>
      </div>
    </div>
    {pendingImport && importProgress && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 sm:p-5"
      onClick={event=>{
        if(event.target===event.currentTarget&&!importing&&!busy)setPendingImport(null);
      }}>
      <div role="dialog" aria-modal="true" aria-label="Importação de contatos da planilha"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold">Importação de contatos</h3>
            <p className="mt-1 break-all text-xs text-muted-foreground">{pendingImport.filename}</p>
          </div>
          <button type="button" aria-label="Fechar importação" onClick={()=>{
            if(importing)pauseSpreadsheetImport();
            else setPendingImport(null);
          }} className="rounded-lg p-1.5 hover:bg-muted"><X size={18}/></button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
            <div className="rounded-lg bg-primary/10 p-2">
              <p className="text-base font-bold text-primary">{pendingImport.summary.entries.length.toLocaleString("pt-BR")}</p>
              <p>Válidos</p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <p className="text-base font-bold">{pendingImport.summary.duplicates.toLocaleString("pt-BR")}</p>
              <p>Duplicados</p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <p className="text-base font-bold">{pendingImport.summary.invalidRows.toLocaleString("pt-BR")}</p>
              <p>Inválidos</p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <p className="text-base font-bold">{pendingImport.summary.unsupportedCountries.toLocaleString("pt-BR")}</p>
              <p>Outro DDI</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Telefone</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pendingImport.summary.entries.slice(0,5).map(entry=>
                  <tr key={entry.phone}>
                    <td className="max-w-[200px] truncate px-3 py-2">{entry.name}</td>
                    <td className="px-3 py-2 tabular-nums">+{entry.phone}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {pendingImport.summary.totalRows.toLocaleString("pt-BR")} linhas analisadas.
            Aceita até 50.000 contatos brasileiros por arquivo (20 MB).
            A coluna DDI pode conter 55; outros países são listados como ignorados.
            Nomes personalizados na Union não são substituídos.
            {pendingImport.summary.layout==="without_header"?" Detectado formato sem cabeçalho (Nome, DDI, Número).":""}
            {pendingImport.summary.capped?" Parte dos contatos excede o limite e não será importada.":""}
          </p>
          <div className="space-y-2 rounded-lg border border-border p-3" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold">
                {importProgress.status==="running"?"Importando contatos":
                 importProgress.status==="pausing"?"Pausando após o lote atual":
                 importProgress.status==="paused"?"Importação pausada":
                 importProgress.status==="cancelling"?"Cancelando após o lote atual":
                 importProgress.status==="failed"?"Importação interrompida por erro":
                 importProgress.status==="completed"?"Importação concluída":"Pronto para importar"}
              </span>
              <span className="text-sm font-bold tabular-nums">
                {Math.floor(100*importProgress.completed/pendingImport.summary.entries.length)}%
              </span>
            </div>
            <div role="progressbar"
              aria-label="Progresso da importação" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={Math.floor(100*importProgress.completed/pendingImport.summary.entries.length)}
              className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{width:(100*importProgress.completed/pendingImport.summary.entries.length)+"%"}}/>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
              <span>{importProgress.completed.toLocaleString("pt-BR")} processados</span>
              <span>{(pendingImport.summary.entries.length-importProgress.completed).toLocaleString("pt-BR")} restantes</span>
            </div>
            {importProgress.retries>0&&<p className="text-[11px] text-muted-foreground">
              {importProgress.retries} tentativa(s) automática(s) após falhas de conexão.
            </p>}
            {importProgress.status==="failed"&&<p className="text-xs text-destructive">
              {importProgress.error||"Falha no envio. Você pode retomar de onde parou."}
            </p>}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Os contatos são enviados em lotes de {CONTACT_IMPORT_BATCH_SIZE}, com confirmação de cada lote.
            Pausar ou cancelar aguarda o lote atual; contatos já confirmados permanecem salvos.
            Se atualizar esta aba, selecione o mesmo arquivo para recuperar o ponto salvo.
            O arquivo e os telefones não são guardados no armazenamento do navegador.
          </p>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            {importProgress.status!=="completed"&&
              <AdminButton variant="secondary"
                disabled={importProgress.status==="cancelling"}
                onClick={cancelSpreadsheetImport}>
                {importProgress.status==="cancelling"?"Cancelando...":"Cancelar"}
              </AdminButton>}
            {importProgress.status==="running"?
              <AdminButton onClick={pauseSpreadsheetImport}>Pausar</AdminButton>:
             importProgress.status==="pausing"||importProgress.status==="cancelling"?
              <AdminButton disabled>
                <LoaderCircle size={15} className="animate-spin"/> Aguardando lote...
              </AdminButton>:
             importProgress.status==="completed"?
              <AdminButton onClick={()=>{setPendingImport(null);setImportProgress(null);}}>
                Concluir
              </AdminButton>:
              <AdminButton disabled={busy} onClick={()=>void runSpreadsheetImport()}>
                {importProgress.completed>0?"Retomar importação":
                  "Importar "+pendingImport.summary.entries.length.toLocaleString("pt-BR")+" contatos"}
              </AdminButton>}
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
