import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft, Building2, CircleHelp, Link2, ListFilter, MessageSquareText,
  Plus, Settings2, ShieldCheck, UsersRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { WhatsAppChannelsPage } from "./WhatsAppChannelsPage";
import { WhatsAppOperationsSettings } from "./WhatsAppOperationsSettings";
import { WhatsAppRolePermissions } from "./WhatsAppRolePermissions";
import { WhatsAppQuickRepliesSettings } from "./WhatsAppQuickRepliesSettings";

// Dedicated route: /admin/tools/union-whatsapp/configuracoes.
// The gear opens this menu over the existing Atendimentos conversation.
// Every option is a modal, never a redirect to Canais de Atendimento.
export type AttendanceSettingsSection =
  "configuration"|"connections"|"departments"|"queues"|"operators"|"permissions"|"quick-replies";

const sections = [
  {id:"configuration",title:"Configuração do canal",description:"Ativação, conexão e recebimento em etapas.",icon:Settings2},
  {id:"connections",title:"Conexões",description:"Números, sessões e QR Code do WhatsApp.",icon:Link2},
  {id:"departments",title:"Departamentos",description:"Organize equipes e setores.",icon:Building2},
  {id:"queues",title:"Filas",description:"Entrada, distribuição e prioridades.",icon:ListFilter},
  {id:"operators",title:"Operadores",description:"Vínculos e funções de cada funcionário.",icon:UsersRound},
  {id:"permissions",title:"Perfis e permissões",description:"Ações autorizadas em cada perfil de atendimento.",icon:ShieldCheck},
  {id:"quick-replies",title:"Mensagens rápidas",description:"Respostas com variáveis e saudações automáticas.",icon:MessageSquareText},
] as const;

const isSection=(value:string|null):value is AttendanceSettingsSection=>
  Boolean(value && sections.some(item=>item.id===value));

