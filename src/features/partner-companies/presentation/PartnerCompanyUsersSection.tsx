import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Users } from "lucide-react";
import { isValidUsername, normalizeUsername } from "@/features/auth/domain/username";
import { lookupCpf } from "@/features/customers/infrastructure/cpf.gateway";
import { isPastOrTodayIsoDate, isValidBrazilianPhone, isValidCpf, isValidEmail, normalizeDigits, todayDateOnly } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminDialog, AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCpfInput, FEmailInput, FInput, FPhoneInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { createPartnerUser, listPartnerRoles, listPartnerUsers, updatePartnerUser } from "../infrastructure/partner-companies.repository";

type Form = {
  full_name: string;
  cpf: string;
  birth_date: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  function_name: string;
  role_id: string;
  is_owner: boolean;
  is_active: boolean;
};

type FormErrors = Partial<Record<keyof Form, string>>;

const empty: Form = {
  full_name: "",
  cpf: "",
  birth_date: "",
  phone: "",
  email: "",
  username: "",
  password: "",
  function_name: "",
  role_id: "",
  is_owner: false,
  is_active: true,
};

const statusLabel = (value: string) => value === "active" ? "Ativo" : value === "invited" ? "Convidado" : "Bloqueado";

function validateUser(form: Form, editing: boolean): FormErrors {
  const errors: FormErrors = {};
  if (!form.full_name.trim()) errors.full_name = "Informe o nome completo.";
  if (!isValidCpf(form.cpf)) errors.cpf = "Informe um CPF válido.";
  if (!form.birth_date || !isPastOrTodayIsoDate(form.birth_date)) errors.birth_date = "Informe uma data de nascimento válida.";
  if (form.phone && !isValidBrazilianPhone(form.phone)) errors.phone = "Informe um telefone brasileiro válido.";
  if (form.email.trim() && !isValidEmail(form.email)) errors.email = "Informe um e-mail válido.";
  if (!editing && !form.username.trim()) errors.username = "Informe o usuário de acesso.";
  else if (form.username && !isValidUsername(form.username)) errors.username = "Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.";
  if (!form.role_id) errors.role_id = "Selecione uma função.";
  if (!editing && !form.password) errors.password = "Informe a senha.";
  else if (!editing && form.password.length < 8) errors.password = "A senha deve ter pelo menos 8 caracteres.";
  return errors;
}

