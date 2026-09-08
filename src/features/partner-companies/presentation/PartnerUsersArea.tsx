import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Edit2, Plus, Users } from "lucide-react";
import { AdminCard, AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCpfInput, FEmailInput, FInput, FPhoneInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import {
  createPartnerUser,
  listPartnerCompanies,
  listPartnerRoles,
  listPartnerUsers,
  updatePartnerUser,
} from "../infrastructure/partner-companies.repository";

type PartnerUserForm = {
  full_name: string;
  cpf: string;
  phone: string;
  email: string;
  password: string;
  function_name: string;
  role_id: string;
  is_owner: boolean;
  is_active: boolean;
};

const emptyUser: PartnerUserForm = {
  full_name: "",
  cpf: "",
  phone: "",
  email: "",
  password: "",
  function_name: "",
  role_id: "",
  is_owner: false,
  is_active: true,
};

const memberStatusLabel = (value: string) => value === "active" ? "Ativo" : value === "invited" ? "Convidado" : "Bloqueado";
const companyOptions = (companies: any[]) => [{ value: "", label: "Selecione" }, ...companies.map(company => ({ value: company.id, label: company.name }))];

function QueryError({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message}</div>;
}

export function PartnerUsersArea() {
  const queryClient = useQueryClient();
  const [organizationId, setOrganizationId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<PartnerUserForm>(emptyUser);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["partner-companies", "companies"],
    queryFn: async () => {
      const { data, error } = await listPartnerCompanies();
      if (error) throw error;
      return data || [];
    },
  });

  const rolesQuery = useQuery({
    queryKey: ["partner-companies", "roles"],
    queryFn: async () => {
      const { data, error } = await listPartnerRoles();
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!organizationId && companiesQuery.data?.[0]?.id) setOrganizationId(companiesQuery.data[0].id);
  }, [companiesQuery.data, organizationId]);

  useEffect(() => {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyUser);
  }, [organizationId]);

  const usersQuery = useQuery({
    queryKey: ["partner-companies", "users", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await listPartnerUsers(organizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const selectedCompany = (companiesQuery.data || []).find((company: any) => company.id === organizationId);
  const roleOptions = [{ value: "", label: "Selecione" }, ...(rolesQuery.data || []).map((role: any) => ({ value: role.id, label: role.name }))];
  const hasCompanies = (companiesQuery.data || []).length > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Selecione a empresa.");
      if (!form.full_name.trim() || !form.cpf.replace(/\D/g, "") || !form.role_id) throw new Error("Preencha nome, CPF e função.");
      if (!editing && !form.email.trim()) throw new Error("Informe o e-mail do usuário.");

      const payload = {
        organization_id: organizationId,
        full_name: form.full_name.trim(),
        cpf: form.cpf,
        phone: form.phone.trim() || null,
        email: form.email.trim(),
        password: form.password,
        function_name: form.function_name.trim() || null,
        role_id: form.role_id,
        is_owner: form.is_owner,
        is_active: form.is_active,
      };

      const result = editing
        ? await updatePartnerUser({ ...payload, user_id: editing.user_id })
        : await createPartnerUser(payload);
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (data: any) => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "users", organizationId] });
      setFormOpen(false);
      setEditing(null);
      setForm(emptyUser);
      setToast({ msg: data?.reused_existing_login ? "Usuário existente vinculado à empresa." : "Usuário salvo com sucesso.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível salvar o usuário: ${error?.message || "Erro desconhecido"}`, type: "error" }),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyUser);
    setFormOpen(true);
  };

  const openEdit = (user: any) => {
    setEditing(user);
    setForm({
      full_name: user.full_name || "",
      cpf: user.cpf || "",
      phone: user.phone || "",
      email: user.email || "",
      password: "",
      function_name: user.function_name || "",
      role_id: user.role_id || "",
      is_owner: user.is_owner === true,
      is_active: user.status === "active",
    });
    setFormOpen(true);
  };

  return <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <AdminCard className="p-4">
      {companiesQuery.isPending ? <LoadingState /> : companiesQuery.isError ? (
        <QueryError message={`Não foi possível carregar as empresas: ${(companiesQuery.error as any)?.message || "Erro desconhecido"}`} />
      ) : !hasCompanies ? (
        <EmptyState icon={Building2} title="Nenhuma empresa parceira" message="Cadastre uma empresa em Empresas antes de adicionar usuários." />
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <FSelect label="Empresa" value={organizationId} options={companyOptions(companiesQuery.data || [])} onChange={(event: any) => setOrganizationId(event.target.value)} />
          </div>
          <BtnPrimary onClick={openNew} disabled={!organizationId || selectedCompany?.status !== "active" || rolesQuery.isError}>
            <Plus size={15} /> Novo usuário
          </BtnPrimary>
        </div>
      )}
      {selectedCompany && selectedCompany.status !== "active" && <p className="mt-2 text-xs font-semibold text-amber-700">Ative a empresa para cadastrar novos usuários. Usuários existentes continuam disponíveis para consulta e edição.</p>}
      {rolesQuery.isError && <div className="mt-3"><QueryError message={`Não foi possível carregar as funções: ${(rolesQuery.error as any)?.message || "Erro desconhecido"}`} /></div>}
    </AdminCard>

    {formOpen && <AdminCard className="p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="font-black text-[#0d1b2e]">{editing ? "Editar usuário" : "Novo usuário"}</h3>
        <p className="mt-1 text-xs text-[#5a6a82]">{editing ? "As alterações abaixo valem para o vínculo com esta empresa." : "Se o e-mail já existir, o login será apenas vinculado a esta empresa e a senha informada será ignorada."}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput label="Nome completo" required value={form.full_name} onChange={(event: any) => setForm(current => ({ ...current, full_name: event.target.value }))} />
        <FCpfInput label="CPF" required value={form.cpf} onChange={(event: any) => setForm(current => ({ ...current, cpf: event.target.value }))} />
        <FPhoneInput label="Telefone" mobile value={form.phone} onChange={(event: any) => setForm(current => ({ ...current, phone: event.target.value }))} />
        <FEmailInput label="E-mail" required={!editing} disabled={Boolean(editing)} value={form.email} onChange={(event: any) => setForm(current => ({ ...current, email: event.target.value }))} />
        {!editing && <FInput label="Senha temporária" type="password" hint="Obrigatória somente se o e-mail ainda não existir. Mínimo de 8 caracteres." value={form.password} onChange={(event: any) => setForm(current => ({ ...current, password: event.target.value }))} />}
        <FSelect label="Função" required value={form.role_id} options={roleOptions} onChange={(event: any) => setForm(current => ({ ...current, role_id: event.target.value }))} />
        <FInput label="Cargo/Função exibida" value={form.function_name} onChange={(event: any) => setForm(current => ({ ...current, function_name: event.target.value }))} />
        <div className="space-y-3 sm:col-span-2">
          <FToggle label="Usuário ativo" description="Quando desativado, o vínculo com esta empresa fica bloqueado." checked={form.is_active} onChange={value => setForm(current => ({ ...current, is_active: value }))} />
          <FToggle label="Proprietário da empresa" description="Marca o usuário como proprietário deste tenant. Não concede acesso a outras empresas." checked={form.is_owner} onChange={value => setForm(current => ({ ...current, is_owner: value }))} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <BtnSecondary onClick={() => { setFormOpen(false); setEditing(null); setForm(emptyUser); }}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || rolesQuery.isPending || rolesQuery.isError}>{saveMutation.isPending ? "Salvando..." : "Salvar usuário"}</BtnPrimary>
      </div>
    </AdminCard>}

    {!organizationId ? (
      hasCompanies ? <AdminCard className="p-4"><p className="text-sm text-[#5a6a82]">Selecione uma empresa para visualizar os usuários.</p></AdminCard> : null
    ) : usersQuery.isFetching && !usersQuery.data ? <LoadingState /> : usersQuery.isError ? (
      <AdminCard className="p-4"><QueryError message={`Não foi possível carregar os usuários: ${(usersQuery.error as any)?.message || "Erro desconhecido"}`} /></AdminCard>
    ) : (usersQuery.data || []).length === 0 ? (
      <EmptyState icon={Users} title="Nenhum usuário vinculado" message="Esta empresa ainda não possui usuários cadastrados." />
    ) : <AdminCard>
      <div className="overflow-x-auto">
        <table className="min-w-[820px]">
          <thead><tr><th className="text-left">Usuário</th><th className="text-left">E-mail</th><th className="text-left">Função</th><th className="text-left">Status</th><th className="text-left">Proprietário</th><th className="text-right">Ações</th></tr></thead>
          <tbody>{(usersQuery.data || []).map((user: any) => <tr key={user.membership_id}>
            <td><p className="font-bold text-[#0d1b2e]">{user.full_name || "—"}</p><p className="text-xs text-[#5a6a82]">{user.phone || user.cpf || "—"}</p></td>
            <td className="text-sm text-[#5a6a82]">{user.email || "—"}</td>
            <td className="text-sm text-[#5a6a82]">{user.role_name || user.function_name || "Sem função"}</td>
            <td><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{memberStatusLabel(user.status)}</span></td>
            <td className="text-sm text-[#5a6a82]">{user.is_owner ? "Sim" : "Não"}</td>
            <td><div className="flex justify-end"><AdminIconButton title="Editar usuário" onClick={() => openEdit(user)}><Edit2 size={14} /></AdminIconButton></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </AdminCard>}
  </div>;
}