export function WhatsAppAttendanceSettings({
  open,onClose,initialSection,
}: {
  open:boolean;onClose:()=>void;initialSection?:string|null;
}) {
  const {activeOrganizationId,hasPermission}=useAuth();
  const canManage=hasPermission("settings.channels.manage");
  const canView=hasPermission("settings.channels.view") || canManage ||
    hasPermission("settings.channels.delete");
  const [section,setSection]=useState<AttendanceSettingsSection|null>(
    isSection(initialSection||null)?initialSection as AttendanceSettingsSection:null,
  );
  // Opening connections from channel configuration must return to that step,
  // while opening connections directly from the gear returns to the menu.
  const [sectionTrail,setSectionTrail]=useState<AttendanceSettingsSection[]>([]);
  const [createRequest,setCreateRequest]=useState(0);
  const [canCreateConnection,setCanCreateConnection]=useState(false);
  const [canCreateDepartment,setCanCreateDepartment]=useState(false);
  const [footerTarget,setFooterTarget]=useState<HTMLDivElement|null>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const [menuPosition,setMenuPosition]=useState({top:80,left:12,width:300});

  const openSection=(next:AttendanceSettingsSection)=>{
    if(section===next)return;
    setSectionTrail(current=>section?[...current,section]:[]);
    setCanCreateConnection(false);
    setCanCreateDepartment(false);
    setSection(next);
  };
  const backToPrevious=()=>{
    setCanCreateConnection(false);
    setCanCreateDepartment(false);
    if(sectionTrail.length){
      setSection(sectionTrail[sectionTrail.length-1]);
      setSectionTrail(previous=>previous.slice(0,-1));
    }else{
      setSection(null);
    }
  };
  useEffect(()=>{
    if(open){
      setSection(isSection(initialSection||null)?initialSection as AttendanceSettingsSection:null);
      setSectionTrail([]);
    }
  },[activeOrganizationId,open,initialSection]);

  // Keep the dropdown physically aligned with the settings button on the inbox.
  // It is not a dialog: clicking outside or pressing Escape closes it entirely.
  useLayoutEffect(()=>{
    if(!open || section || !canView)return;
    const place=()=>{
      const anchor=document.querySelector<HTMLElement>("[data-whatsapp-attendance-settings-trigger]");
      const rect=anchor?.getBoundingClientRect();
      const width=Math.min(320,Math.max(200,window.innerWidth-24));
      const left=rect
        ? Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))
        : Math.max(12,window.innerWidth-width-20);
      const below=rect ? window.innerHeight-rect.bottom : window.innerHeight-80;
      const top=rect
        ? (below<332 && rect.top>below ? Math.max(12,rect.top-324) : rect.bottom+8)
        : 80;
      setMenuPosition(previous=>previous.top===top && previous.left===left && previous.width===width
        ? previous : {top,left,width});
    };
    place();
    window.addEventListener("resize",place);
    window.addEventListener("scroll",place,true);
    return()=>{
      window.removeEventListener("resize",place);
      window.removeEventListener("scroll",place,true);
    };
  },[open,section,canView]);

  useEffect(()=>{
    if(!open || section || !canView)return;
    const onPointerDown=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(menuRef.current?.contains(target))return;
      const anchor=document.querySelector<HTMLElement>("[data-whatsapp-attendance-settings-trigger]");
      // The gear toggles its own route; do not race that click.
      if(anchor?.contains(target))return;
      onClose();
    };
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();onClose();}
    };
    document.addEventListener("pointerdown",onPointerDown,true);
    document.addEventListener("keydown",onKeyDown);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});
    return()=>{
      document.removeEventListener("pointerdown",onPointerDown,true);
      document.removeEventListener("keydown",onKeyDown);
    };
  },[open,section,canView,onClose]);

  if(!open)return null;
  if(!canView)return <AdminDialog open onClose={onClose} title="Configurações dos Atendimentos">
    <p className="p-4 text-sm text-muted-foreground">Seu perfil não possui permissão para configurar os atendimentos desta empresa.</p>
  </AdminDialog>;

  const available=sections.filter(item=>canManage ||
    item.id==="configuration"||item.id==="connections"||item.id==="quick-replies");
  const active=sections.find(item=>item.id===section);

  return <>
    {!section && <div ref={menuRef} role="menu" aria-label="Configurações dos Atendimentos"
      className="admin-crm fixed z-[200] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
      style={{top:menuPosition.top,left:menuPosition.left,width:menuPosition.width,
        maxHeight:"calc(100dvh - " + (menuPosition.top+12) + "px)"}}>
      {available.map((item,index)=><div key={item.id}>
        {index===5 && <div className="mx-2 my-1 h-px bg-border"/>}
        <button type="button" role="menuitem" onClick={()=>openSection(item.id)}
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted">
          <item.icon size={17} className="shrink-0 text-muted-foreground"/>
          <span className="min-w-0 flex-1">{item.title}</span>
        </button>
      </div>)}
      {!canManage && <p className="mx-2 mt-1 flex gap-2 border-t border-border px-1 py-2 text-[11px] leading-4 text-muted-foreground">
        <CircleHelp size={14} className="shrink-0"/>
        Outras opções exigem permissão para configurar atendimentos.
      </p>}
    </div>}

    <AdminDialog open={Boolean(section)} onClose={onClose}
      title={active?.title||"Configurações"}
      description={active?.description}
      className="w-full max-w-5xl"
      bodyClassName="min-h-0 max-h-[76dvh] overflow-y-auto"
      footer={<div className="flex w-full flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton variant="secondary" onClick={backToPrevious}>
            <ArrowLeft size={16}/> Voltar
          </AdminButton>
          {section==="connections" && canManage && <AdminButton
            disabled={!canCreateConnection} onClick={()=>setCreateRequest(value=>value+1)}>
            <Plus size={16}/> Nova conexão
          </AdminButton>}
          {(section==="departments" || section==="queues") && canManage && <AdminButton
            disabled={!canCreateDepartment} onClick={()=>setCreateRequest(value=>value+1)}>
            <Plus size={16}/> Novo departamento
          </AdminButton>}
          {section==="quick-replies" && canManage && <AdminButton
            onClick={()=>setCreateRequest(value=>value+1)}>
            <Plus size={16}/> Nova mensagem
          </AdminButton>}
        </div>
        {(section==="permissions" || section==="queues") &&
          <div ref={setFooterTarget} className="flex flex-wrap items-center justify-end gap-2"/>}
      </div>}>
      {section && <div className="min-w-0 space-y-4">
        {(section==="configuration"||section==="connections") ?
          <WhatsAppChannelsPage
            key={activeOrganizationId+":"+section}
            initialSection={section} embeddedSection={section}
            createConnectionRequest={createRequest}
            onCanCreateChange={setCanCreateConnection}
            onSectionChange={next=>{if(isSection(next))openSection(next);}}
            onBack={backToPrevious}/>
          : section==="departments" || section==="queues" || section==="operators"
            ? <WhatsAppOperationsSettings key={activeOrganizationId+":"+section} section={section}
                createRequest={createRequest} onCanCreateChange={setCanCreateDepartment}
                footerTarget={footerTarget}/>
            : section==="permissions" ? <WhatsAppRolePermissions footerTarget={footerTarget} footerInParent/>
            : <WhatsAppQuickRepliesSettings createRequest={createRequest} embedded/>}
      </div>}
    </AdminDialog>
  </>;
}