export function PartnerCompanyUsersSection({ organizationId, companyStatus }: { organizationId: string; companyStatus: string }) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<FormErrors>({});
  const [cpfLoading, setCpfLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const usersQuery = useQuery({
    queryKey: ["partner-companies", "users", organizationId],
    queryFn: async () => {
      const { data, error } = await listPartnerUsers(organizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const rolesQuery = useQuery({
    queryKey: ["partner-companies", "roles", organizationId],
    queryFn: async () => {
      const { data, error } = await listPartnerRoles(organizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const roleOptions = [
    { value: "", label: "Selecione" },
    ...(rolesQuery.data || []).map((role: any) => ({ value: role.id, label: role.name })),
  ];

  useEffect(() => {
    if (usersQuery.error) setToast({ msg: systemErrorMessage(usersQuery.error, "Não foi possível carregar os usuários."), type: "error" });
  }, [usersQuery.error]);

  useEffect(() => {
    if (rolesQuery.error) setToast({ msg: systemErrorMessage(rolesQuery.error, "Não foi possível carregar as funções disponíveis para esta empresa."), type: "error" });
  }, [rolesQuery.error]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        organization_id: organizationId,
        full_name: form.full_name.trim(),
        cpf: form.cpf,
        birth_date: form.birth_date || null,
        phone: form.phone.trim() || null,
        email: form.email.trim().toLowerCase(),
        username: normalizeUsername(form.username),
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "users", organizationId] });
      setFormOpen(false);
      setEditing(null);
      setForm(empty);
      setErrors({});
      setToast({ msg: "Usuário salvo com sucesso.", type: "success" });
    },
    onError: (error: any) => {
      const code = String(error?.code || "");
      const message = systemErrorMessage(error, "Não foi possível salvar o usuário.");
      let fieldError = true;
      if (code === "cpf_already_exists" || code === "invalid_cpf") {
        setErrors(current => ({ ...current, cpf: message }));
      } else if (code === "username_already_exists" || code === "invalid_username") {
        setErrors(current => ({ ...current, username: message }));
      } else if (code === "invalid_email") {
        setErrors(current => ({ ...current, email: message }));
      } else if (code === "invalid_phone") {
        setErrors(current => ({ ...current, phone: message }));
      } else if (code === "weak_password") {
        setErrors(current => ({ ...current, password: message }));
      } else if (code === "invalid_role") {
        setErrors(current => ({ ...current, role_id: message }));
      } else {
        fieldError = false;
      }
      if (!fieldError) setToast({ msg: message, type: "error" });
    },
  });

  const setField = (key: keyof Form, value: string | boolean) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
  };

  const lookupCpfIdentity = async () => {
    if (!isValidCpf(form.cpf)) {
      setErrors(current => ({ ...current, cpf: "Informe um CPF válido." }));
      return;
    }

    const requestedCpf = normalizeDigits(form.cpf);
    setCpfLoading(true);
    setErrors(current => ({ ...current, cpf: undefined }));
    try {
      const result = await lookupCpf(requestedCpf, organizationId);
      setForm(current => {
        if (normalizeDigits(current.cpf) !== requestedCpf) return current;
        return {
          ...current,
          full_name: result.name || current.full_name,
          birth_date: result.birthDate || current.birth_date,
        };
      });
      setErrors(current => ({ ...current, full_name: undefined, birth_date: undefined }));
      setToast({
        msg: result.source === "local"
          ? "CPF encontrado no cadastro da empresa. Nome e nascimento foram reaproveitados."
          : result.birthDate
            ? "Nome e data de nascimento preenchidos pela consulta de CPF."
            : "Nome preenchido pela consulta de CPF.",
        type: "success",
      });
    } catch (error) {
      setErrors(current => ({
        ...current,
        cpf: systemErrorMessage(error, "Não foi possível consultar o CPF."),
      }));
    } finally {
      setCpfLoading(false);
    }
  };

  const saveUser = () => {
    const validationErrors = validateUser(form, Boolean(editing));
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;
    saveMutation.mutate();
  };

  const openEdit = (user: any) => {
    setEditing(user);
    setErrors({});
    setForm({
      full_name: user.full_name || "",
      cpf: user.cpf || "",
      birth_date: user.birth_date || "",
      phone: user.phone || "",
      email: user.email || "",
      username: user.username || "",
      password: "",
      function_name: user.function_name || "",
      role_id: user.role_id || "",
      is_owner: user.is_owner === true,
      is_active: user.status === "active",
    });
    setFormOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setErrors({});
    setFormOpen(true);
  };

  const cancelForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(empty);
    setErrors({});
  };

  return <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <AdminCard>
      <AdminCardHeader>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-[#0d1b2e]">Usuários da empresa</h3>
          <p className="mt-0.5 text-xs text-[#5a6a82]">Cadastre e gerencie quem pode acessar esta empresa.</p>
        </div>
        <BtnPrimary
          onClick={openNew}
          disabled={companyStatus !== "active" || rolesQuery.isError}
          aria-label="Novo usuário"
          title="Novo usuário"
          className="h-8 w-8 shrink-0 !px-0 sm:h-auto sm:w-auto sm:!px-4"
        >
          <Plus size={15} /> <span className="hidden sm:inline">Novo usuário</span>
        </BtnPrimary>
      </AdminCardHeader>

      {rolesQuery.isError && <AdminCardContent className="border-b border-red-100 bg-red-50/60">
        <p className="text-sm font-semibold text-red-700">Não foi possível carregar as funções disponíveis para esta empresa.</p>
      </AdminCardContent>}

      {formOpen && <AdminDialog
        open
        onClose={cancelForm}
        title={editing ? "Editar usuário" : "Novo usuário"}
        description={editing ? "Atualize os dados e o acesso deste usuário." : "Cadastre um novo usuário para acessar esta empresa."}
        className="max-w-2xl"
        footer={<div className="flex justify-end gap-2">
          <BtnSecondary onClick={cancelForm} disabled={saveMutation.isPending}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={saveUser} disabled={saveMutation.isPending || rolesQuery.isPending || rolesQuery.isError}>
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </BtnPrimary>
        </div>}
      >
        <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FInput label="Nome completo" required error={errors.full_name} value={form.full_name} onChange={(e: any) => setField("full_name", e.target.value)} />
              <div className="min-w-0">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <FCpfInput label="CPF" required error={errors.cpf} value={form.cpf} onChange={(e: any) => setField("cpf", e.target.value)} />
                  <AdminButton variant="secondary" size="sm" loading={cpfLoading} loadingText="Consultar" onClick={() => void lookupCpfIdentity()} disabled={saveMutation.isPending || !isValidCpf(form.cpf)} className="h-[42px] shrink-0 border-primary/30 px-4 text-primary hover:bg-primary/5">Consultar</AdminButton>
                </div>
              </div>
              <FInput label="Data de nascimento" type="date" required max={todayDateOnly()} error={errors.birth_date} value={form.birth_date} onChange={(e: any) => setField("birth_date", e.target.value)} />
              <FPhoneInput label="Telefone" error={errors.phone} value={form.phone} onChange={(e: any) => setField("phone", e.target.value)} />
              <FEmailInput label="E-mail" error={errors.email} autoComplete="email" value={form.email} onChange={(e: any) => setField("email", e.target.value)} />
              <FInput
                label="Usuário"
                required={!editing}
                disabled={Boolean(editing)}
                error={errors.username}
                autoComplete="username"
                spellCheck={false}
                maxLength={32}
                placeholder="ex.: rafael.lima"
                hint={editing ? "O usuário de acesso é global e não é alterado por esta edição." : "O usuário é global e único em todo o sistema. Se já existir, o cadastro será recusado."}
                value={form.username}
                onChange={(e: any) => setField("username", normalizeUsername(e.target.value))}
              />
              {!editing && <FInput
                label="Senha"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                error={errors.password}
                hint="Obrigatória. Use pelo menos 8 caracteres."
                value={form.password}
                onChange={(e: any) => setField("password", e.target.value)}
              />}
              <FSelect label="Função" required error={errors.role_id} value={form.role_id} options={roleOptions} onChange={(e: any) => setField("role_id", e.target.value)} />
              <FInput label="Cargo/Função exibida" value={form.function_name} onChange={(e: any) => setField("function_name", e.target.value)} />
              <div className="space-y-3 sm:col-span-2">
                <FToggle label="Usuário ativo" checked={form.is_active} onChange={value => setField("is_active", value)} />
                <FToggle label="Proprietário da empresa" checked={form.is_owner} onChange={value => setField("is_owner", value)} />
              </div>
            </div>
        </div>

      </AdminDialog>}

      {usersQuery.isPending ? <LoadingState /> : usersQuery.isError ? <AdminCardContent><p className="text-sm font-semibold text-red-700">Não foi possível carregar os usuários.</p></AdminCardContent> : (usersQuery.data || []).length === 0 ? <AdminCardContent><EmptyState icon={Users} title="Nenhum usuário vinculado" message="Esta empresa ainda não possui usuários cadastrados." /></AdminCardContent> : <div className="overflow-x-auto"><table className="min-w-[820px]"><thead><tr><th className="text-left">Usuário</th><th className="text-left">Login</th><th className="text-left">E-mail</th><th className="text-left">Função</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{(usersQuery.data || []).map((user: any) => <tr key={user.membership_id}><td>
  <div className="flex flex-wrap items-center gap-2">
    <p className="font-bold text-[#0d1b2e]">{user.full_name || "—"}</p>
    {user.is_owner && <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">Proprietário</span>}
  </div>
  <p className="text-xs text-[#5a6a82]">{user.phone || user.cpf || "—"}</p>
</td><td>{user.username || "—"}</td><td>{user.email || "—"}</td><td>{user.role_name || user.function_name || "Sem função"}</td><td><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{statusLabel(user.status)}</span></td><td><div className="flex justify-end"><AdminIconButton title="Editar usuário" onClick={() => openEdit(user)}><Edit2 size={14} /></AdminIconButton></div></td></tr>)}</tbody></table></div>}
    </AdminCard>
  </div>;
}