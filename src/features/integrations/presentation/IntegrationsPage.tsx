import { useState } from "react";
import { MessageCircle, ArrowRight, Settings2 } from "lucide-react";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { SacDigitalSettingsPage } from "@/features/sac-digital/presentation/SacDigitalSettingsPage";

export function IntegrationsPage({onBack}:{onBack:()=>void}) {
 const [selected,setSelected]=useState<"sac"|null>(null);
 if(selected==="sac")return <SacDigitalSettingsPage onBack={()=>setSelected(null)}/>;
 return <div className="space-y-5">
  <PageHeader title="Integrações" subtitle="Configure e gerencie serviços conectados à empresa."/>
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
   <button type="button" onClick={()=>setSelected("sac")}
     className="group flex min-h-[155px] items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-blue-400 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-blue-500">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><MessageCircle size={23}/></span>
    <span className="min-w-0 flex-1">
     <strong className="text-base font-semibold">SAC Digital</strong>
     <span className="mt-2 block text-sm leading-6 text-muted-foreground">Conta e conexão, operadores, mensagens para OS e orçamentos, webhooks e menus personalizados.</span>
     <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">Configurar SAC Digital <ArrowRight size={15}/></span>
    </span>
   </button>
  </div>
 </div>;
}
