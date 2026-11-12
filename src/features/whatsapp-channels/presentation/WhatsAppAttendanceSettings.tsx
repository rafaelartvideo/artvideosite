import { useEffect, useState } from "react";
import {
  Building2, ChevronRight, CircleHelp, Link2, ListFilter, MessageSquareText,
  Settings2, ShieldCheck, UsersRound,
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
  // Preserve the route inside the settings modal so "Gerenciar conexões"
  // returns to Configuração do canal, not to the top-level settings menu.
  const [sectionTrail,setSectionTrail]=useState<AttendanceSettingsSection[]>([]);
  const openSection=(next:AttendanceSettingsSection)=>{
    if(section===next)return;
    setSectionTrail(current=>section?[...current,section]:[]);
    setSection(next);
  };
  const backToPrevious=()=>{
    if(sectionTrail.length){
      setSection(sectionTrail[sectionTrail.length-1]);
      setSectionTrail(previous=>previous.slice(0,-1));
    }else setSection(null);
  };
  useEffect(()=>{
    if(open){setSection(isSection(initialSection||null)?initialSection as AttendanceSettingsSection:null);setSectionTrail([]);}
  },[activeOrganizationId,open,initialSection]);

  if(!open)return null;
  if(!canView)return <AdminDialog open onClose={onClose} title="Configurações dos Atendimentos">
    <p className="p-4 text-sm text-muted-foreground">Seu perfil não possui permissão para configurar os atendimentos desta empresa.</p>
  </AdminDialog>;

  const available=sections.filter(item=>canManage ||
    item.id==="configuration"||item.id==="connections"||item.id==="quick-replies");
  const active=sections.find(item=>item.id===section);
  return <>
    <AdminDialog open={!section} onClose={onClose}
      title="Configurações dos Atendimentos"
      description="Escolha o que deseja configurar. Cada área será aberta em um modal próprio."
      className="w-full max-w-xl"
      bodyClassName="max-h-[70dvh] overflow-y-auto">
      <nav aria-label="Opções de configuração dos Atendimentos" className="space-y-2 p-1">
        {available.map(item=><button key={item.id} type="button" onClick={()=>openSection(item.id)}
          className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <item.icon size={19}/>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{item.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-muted-foreground"/>
        </button>)}
        {!canManage && <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
          <CircleHelp size={15}/> Outras configurações exigem a permissão Configurar Atendimentos.
        </p>}
      </nav>
    </AdminDialog>
    <AdminDialog open={Boolean(section)} onClose={backToPrevious}
      title={active?.title||"Configurações"}
      description={active?.description}
      className="w-full max-w-5xl"
      bodyClassName="min-h-0 max-h-[76dvh] overflow-y-auto"
      footer={<div className="flex justify-start">
        <AdminButton variant="secondary" onClick={backToPrevious}>
          {sectionTrail.length ? "Voltar para " + (sections.find(item=>item.id===sectionTrail[sectionTrail.length-1])?.title||"configuração")
            : "Voltar às opções"}
        </AdminButton>
      </div>}>
      {section && <div className="min-w-0 space-y-4">
        {(section==="configuration"||section==="connections") ?
          <WhatsAppChannelsPage
            key={activeOrganizationId+":"+section}
            initialSection={section} embeddedSection={section}
            onSectionChange={next=>{if(isSection(next))openSection(next);}}
            onBack={backToPrevious}/>
          : section==="departments" || section==="queues" || section==="operators"
            ? <WhatsAppOperationsSettings key={activeOrganizationId+":"+section} section={section}/>
            : section==="permissions" ? <WhatsAppRolePermissions/>
            : <WhatsAppQuickRepliesSettings/>}
      </div>}
    </AdminDialog>
  </>;
}
