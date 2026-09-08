import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FSelect } from "@/shared/ui/admin/AdminFormControls";
import { listOrganizationModules, listPartnerShares, listSystemModules, setOrganizationModuleEnabled, setPartnerDataShare, type PartnerShareAccessLevel } from "../infrastructure/partner-companies.repository";

const SAFE_PARTNER_MODULES = new Set(["customers","orders","inventory","equipment","services","service_types","order_situations","order_statuses","documents","employees"]);
const SHARE_RESOURCES = [
  { key:"customers" as const, label:"Clientes", description:"Cadastros, contatos e endereços dos clientes." },
  { key:"orders" as const, label:"Ordens de Serviço e Operação", description:"OS, histórico, documentos, SLA e fluxo operacional." },
  { key:"inventory" as const, label:"Estoque", description:"Itens, saldos, movimentações e fluxo de peças." },
];
const ACCESS_OPTIONS=[{value:"none",label:"Nenhum acesso"},{value:"summary",label:"Somente resumo"},{value:"read",label:"Leitura"},{value:"manage",label:"Gerenciar"}];
const ACCESS_HELP:Record<PartnerShareAccessLevel,string>={none:"A ArtVideo não recebe acesso a este recurso.",summary:"Somente indicadores e resumos compatíveis; registros detalhados continuam bloqueados.",read:"Consulta dos registros detalhados, sem alterações operacionais.",manage:"Consulta e ações permitidas também pelas permissões efetivas da ArtVideo."};

export function PartnerCompanyPermissionsSection({ organizationId }: { organizationId:string }) {
  const { user,hasPermission }=useAuth();
  const queryClient=useQueryClient();
  const [toast,setToast]=useState<{msg:string;type:"success"|"error"}|null>(null);
  const canManageModules=hasPermission("organizations.modules.manage");
  const canManageShares=hasPermission("organizations.data_shares.manage");
  const modulesQuery=useQuery({queryKey:["partner-companies","modules",organizationId],queryFn:async()=>{const [{data:systemModules,error:systemError},{data:organizationModules,error:organizationError}]=await Promise.all([listSystemModules(),listOrganizationModules(organizationId)]);if(systemError||organizationError)throw systemError||organizationError;return{systemModules:(systemModules||[]).filter((m:any)=>SAFE_PARTNER_MODULES.has(m.key)),organizationModules:organizationModules||[]};}});
  const sharesQuery=useQuery({queryKey:["partner-companies","shares",organizationId],queryFn:async()=>{const{data,error}=await listPartnerShares(organizationId);if(error)throw error;return data||[];}});
  const enabledByKey=useMemo(()=>new Map((modulesQuery.data?.organizationModules||[]).map((i:any)=>[i.module_key,i.is_enabled===true])),[modulesQuery.data]);
  const shareByKey=useMemo(()=>new Map((sharesQuery.data||[]).map((i:any)=>[i.resource_key,i.access_level as PartnerShareAccessLevel])),[sharesQuery.data]);
  const toggleMutation=useMutation({mutationFn:async({key,enabled}:{key:string;enabled:boolean})=>{const{error}=await setOrganizationModuleEnabled(organizationId,key,enabled,user?.id);if(error)throw error;},onSuccess:()=>{void queryClient.invalidateQueries({queryKey:["partner-companies","modules",organizationId]});setToast({msg:"Módulo atualizado.",type:"success"});},onError:(e:any)=>setToast({msg:`Não foi possível atualizar o módulo: ${e?.message||"Erro desconhecido"}`,type:"error"})});
  const shareMutation=useMutation({mutationFn:async({resourceKey,accessLevel}:{resourceKey:"customers"|"orders"|"inventory";accessLevel:PartnerShareAccessLevel})=>{const{error}=await setPartnerDataShare(organizationId,resourceKey,accessLevel);if(error)throw error;},onSuccess:()=>{void queryClient.invalidateQueries({queryKey:["partner-companies","shares",organizationId]});setToast({msg:"Compartilhamento atualizado.",type:"success"});},onError:(e:any)=>setToast({msg:`Não foi possível atualizar o compartilhamento: ${e?.message||"Erro desconhecido"}`,type:"error"})});
  const busy=toggleMutation.isPending||shareMutation.isPending;

  return <div className="space-y-4">
    {toast&&<Toast message={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>} 
    <AdminCard>
      <AdminCardHeader><div className="flex items-start gap-2"><KeyRound size={17} className="mt-0.5 text-[#0057e7]"/><div><h3 className="text-sm font-black text-[#0d1b2e]">Módulos disponíveis</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Define quais áreas esta empresa pode utilizar.</p></div></div></AdminCardHeader>
      <AdminCardContent>{modulesQuery.isPending?<LoadingState/>:modulesQuery.isError?<p className="text-sm font-semibold text-red-700">{(modulesQuery.error as any)?.message||"Não foi possível carregar os módulos."}</p>:<div className="grid gap-2 sm:grid-cols-2">{(modulesQuery.data?.systemModules||[]).map((module:any)=>{const enabled=enabledByKey.get(module.key)===true;return <button key={module.key} type="button" disabled={!canManageModules||busy} onClick={()=>toggleMutation.mutate({key:module.key,enabled:!enabled})} className="flex items-center justify-between rounded-xl border border-[#d9e1ec] px-3 py-3 text-left transition-colors hover:border-[#0057e7]/40 disabled:opacity-60"><div className="pr-3"><p className="text-sm font-bold text-[#0d1b2e]">{module.name}</p><p className="mt-0.5 text-xs text-[#5a6a82]">{module.description}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${enabled?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{enabled?"Ativo":"Bloqueado"}</span></button>;})}</div>}</AdminCardContent>
    </AdminCard>

    <AdminCard>
      <AdminCardHeader><div className="flex items-start gap-2"><ShieldCheck size={17} className="mt-0.5 text-[#0057e7]"/><div><h3 className="text-sm font-black text-[#0d1b2e]">Dados compartilhados com a ArtVideo</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Configuração independente dos módulos liberados para a empresa.</p></div></div></AdminCardHeader>
      <AdminCardContent>{sharesQuery.isPending?<LoadingState/>:sharesQuery.isError?<p className="text-sm font-semibold text-red-700">{(sharesQuery.error as any)?.message||"Não foi possível carregar os compartilhamentos."}</p>:<div className="space-y-3">{SHARE_RESOURCES.map(resource=>{const level=shareByKey.get(resource.key)||"none";return <div key={resource.key} className="rounded-xl border border-[#d9e1ec] p-4"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center"><div><div className="flex items-center gap-2"><Database size={15} className="text-[#0057e7]"/><p className="text-sm font-black text-[#0d1b2e]">{resource.label}</p></div><p className="mt-1 text-xs text-[#5a6a82]">{resource.description}</p></div><FSelect label="Acesso da ArtVideo" value={level} options={ACCESS_OPTIONS} disabled={!canManageShares||busy} onChange={(e:any)=>shareMutation.mutate({resourceKey:resource.key,accessLevel:e.target.value as PartnerShareAccessLevel})}/></div><div className="mt-3 rounded-lg bg-[#f6f8fb] px-3 py-2 text-xs text-[#5a6a82]">{ACCESS_HELP[level]}</div></div>;})}</div>}</AdminCardContent>
    </AdminCard>
  </div>;
}
