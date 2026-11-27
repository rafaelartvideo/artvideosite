import { useEffect,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft,ChevronRight,Loader2,ShieldCheck,ExternalLink } from "lucide-react";
import { listRoles,listPermissions,getRolePermissionIds,saveRolePermissions } from "@/features/roles/infrastructure/roles.repository";
import { type PermissionRecord } from "@/features/employees/domain/permission-taxonomy";
type Role={id:string;name:string;is_active:boolean};
export function ChatRoleSettings({org,canManage,onOpenFull,onBack}:{org:string;canManage:boolean;onOpenFull:()=>void;onBack:()=>void}){
 const [role,setRole]=useState<Role|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const catalog=useQuery({queryKey:["chat-role-catalog",org],queryFn:async()=>{
  const [r,p]=await Promise.all([listRoles(org),listPermissions(org)]);if(r.error||p.error)throw r.error||p.error;
  return {roles:((r.data??[]) as Role[]).filter(x=>x.is_active),permissions:((p.data??[]) as PermissionRecord[]).filter(x=>x.key.startsWith("internal_chat."))};
 },staleTime:60000,retry:false});
 const grants=useQuery({queryKey:["chat-role-grants",org,role?.id],enabled:!!role,queryFn:async()=>{
  const r=await getRolePermissionIds(role!.id);if(r.error)throw r.error;return (r.data??[]).map(x=>x.permission_id as string);
 },staleTime:0,retry:false});
 useEffect(()=>{if(grants.data&&role)setSelected(grants.data);},[grants.data,role?.id]);
 const perms=catalog.data?.permissions??[];
 const access=perms.find(p=>p.key==="internal_chat.use");
 function toggle(p:PermissionRecord){if(!canManage||saving||!grants.isSuccess)return;setSelected(old=>{
  if(old.includes(p.id))return old.filter(id=>id!==p.id&&(p.key!=="internal_chat.use"||!perms.some(x=>x.id===id)));
  return [...new Set([...old,p.id,...(access&&p.id!==access.id?[access.id]:[])])];
 });}
 async function save(){
  if(!role||!canManage||saving||!grants.isSuccess||!perms.length)return;
  setSaving(true);setError("");try{
   const visible=perms.map(p=>p.id);const r=await saveRolePermissions(role.id,selected.filter(id=>visible.includes(id)),visible);
   if(r.error)throw r.error;await grants.refetch();setRole(null);
  }catch{setError("Não foi possível salvar as permissões. Confira o acesso e tente novamente.");}finally{setSaving(false);}
 }
 return <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
  <div className="mb-2 flex items-center gap-2"><button type="button" title="Voltar" className="rounded-md p-1 hover:bg-muted" onClick={()=>role?setRole(null):onBack()}><ChevronLeft size={16}/></button><span className="flex-1 text-xs font-semibold">{role?role.name:"Perfis e permissões"}</span><button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted" title="Abrir Funções e Permissões do CRM" onClick={onOpenFull}><ExternalLink size={15}/></button></div>
  {error&&<p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}
  {catalog.isPending||role&&grants.isPending?<div className="grid min-h-36 place-items-center" role="status" aria-label="Carregando permissões"><Loader2 className="animate-spin text-primary" size={22}/></div>:catalog.isError||role&&grants.isError?<p className="p-3 text-center text-xs text-destructive">Não foi possível carregar as permissões.</p>:!perms.length?<p className="p-3 text-center text-xs text-muted-foreground">Nenhuma permissão do chat disponível no catálogo desta empresa.</p>:!role?<><p className="mb-2 text-xs text-muted-foreground">Selecione um perfil cadastrado na empresa.</p>{catalog.data?.roles.map(r=><button key={r.id} type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs hover:bg-muted" onClick={()=>{setError("");setSelected([]);setRole(r);}}><ShieldCheck size={16} className="text-muted-foreground"/><span className="flex-1 font-semibold">{r.name}</span><ChevronRight size={15}/></button>)}</>:<>
  <p className="mb-2 text-xs text-muted-foreground">Permissões do perfil no chat. As permissões dos outros módulos são preservadas.</p>
  {perms.map(p=><label key={p.id} className="flex items-start gap-2 border-b border-border py-2 text-xs"><input className="mt-0.5 accent-primary" type="checkbox" checked={selected.includes(p.id)} disabled={!canManage||saving||!grants.isSuccess} onChange={()=>toggle(p)}/><span className="flex-1"><span className="block font-medium">{p.label??p.key}</span>{p.description&&<span className="block text-[11px] text-muted-foreground">{p.description}</span>}</span></label>)}
  {canManage&&<button type="button" disabled={saving||!grants.isSuccess} className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50" onClick={()=>void save()}>{saving?"Salvando…":"Salvar permissões"}</button>}
  <p className="mt-3 text-[11px] text-muted-foreground">Exceções individuais continuam em Funções e Permissões do CRM.</p>
 </>}
 </div>;
}
