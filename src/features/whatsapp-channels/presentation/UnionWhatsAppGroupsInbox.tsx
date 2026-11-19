import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ContactRound, Info, LoaderCircle, Plus, RefreshCw, Search, Users, X } from "lucide-react";
import { operateUnionWhatsAppInbox, type UnionWhatsAppGroup } from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { UnionWhatsAppGroupsManager } from "./UnionWhatsAppGroupsManager";
import { UnionWhatsAppGroupChat } from "./UnionWhatsAppGroupChat";

const smallButton="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50";

export function UnionWhatsAppGroupsInbox({organizationId,accountPhone,canManage,canSend,onBack}:{
  organizationId:string;
  accountPhone:string;
  canManage:boolean;
  canSend:boolean;
  onBack:()=>void;
}){
  const [groups,setGroups]=useState<UnionWhatsAppGroup[]>([]);
  const [selectedJid,setSelectedJid]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const [creating,setCreating]=useState(false);
  const [infoOpen,setInfoOpen]=useState(false);
  const [notice,setNotice]=useState("");
  const [loaded,setLoaded]=useState(false);
  const selected=groups.find(group=>group.jid===selectedJid)||null;
  const filtered=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase("pt-BR");
    return !q?groups:groups.filter(group=>(group.name+" "+group.topic).toLocaleLowerCase("pt-BR").includes(q));
  },[groups,query]);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError("");
    void operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups")
      .then(result=>{
        if(cancelled)return;
        const list=result.groups||[];
        setGroups(list);
        setSelectedJid(previous=>previous&&list.some(group=>group.jid===previous)?previous:null);
        setLoaded(true);
      }).catch(reason=>{
        if(!cancelled){setError(systemErrorMessage(reason,"Não foi possível consultar os grupos deste número."));setLoaded(true);}
      }).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,accountPhone,revision]);

  useEffect(()=>{setInfoOpen(false);setNotice("");},[selectedJid]);
  const changeGroup=(jid?:string|null)=>{
    if(jid===null){setSelectedJid(null);setInfoOpen(false);setCreating(false);}
    else if(jid){setSelectedJid(jid);setCreating(false);setInfoOpen(false);}
    setRevision(v=>v+1);
  };
  const openGroup=(group:UnionWhatsAppGroup)=>{
    setCreating(false);setInfoOpen(false);setSelectedJid(group.jid);
  };
  const chatVisible=Boolean(selectedJid||creating);
  return <div className="grid h-full min-h-0 grid-cols-1 grid-rows-1 lg:grid-cols-[340px_minmax(0,1fr)]">
    <aside className={(chatVisible?"hidden lg:flex":"flex")+
      " h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-border bg-card lg:border-b-0 lg:border-r"}>
      <div className="shrink-0 border-b border-border bg-muted/35 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black text-foreground sm:text-base">Conversas</h2>
          <div className="flex gap-1.5">
            {canManage&&<button type="button" className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-bold text-primary-foreground"
              onClick={()=>{setCreating(true);setSelectedJid(null);setInfoOpen(false);}}><Plus size={14}/>Novo</button>}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {loading?"Atualizando grupos...":groups.length+" grupos deste WhatsApp"}
        </p>
        <div role="tablist" aria-label="Tipo de conversa" className="mt-3 grid grid-cols-2 gap-2">
          <button role="tab" type="button" aria-selected={false} className={smallButton+" w-full"} onClick={onBack}>
            <ContactRound size={14}/>Atendimentos
          </button>
          <button role="tab" type="button" aria-selected={true}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-2.5 text-xs font-bold text-primary">
            <Users size={14}/>Grupos <span className="text-[10px]">({groups.length})</span>
          </button>
        </div>
        <div className="relative mt-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input type="search" aria-label="Buscar conversa de grupo" value={query}
            onChange={event=>setQuery(event.target.value)}
            placeholder="Pesquisar grupo"
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"/>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading&&!groups.length&&<div role="status" className="space-y-1 px-3 py-2">
          {[0,1,2,3].map(i=><div key={i} className="flex items-center gap-3 px-2 py-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted"/>
            <div className="flex-1 space-y-2"><div className="h-3 w-2/3 animate-pulse rounded bg-muted"/>
              <div className="h-2 w-5/6 animate-pulse rounded bg-muted"/></div>
          </div>)}
        </div>}
        {error&&<div role="alert" className="space-y-3 p-5 text-xs text-destructive">
          <p>{error}</p>
          <button type="button" className={smallButton} onClick={()=>setRevision(v=>v+1)}>Tentar novamente</button>
        </div>}
        {!loading&&!error&&loaded&&!filtered.length&&<div className="flex flex-col items-center gap-2 p-8 text-center text-xs text-muted-foreground">
          <Users size={28}/>
          <p>{query?"Nenhum grupo corresponde à busca.":"Nenhum grupo disponível neste WhatsApp."}</p>
        </div>}
        {filtered.map(group=>{
          const active=group.jid===selectedJid;
          return <button key={group.jid} type="button" onClick={()=>openGroup(group)}
            aria-current={active?"true":undefined}
            className={"box-border flex w-full min-w-0 items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors "+
              (active?"border-l-[3px] border-l-primary bg-primary-soft":"bg-card hover:bg-muted/55")}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users size={21}/>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-black text-foreground">{group.name}</span>
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {group.topic||"Grupo do WhatsApp"}
              </span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                {group.participants_count} participantes{group.is_announce?" · Somente administradores enviam":""}
              </span>
            </span>
          </button>;
        })}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">{filtered.length} de {groups.length} grupos</span>
        <button type="button" className={smallButton} disabled={loading} onClick={()=>setRevision(v=>v+1)}
          title="Atualizar a lista de grupos" aria-label="Atualizar grupos">
          {loading?<LoaderCircle size={15} className="animate-spin"/>:<RefreshCw size={15}/>}
        </button>
      </footer>
    </aside>
    <section className={(chatVisible?"fixed inset-x-0 bottom-0 top-[var(--admin-shell-header-height,4rem)] z-[45] flex w-full lg:relative lg:inset-auto lg:h-auto":"hidden lg:relative lg:flex")+
      " min-h-0 min-w-0 flex-col overflow-hidden bg-card"}>
      {creating?<div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-3">
          <button type="button" className="rounded-full p-1 hover:bg-muted" aria-label="Voltar à lista de grupos"
            onClick={()=>setCreating(false)}><ChevronLeft size={23}/></button>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Users size={20}/></span>
          <h3 className="text-sm font-black">Novo grupo</h3>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-lg">
            <UnionWhatsAppGroupsManager group={null} creating={true} canManage={canManage} canSend={canSend}
              organizationId={organizationId} accountPhone={accountPhone}
              onCancelCreate={()=>setCreating(false)} onChanged={changeGroup} hideChat/>
          </div>
        </div>
      </div>:selected?<div className="relative flex h-full min-h-0 flex-col">
        <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-2 py-2 lg:gap-3 lg:px-4">
          <button type="button" aria-label="Voltar à lista de grupos" title="Voltar"
            className="flex h-10 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted lg:hidden"
            onClick={()=>{setSelectedJid(null);setInfoOpen(false);}}><ChevronLeft size={24}/></button>
          <button type="button" aria-label="Informações do grupo" className="shrink-0"
            onClick={()=>setInfoOpen(true)}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users size={22}/>
            </span>
          </button>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={()=>setInfoOpen(true)}>
            <span className="block truncate text-sm font-black text-foreground">{selected.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {selected.participants_count} participantes
            </span>
          </button>
          <button type="button" aria-label="Dados do grupo" title="Dados do grupo"
            className={smallButton} onClick={()=>setInfoOpen(true)}><Info size={17}/><span className="hidden sm:inline">Dados do grupo</span></button>
        </header>
        {notice&&<p role="status" className="border-b border-border px-4 py-2 text-xs text-primary">{notice}</p>}
        <UnionWhatsAppGroupChat key={selected.jid} layout="conversation"
          organizationId={organizationId} accountPhone={accountPhone}
          groupJid={selected.jid} canSend={canSend}/>
        {infoOpen&&<div className="absolute inset-0 z-20 flex justify-end bg-black/35"
          onClick={event=>{if(event.target===event.currentTarget)setInfoOpen(false);}}>
          <div role="dialog" aria-modal="true" aria-label="Dados do grupo"
            className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-card shadow-xl">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="text-sm font-black">Dados do grupo</h3>
              <button className="rounded-lg p-2 hover:bg-muted" aria-label="Fechar dados do grupo"
                onClick={()=>setInfoOpen(false)}><X size={19}/></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <UnionWhatsAppGroupsManager key={selected.jid} group={selected} creating={false}
                canManage={canManage} canSend={canSend} hideChat
                organizationId={organizationId} accountPhone={accountPhone}
                onChanged={changeGroup} onCancelCreate={()=>setInfoOpen(false)}/>
            </div>
          </div>
        </div>}
      </div>:<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <Users size={34}/><p>Selecione um grupo para abrir a conversa.</p>
        <p className="max-w-sm text-xs">As mensagens e as informações do grupo ficam separadas, como nas conversas individuais.</p>
      </div>}
    </section>
  </div>;
}
