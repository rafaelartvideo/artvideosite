import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ContactRound, Download, LoaderCircle, Pencil, Plus, Search, X } from "lucide-react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { operateUnionWhatsAppInbox, type UnionWhatsAppContact } from "../infrastructure/union-whatsapp-inbox.repository";
import {
  CONTACT_IMPORT_BATCH_SIZE, parseContactTable, parseContactsCSV,
  type ContactImportSummary,
} from "../domain/contact-file-import";

const labelFor = (contact: UnionWhatsAppContact) =>
  contact.display_name || contact.device_name || contact.imported_name || contact.profile_name ||
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
const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(p=>p[0]||"").join("").toUpperCase();

export function UnionWhatsAppContactsDialog({
  organizationId, canImport, canEdit, onClose, onSaved, onChoose, initialContact, initialName,
}:{
  organizationId:string;
  canImport:boolean;
  canEdit:boolean;
  onClose:()=>void;
  onSaved:()=>void;
  onChoose:(contact:UnionWhatsAppContact)=>boolean;
  initialContact?:UnionWhatsAppContact|null;
  initialName?:string;
}) {
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
  const [avatar,setAvatar]=useState<string|null>(null);
  const [listAvatars,setListAvatars]=useState<Record<string,string|null>>({});
  const avatarRequestsRef=useRef(new Set<string>());
  const listScrollRef=useRef<HTMLDivElement|null>(null);
  const [visibleAvatarJids,setVisibleAvatarJids]=useState<string[]>([]);
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

  const refresh=useCallback(async (value:string,index:number)=>{
    setLoading(true);
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_list",{
        search:value,page:index,
      });
      setContacts(result.contacts||[]);
      setTotal(result.total||0);
      setError("");
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível carregar os contatos."));}
    finally{setLoading(false);}
  },[organizationId]);

  useEffect(()=>{
    const t=window.setTimeout(()=>{void refresh(search,page);},search?300:0);
    return()=>window.clearTimeout(t);
  },[refresh,search,page]);

  useEffect(()=>{
    let canceled=false;
    setAvatar(null);
    if(!selected)return;
    void operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_avatar",{
      chat_jid:selected.chat_jid,
    }).then(result=>{
      if(!canceled){
        setAvatar(result.avatar_url||null);
        setListAvatars(old=>({...old,[selected!.chat_jid]:result.avatar_url||null}));
      }
    }).catch(()=>{if(!canceled)setAvatar(null);});
    return()=>{canceled=true;};
  },[organizationId,selected?.chat_jid]);

  // Only fetch avatars entering the contact list's viewport. The prior
  // first-12-only cap permanently left all other contacts as initials.
  useEffect(()=>{
    const root=listScrollRef.current;
    if(!root || loading || !contacts.length)return;
    const observer=new IntersectionObserver(entries=>{
      const entering=entries.filter(item=>item.isIntersecting)
        .map(item=>(item.target as HTMLElement).dataset.avatarJid||"")
        .filter(Boolean);
      if(entering.length)setVisibleAvatarJids(old=>[...new Set([...old,...entering])]);
    },{root,rootMargin:"100px 0px",threshold:0.01});
    root.querySelectorAll<HTMLElement>("[data-avatar-jid]").forEach(node=>observer.observe(node));
    return()=>observer.disconnect();
  },[contacts,loading]);
  const previewJids=[...new Set([
    ...contacts.slice(0,3).map(item=>item.chat_jid),
    ...visibleAvatarJids.filter(jid=>contacts.some(item=>item.chat_jid===jid)),
  ])].join(",");
  useEffect(()=>{
    if(!previewJids || loading)return;
    const toFetch=previewJids.split(",").filter(jid=>jid &&
      !Object.prototype.hasOwnProperty.call(listAvatars,jid) &&
      !avatarRequestsRef.current.has(jid))
      .slice(0,Math.max(0,3-avatarRequestsRef.current.size));
    for(const jid of toFetch){
      avatarRequestsRef.current.add(jid);
      void operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),
        "contacts_avatar",{chat_jid:jid})
        .then(result=>setListAvatars(old=>({...old,[jid]:result.avatar_url||null})))
        .catch(()=>setListAvatars(old=>({...old,[jid]:null})))
        .finally(()=>avatarRequestsRef.current.delete(jid));
    }
  },[organizationId,previewJids,listAvatars,loading]);

  const choose=(contact:UnionWhatsAppContact)=>{
    setSelected(contact);setCreating(false);
    setName(contact.display_name||contact.device_name||contact.imported_name||contact.profile_name||"");
    setPhone(contact.contact_phone ? mask(contact.contact_phone) : "");
    setNotice("");
  };
  const importContacts=async()=>{
    if(!canImport || busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_import");
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
          "contacts_import_device",{contacts:entries.slice(i,i+100)});
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
      const key="union:contacts-import:v3:"+organizationId+":"+hash;
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
              organizationId,crypto.randomUUID(),"contacts_import_batch",{contacts:chunk},
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
          organizationId,crypto.randomUUID(),"contacts_apply_names",
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
            organizationId,crypto.randomUUID(),"contacts_apply_names",
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
  const save=async()=>{
    if(!canEdit || busy)return;
    if(name.trim().length<2){setError("Informe um nome com pelo menos dois caracteres.");return;}
    const number=normalizePhone(phone);
    if(creating && !/^[1-9][0-9][0-9]{8,9}$/.test(number)){
      setError("Informe DDD e telefone válido.");return;
    }
    setBusy(true);setError("");setNotice("");
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_save",
        creating?{phone:"55"+number,display_name:name.trim()}:
          {chat_jid:selected?.chat_jid,display_name:name.trim()});
      const saved=result.contact;
      if(saved){
        setCreating(false);
        setSelected(old=>old?{...old,display_name:name.trim()}:
          {...saved,contact_phone:"55"+number,imported_name:null,profile_name:null,updated_at:new Date().toISOString()});
      }
      setNotice("Nome salvo na agenda da Union.");
      await refresh(search,page);
      onSaved();
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível salvar o contato."));}
    finally{setBusy(false);}
  };
  const currentName=selected?(name.trim()||labelFor(selected)):name;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
    onClick={event=>{if(event.target===event.currentTarget)closeContacts();}}>
    <div role="dialog" aria-modal="true" aria-label="Gerenciar contatos WhatsApp"
      className="flex h-[min(83vh,740px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
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
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-rows-1">
        <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
          <div className="flex shrink-0 gap-2 p-3">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary"/>
              <input aria-label="Buscar contatos" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}}
                placeholder="Nome ou telefone" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-2 text-sm outline-none focus:border-primary"/>
            </div>
            {canEdit && <button type="button" aria-label="Adicionar contato" title="Novo contato"
              onClick={()=>{setCreating(true);setSelected(null);setName("");setPhone("");setAvatar(null);setNotice("");}}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary hover:bg-primary/15">
              <Plus size={18}/>
            </button>}
          </div>
          <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {loading && contacts.length===0 && <p className="p-4 text-center text-xs text-muted-foreground">Carregando contatos...</p>}
            {!loading && contacts.length===0 && <p className="p-5 text-center text-xs text-muted-foreground">Nenhum contato salvo encontrado. Importe por VCF, Excel ou CSV, sincronize os nomes salvos disponíveis no WuzAPI ou cadastre um contato. Participantes de grupos não entram automaticamente na agenda.</p>}
            {contacts.map(contact=>{
              const display=labelFor(contact);
              return <button type="button" key={contact.id} data-avatar-jid={contact.chat_jid} onClick={()=>choose(contact)}
                className={`flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left hover:bg-muted ${selected?.id===contact.id?"bg-primary/10":""}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {listAvatars[contact.chat_jid]
                    ? <img src={listAvatars[contact.chat_jid]!} alt="" loading="lazy"
                        referrerPolicy="no-referrer" className="h-full w-full object-cover"
                        onError={()=>setListAvatars(old=>({...old,[contact.chat_jid]:null}))}/>
                    : initials(display)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{display}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {contact.contact_phone ? "+"+contact.contact_phone : "Contato com identificador privado"}
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
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          {!selected && !creating ? <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <ContactRound size={34}/>
            <p>Selecione um contato para ver os dados e editar o nome.</p>
            <p className="max-w-xs text-xs">A Union preserva o nome salvo aqui mesmo que o perfil público da pessoa seja diferente.</p>
          </div> : <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-bold">
                {avatar?<img alt="" src={avatar} referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={()=>setAvatar(null)}/>:initials(currentName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-bold">{creating?"Novo contato":currentName}</p>
                <p className="text-xs text-muted-foreground">{creating?"Salvar na agenda da Union":
                  selected?.contact_phone?"+"+selected.contact_phone:"Número não disponibilizado pelo WhatsApp"}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold" htmlFor="union-contact-name">Nome salvo na Union *</label>
              <input id="union-contact-name" value={name} disabled={!canEdit}
                onChange={event=>setName(event.target.value)} maxLength={160} placeholder="Nome do contato"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"/>
            </div>
            {creating && <div>
              <label htmlFor="union-contact-phone" className="block text-xs font-semibold">WhatsApp *</label>
              <div className="mt-1 flex overflow-hidden rounded-lg border border-border">
                <span className="border-r border-border bg-muted px-3 py-2.5 text-sm font-semibold">+55</span>
                <input id="union-contact-phone" inputMode="tel" value={phone}
                  onChange={event=>setPhone(mask(event.target.value))} placeholder="(79) 98803-7605"
                  className="min-w-0 flex-1 bg-background px-3 py-2.5 text-sm outline-none"/>
              </div>
            </div>}
            {!creating && selected && <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
              <p><span className="text-muted-foreground">Nome importado por arquivo (VCF/Excel/CSV): </span>{selected.device_name||"Não importado"}</p>
              <p><span className="text-muted-foreground">Nome da agenda sincronizada: </span>{selected.imported_name||"Não disponibilizado"}</p>
              <p><span className="text-muted-foreground">Nome público do WhatsApp: </span>{selected.profile_name||"Não disponibilizado"}</p>
              <p className="text-muted-foreground">O nome salvo na Union tem prioridade. A importação não o sobrescreve.</p>
            </div>}
            <div className="flex flex-wrap gap-2">
              {canEdit && <AdminButton disabled={busy || name.trim().length<2} onClick={()=>void save()}>
                <Pencil size={15}/> {busy?"Salvando...":"Salvar contato"}
              </AdminButton>}
              {!creating && selected && <AdminButton variant="secondary"
                onClick={()=>{if(onChoose(selected))onClose();}}>Abrir conversa</AdminButton>}
            </div>
            {!creating && selected && !selected.contact_phone &&
              <p className="text-xs text-muted-foreground">Se este identificador privado ainda não tiver conversa, será preciso receber uma mensagem antes de iniciar pelo número.</p>}
          </div>}
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
