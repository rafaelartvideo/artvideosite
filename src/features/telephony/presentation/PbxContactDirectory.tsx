import { useEffect, useState } from "react";
import { ContactRound, LoaderCircle, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPbxNumber } from "../domain/pbx-display";
import { pbxContactPhoneKey } from "../application/pbx-saved-contact-cards";

export type PbxDirectoryContact = { number: string; name: string; source: "crm" | "pbx" | "whatsapp" | "ramal" };
const sourceText: Record<PbxDirectoryContact["source"],string> = {
  crm: "CRM", pbx: "PABX", whatsapp: "WhatsApp", ramal: "Ramal",
};
export function PbxContactDirectory({
  organizationId, active, revision, extensions, onSelect, onNew,
}: {
  organizationId:string|null;active:boolean;revision:number;
  extensions:{number:number;display_name:string}[];
  onSelect:(contact:PbxDirectoryContact)=>void;onNew:()=>void;
}) {
  const [search,setSearch]=useState("");
  const [debounced,setDebounced]=useState("");
  const [contacts,setContacts]=useState<PbxDirectoryContact[]>([]);
  const [loading,setLoading]=useState(false);
  const [readyOrganization,setReadyOrganization]=useState<string|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    const timer=setTimeout(()=>setDebounced(search.trim()),400);
    return ()=>clearTimeout(timer);
  },[search]);
  useEffect(()=>{
    const controller=new AbortController();
    if(!organizationId||!active)return()=>controller.abort();
    if(readyOrganization!==organizationId)setLoading(true);
    setError("");
    void supabase.functions.invoke<{success?:boolean;contacts?:PbxDirectoryContact[]}>("union-pbx-contact-cards",{
      body:{action:"list",organization_id:organizationId,search:debounced},signal:controller.signal,
    }).then(({data,error:requestError})=>{
      if(controller.signal.aborted)return;
      if(requestError||!data?.success||!Array.isArray(data.contacts))throw Error("Falha ao consultar a agenda.");
      setContacts(data.contacts);
    }).catch(()=>{
      if(!controller.signal.aborted)setError("Não foi possível consultar a agenda telefônica.");
    }).finally(()=>{if(!controller.signal.aborted){setLoading(false);setReadyOrganization(organizationId);}});
    return ()=>controller.abort();
  },[organizationId,active,debounced,revision]);
  const normalizedSearch=search.trim().toLowerCase();
  const visibleExtensions=extensions.filter(item=>!normalizedSearch||
    item.display_name.toLowerCase().includes(normalizedSearch)||String(item.number).includes(normalizedSearch));
  const seen=new Set(visibleExtensions.map(item=>String(item.number)));
  const all=[
    ...visibleExtensions.map(item=>({number:String(item.number),name:item.display_name,source:"ramal" as const})),
    ...contacts.filter(item=>{
      const key=pbxContactPhoneKey(item.number);
      if(!key||seen.has(key))return false;
      seen.add(key);return true;
    }),
  ];
  if (organizationId && active && readyOrganization !== organizationId) {
    return <div role="status" className="flex min-h-[350px] flex-1 flex-col items-center justify-center gap-3 text-sm font-medium text-primary">
      <LoaderCircle size={28} className="animate-spin"/>
      Preparando agenda...
    </div>;
  }
  return <div className="mt-4 flex-1 space-y-3">
    <div className="flex flex-wrap gap-2">
      <label className="relative min-w-[175px] flex-1">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
        <input type="search" autoComplete="off" value={search} onChange={event=>setSearch(event.target.value)}
          placeholder="Buscar nome ou telefone" aria-label="Buscar contatos"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-2 text-sm outline-none focus:border-primary"/>
      </label>
      <button type="button" onClick={onNew} title="Salvar novo contato"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
        <Plus size={16}/> Novo contato
      </button>
    </div>
    <p className="text-[11px] text-muted-foreground">CRM em primeiro lugar · agenda PABX e contatos do WhatsApp, sem duplicações</p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="max-h-[530px] space-y-1 overflow-y-auto">
      {all.map(contact=><button type="button" key={contact.source+":"+contact.number}
        onClick={()=>onSelect(contact)}
        className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-muted/60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ContactRound size={17}/></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{contact.name}</span>
          <span className="block text-xs text-muted-foreground">{formatPbxNumber(contact.number)}</span></span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{sourceText[contact.source]}</span>
      </button>)}
      {!all.length&&<p className="py-8 text-center text-sm text-muted-foreground">Nenhum contato encontrado. Você pode salvar um novo número no PABX.</p>}
    </div>
    {all.length>=100&&<p className="text-[11px] text-muted-foreground">Exibindo os contatos mais recentes. Use a busca para localizar outros.</p>}
  </div>;
}
