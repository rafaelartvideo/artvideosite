import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Users } from "lucide-react";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCpfInput, FEmailInput, FInput, FPhoneInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { createPartnerUser, listPartnerRoles, listPartnerUsers, updatePartnerUser } from "../infrastructure/partner-companies.repository";

type Form = { full_name:string; cpf:string; phone:string; email:string; password:string; function_name:string; role_id:string; is_owner:boolean; is_active:boolean };
const empty: Form = { full_name:"", cpf:"", phone:"", email:"", password:"", function_name:"", role_id:"", is_owner:false, is_active:true };
const statusLabel = (value:string) => value === "active" ? "Ativo" : value === "invited" ? "Convidado" : "Bloqueado";

export function PartnerCompanyUsersSection({ organizationId, companyStatus }: { organizationId:string; companyStatus:string }) {
  const queryClient = useQueryClient();
  const [formOpen,setFormOpen] = useState(false);
  const [editing,setEditing] = useState<any>(null);
  const [form,setForm] = useState<Form>(empty);
  const [toast,setToast] = useState<{msg:string;type:"success"|"error"}|null>(null);

  const usersQuery = useQuery({ queryKey:["partner-companies","users",organizationId], queryFn:async()=>{ const {data,error}=await listPartnerUsers(organizationId); if(error) throw error; return data||[]; } });
  const rolesQuery = useQuery({ queryKey:["partner-companies","roles"], queryFn:async()=>{ const {data,error}=await listPartnerRoles(); if(error) throw error; return data||[]; } });
  const roleOptions = [{value:"",label:"Selecione"}, ...(rolesQuery.data||[]).map((role:any)=>({value:role.id,label:role.name}))];

  const saveMutation = useMutation({
    mutationFn:async()=>{
      if(!form.full_name.trim() || !form.cpf.replace(/\D/g,"") || !form.role_id) throw new Error("Preencha nome, CPF e função.");
      if(!editing && !form.email.trim()) throw new Error("Informe o e-mail do usuário.");
      const payload={ organization_id:organizationId, full_name:form.full_name.trim(), cpf:form.cpf, phone:form.phone.trim()||null, email:form.email.trim(), password:form.password, function_name:form.function_name.trim()||null, role_id:form.role_id, is_owner:form.is_owner, is_active:form.is_active };
      const result=editing ? await updatePartnerUser({...payload,user_id:editing.user_id}) : await createPartnerUser(payload);
      if(result.error) throw result.error;
      return result.data;
    },
    onSuccess:(data:any)=>{ void queryClient.invalidateQueries({queryKey:["partner-companies","users",organizationId]}); setFormOpen(false); setEditing(null); setForm(empty); setToast({msg:data?.reused_existing_login?"Usuário existente vinculado à empresa.":"Usuário salvo com sucesso.",type:"success"}); },
    onError:(error:any)=>setToast({msg:`Não foi possível salvar o usuário: ${error?.message||"Erro desconhecido"}`,type:"error"}),
  });

  const openEdit=(user:any)=>{ setEditing(user); setForm({ full_name:user.full_name||"", cpf:user.cpf||"", phone:user.phone||"", email:user.email||"", password:"", function_name:user.function_name||"", role_id:user.role_id||"", is_owner:user.is_owner===true, is_active:user.status==="active" }); setFormOpen(true); };

  return <div className="space-y-4">
    {toast&&<Toast message={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>} 
    <AdminCard>
      <AdminCardHeader>
        <div><h3 className="text-sm font-black text-[#0d1b2e]">Usuários da empresa</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Cadastre e gerencie quem pode acessar esta empresa.</p></div>
        <BtnPrimary onClick={()=>{setEditing(null);setForm(empty);setFormOpen(true);}} disabled={companyStatus!=="active" || rolesQuery.isError}><Plus size={15}/> Novo usuário</BtnPrimary>
      </AdminCardHeader>
      {formOpen&&<AdminCardContent className="border-b border-[#0d1b2e]/8"><div className="grid gap-4 sm:grid-cols-2">
        <FInput label="Nome completo" required value={form.full_name} onChange={(e:any)=>setForm(c=>({...c,full_name:e.target.value}))}/>
        <FCpfInput label="CPF" required value={form.cpf} onChange={(e:any)=>setForm(c=>({...c,cpf:e.target.value}))}/>
        <FPhoneInput label="Telefone" mobile value={form.phone} onChange={(e:any)=>setForm(c=>({...c,phone:e.target.value}))}/>
        <FEmailInput label="E-mail" required={!editing} disabled={Boolean(editing)} value={form.email} onChange={(e:any)=>setForm(c=>({...c,email:e.target.value}))}/>
        {!editing&&<FInput label="Senha temporária" type="password" hint="Mínimo de 8 caracteres quando o login ainda não existir." value={form.password} onChange={(e:any)=>setForm(c=>({...c,password:e.target.value}))}/>} 
        <FSelect label="Função" required value={form.role_id} options={roleOptions} onChange={(e:any)=>setForm(c=>({...c,role_id:e.target.value}))}/>
        <FInput label="Cargo/Função exibida" value={form.function_name} onChange={(e:any)=>setForm(c=>({...c,function_name:e.target.value}))}/>
        <div className="space-y-3 sm:col-span-2"><FToggle label="Usuário ativo" checked={form.is_active} onChange={v=>setForm(c=>({...c,is_active:v}))}/><FToggle label="Proprietário da empresa" checked={form.is_owner} onChange={v=>setForm(c=>({...c,is_owner:v}))}/></div>
      </div><div className="mt-5 flex justify-end gap-2"><BtnSecondary onClick={()=>{setFormOpen(false);setEditing(null);setForm(empty);}}>Cancelar</BtnSecondary><BtnPrimary onClick={()=>saveMutation.mutate()} disabled={saveMutation.isPending||rolesQuery.isPending||rolesQuery.isError}>{saveMutation.isPending?"Salvando...":"Salvar usuário"}</BtnPrimary></div></AdminCardContent>}
      {usersQuery.isPending?<LoadingState/>:usersQuery.isError?<AdminCardContent><p className="text-sm font-semibold text-red-700">{(usersQuery.error as any)?.message||"Não foi possível carregar os usuários."}</p></AdminCardContent>:(usersQuery.data||[]).length===0?<AdminCardContent><EmptyState icon={Users} title="Nenhum usuário vinculado" message="Esta empresa ainda não possui usuários cadastrados."/></AdminCardContent>:<div className="overflow-x-auto"><table className="min-w-[760px]"><thead><tr><th className="text-left">Usuário</th><th className="text-left">E-mail</th><th className="text-left">Função</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{(usersQuery.data||[]).map((user:any)=><tr key={user.membership_id}><td><p className="font-bold text-[#0d1b2e]">{user.full_name||"—"}</p><p className="text-xs text-[#5a6a82]">{user.phone||user.cpf||"—"}</p></td><td>{user.email||"—"}</td><td>{user.role_name||user.function_name||"Sem função"}</td><td><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{statusLabel(user.status)}</span></td><td><div className="flex justify-end"><AdminIconButton title="Editar usuário" onClick={()=>openEdit(user)}><Edit2 size={14}/></AdminIconButton></div></td></tr>)}</tbody></table></div>}
    </AdminCard>
  </div>;
}
