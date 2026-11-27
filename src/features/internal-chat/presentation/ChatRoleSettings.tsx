import { useEffect,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ChevronLeft,ChevronRight,Loader2,ShieldCheck,ExternalLink } from "lucide-react";
import { listRoles,listPermissions,getRolePermissionIds,saveRolePermissions } from "@/features/roles/infrastructure/roles.repository";
import { type PermissionRecord } from "@/features/employees/domain/permission-taxonomy";
type Role={id:string;name:string;is_active:boolean};
function CRMRoleSettings({org,canManage,onOpenFull,onBack}:{org:string;canManage:boolean;onOpenFull:()=>void;onBack:()=>void}){
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

type ChatProfile="operator"|"manager";
type Member={user_id:string;full_name:string;crm_role:string|null;chat_role:ChatProfile|null};
type ChatRoles={operator:string[];manager:string[];members:Member[]};
const labels:Record<ChatProfile,string>={operator:"Operador",manager:"Gestor"};
const chatPermissions=[
 ["internal_chat.use","Utilizar chat interno"],
 ["internal_chat.call","Chamar funcionários"],
 ["internal_chat.groups.create","Criar grupos"],
 ["internal_chat.groups.manage","Gerenciar grupos"],
 ["internal_chat.attachments.send","Enviar anexos"],
 ["internal_chat.metrics.view","Ver indicadores"],
 ["internal_chat.settings.manage","Configurar chat interno"],
] as const;
export function ChatRoleSettings({org,canManage,onOpenFull,onBack}:{org:string;canManage:boolean;onOpenFull:()=>void;onBack:()=>void}){
 const qc=useQueryClient();
 const [mode,setMode]=useState<"home"|"crm"|"individual">("home");
 const [profile,setProfile]=useState<ChatProfile|null>(null);
 const [keys,setKeys]=useState<string[]>([]);
 const [section,setSection]=useState<"profiles"|"members">("profiles");
 const [search,setSearch]=useState("");
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const data=useQuery({queryKey:["chat-independent-roles",org],enabled:mode==="individual",queryFn:async()=>{
  const r=await supabase.rpc("internal_chat_role_admin_data_v1",{p_org:org});
  if(r.error)throw r.error;return r.data as ChatRoles;
 },staleTime:30000,retry:false});
 function toggle(key:string){
  setKeys(old=>old.includes(key)?(key==="internal_chat.use"?[]:old.filter(k=>k!==key)):[...new Set([...old,key,"internal_chat.use"])]);
 }
 async function changed(){
  await data.refetch();
  void qc.invalidateQueries({queryKey:["internal-chat-permissions",org]});
  void qc.invalidateQueries({queryKey:["internal-chat",org]});
 }
 async function saveProfile(){
  if(!profile||!canManage||saving)return;setSaving(true);setError("");
  try{const r=await supabase.rpc("internal_chat_save_template_v1",{p_org:org,p_role:profile,p_keys:keys});if(r.error)throw r.error;await changed();setProfile(null);}catch{setError("Não foi possível salvar o perfil.");}finally{setSaving(false);}
 }
 async function assign(userId:string,role:string){
  if(!canManage||saving)return;setSaving(true);setError("");
  try{const r=await supabase.rpc("internal_chat_assign_role_v1",{p_org:org,p_user:userId,p_role:role==="crm"?null:role});if(r.error)throw r.error;await changed();}catch{setError("Não foi possível vincular o funcionário.");}finally{setSaving(false);}
 }
 if(mode==="crm")return <CRMRoleSettings org={org} canManage={canManage} onOpenFull={onOpenFull} onBack={()=>setMode("home")}/>;
 return <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
  <div className="mb-3 flex items-center gap-2"><button type="button" title="Voltar" className="rounded p-1 hover:bg-muted" onClick={()=>profile?setProfile(null):mode==="home"?onBack():setMode("home")}><ChevronLeft size={16}/></button><span className="text-xs font-bold">{profile?labels[profile]:mode==="individual"?"Perfis próprios do chat":"Perfis e permissões"}</span></div>
  {mode==="home"?<div className="space-y-2">
   <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-border p-3 text-left" onClick={()=>setMode("crm")}><ShieldCheck size={18} className="shrink-0 text-primary"/><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Perfis do CRM</span><span className="block text-[11px] text-muted-foreground">Herdar e configurar as permissões dos perfis existentes.</span></span><ChevronRight size={15}/></button>
   <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-border p-3 text-left" onClick={()=>setMode("individual")}><ShieldCheck size={18} className="shrink-0 text-primary"/><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Perfis próprios do chat</span><span className="block text-[11px] text-muted-foreground">Configurar Operador e Gestor e vincular funcionários individualmente.</span></span><ChevronRight size={15}/></button>
   <p className="px-1 text-[11px] text-muted-foreground">Um vínculo individual prevalece sobre as permissões de chat do perfil do CRM. Não altera os demais módulos.</p>
  </div>:data.isPending?<div className="grid min-h-40 place-items-center" role="status"><Loader2 className="animate-spin text-primary" size={22}/></div>:data.isError?<button type="button" className="w-full py-5 text-xs text-destructive" onClick={()=>void data.refetch()}>Falha ao carregar. Tentar novamente.</button>:<>
   {error&&<p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}
   {profile?<><p className="mb-2 text-[11px] text-muted-foreground">Aplica-se a todos os funcionários vinculados a este perfil próprio.</p>{chatPermissions.map(([key,label])=><label key={key} className="flex items-center gap-2 border-b border-border py-2 text-xs"><input type="checkbox" checked={keys.includes(key)} disabled={!canManage||saving} onChange={()=>toggle(key)}/>{label}</label>)}{canManage&&<button type="button" disabled={saving} className="mt-3 w-full rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50" onClick={()=>void saveProfile()}>Salvar permissões</button>}</>:<>
    <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">{(["profiles","members"] as const).map(v=><button type="button" key={v} onClick={()=>setSection(v)} className={"rounded-md px-2 py-2 text-xs "+(section===v?"bg-card font-semibold shadow-sm":"text-muted-foreground")}>{v==="profiles"?"Permissões":"Funcionários"}</button>)}</div>
    {section==="profiles"?<>{(["operator","manager"] as const).map(role=><button type="button" key={role} className="flex w-full items-center gap-2 rounded-lg px-2 py-3 text-left hover:bg-muted" onClick={()=>{setProfile(role);setKeys(data.data?.[role]??[]);}}><ShieldCheck size={18} className="text-primary"/><span className="flex-1 text-xs font-semibold">{labels[role]}<span className="block text-[11px] font-normal text-muted-foreground">{data.data?.[role].length??0} permissões · {data.data?.members.filter(m=>m.chat_role===role).length??0} vinculados</span></span><ChevronRight size={15}/></button>)}</>:<>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar funcionário" className="mb-2 w-full rounded-md border border-border bg-background p-2 text-xs"/>
    {data.data?.members.filter(m=>m.full_name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).map(m=><div key={m.user_id} className="border-b border-border py-2"><span className="block truncate text-xs font-semibold" title={m.full_name}>{m.full_name}</span><span className="block text-[11px] text-muted-foreground">CRM: {m.crm_role??"Sem perfil"}</span><select aria-label={"Perfil de chat de "+m.full_name} disabled={!canManage||saving} value={m.chat_role??"crm"} onChange={e=>void assign(m.user_id,e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-1.5 text-xs"><option value="crm">Herdar perfil do CRM</option><option value="operator">Operador do chat</option><option value="manager">Gestor do chat</option></select></div>)}
    <p className="mt-2 text-[11px] text-muted-foreground">O perfil próprio substitui apenas as permissões do chat. Selecione Herdar perfil do CRM para remover a exceção.</p></>}
   </>}
  </>}
 </div>;
}
