import { lazy, Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { AdminDialog } from "@/shared/ui/admin/AdminLayout";
import type { UnionPbxSection } from "./UnionPbxSectionTabs";

const Extensions = lazy(()=>import("./UnionPbxExtensionsPage").then(m=>({default:m.UnionPbxExtensionsPage})));
const Queues = lazy(()=>import("./UnionPbxQueuesPage").then(m=>({default:m.UnionPbxQueuesPage})));
const Flows = lazy(()=>import("./UnionPbxFlowsPage").then(m=>({default:m.UnionPbxFlowsPage})));
const Inbound = lazy(()=>import("./UnionPbxInboundPage").then(m=>({default:m.UnionPbxInboundPage})));
const Trunks = lazy(()=>import("./UnionPbxTrunksPage").then(m=>({default:m.UnionPbxTrunksPage})));
const Recordings = lazy(()=>import("./UnionPbxRecordingsPage").then(m=>({default:m.UnionPbxRecordingsPage})));
const History = lazy(()=>import("./UnionPbxHistoryPage").then(m=>({default:m.UnionPbxHistoryPage})));

const sectionTitles:Record<UnionPbxSection,string>={
  telefone:"Chamadas",ramais:"Ramais",filas:"Filas",fluxos:"URA e horários",
  troncos:"Troncos SIP",entrada:"Entrada de chamadas",
  historico:"Histórico de chamadas",gravacoes:"Gravações",
};
export function UnionPbxSettingsDialog({
  section,onClose,canManage,canRecordings,canManageInbound,organizationKey,
}:{
  section:UnionPbxSection|null;onClose:()=>void;canManage:boolean;
  canRecordings:boolean;canManageInbound:boolean;organizationKey:string;
}){
  const authorized=section==="historico"||
    section==="gravacoes"&&canRecordings||
    (section==="entrada"?canManageInbound:section==="ramais"||section==="filas"||
      section==="fluxos"||section==="troncos")&&canManage;
  return <AdminDialog open={Boolean(section)} onClose={onClose}
    title={section?sectionTitles[section]:"Configurações PABX"}
    className="!w-[calc(100vw-1.5rem)] !max-w-[1100px]" bodyClassName="!p-4 sm:!p-5"
    minimizable={false}>
    {authorized&&section?<Suspense fallback={<div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-primary">
      <LoaderCircle size={20} className="animate-spin"/> Preparando configurações...
    </div>}>
      {section==="ramais"?<Extensions key={organizationKey} onBack={onClose}/>:
       section==="filas"?<Queues key={organizationKey} onBack={onClose}/>:
       section==="fluxos"?<Flows key={organizationKey} onBack={onClose}/>:
       section==="troncos"?<Trunks key={organizationKey} onBack={onClose}/>:
       section==="entrada"?<Inbound key={organizationKey} onBack={onClose}/>:
       section==="gravacoes"?<Recordings key={organizationKey} onBack={onClose}/>:
       section==="historico"?<History key={organizationKey} onBack={onClose}/>:null}
    </Suspense>:<p className="p-5 text-sm text-muted-foreground">Sem permissão para acessar esta configuração.</p>}
  </AdminDialog>;
}
