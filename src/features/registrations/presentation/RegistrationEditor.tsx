import type { Dispatch, SetStateAction } from "react";
import { useLocation } from "react-router";
import { Building2, Users, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { resolveAdminRoute } from "@/features/admin-shell/admin-routes";
import { AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import {
  FBrazilianDateInput,
  FCnpjInput,
  FCpfInput,
  FEmailInput,
  FInput,
  FPhoneInput,
} from "@/shared/ui/admin/AdminFormControls";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import {
  UserAccessSection,
  type EmployeeAccessFormState,
} from "@/features/access/presentation/UserAccessSection";
import { useRegistrationLookups } from "../application/useRegistrationLookups";
import {
  registrationDisplayName,
  type RegistrationAddressForm,
  type RegistrationFieldErrors,
  type RegistrationFormState,
} from "../domain/registration-form";
import type { RegistrationRole, SupplierInventoryItem } from "../infrastructure/registrations.repository";
import { EmployeeSignatureSection } from "./EmployeeSignatureSection";
import { RegistrationAddressesEditor } from "./RegistrationAddressesEditor";
import { SupplierItemsEditor } from "./SupplierItemsEditor";

const roleLabels: Record<RegistrationRole, string> = {
  customer: "Cliente",
  employee: "Funcionário",
  supplier: "Fornecedor",
};

const roleIcons: Record<RegistrationRole, typeof Users> = {
  customer: UserRound,
  employee: Users,
  supplier: Building2,
};

export function RegistrationEditor({
  creating,
  form,
  setForm,
  addresses,
  setAddresses,
  supplierItems,
  setSupplierItems,
  organizationId,
  canModify,
  showAccess,
  accessForm,
  onAccessChange,
  accessExisting,
  accessLoading,
  canModifyAccess,
  lookups,
  fieldErrors,
  onClearFieldError,
  saving,
  onSave,
  onClose,
  onToggleRole,
  employeeOnly = false,
}: {
  creating: boolean;
  form: RegistrationFormState;
  setForm: Dispatch<SetStateAction<RegistrationFormState>>;
  addresses: RegistrationAddressForm[];
  setAddresses: Dispatch<SetStateAction<RegistrationAddressForm[]>>;
  supplierItems: SupplierInventoryItem[];
  setSupplierItems: Dispatch<SetStateAction<SupplierInventoryItem[]>>;
  organizationId: string | null;
  canModify: boolean;
  showAccess?: boolean;
  accessForm: EmployeeAccessFormState;
  onAccessChange: (next: EmployeeAccessFormState) => void;
  accessExisting: boolean;
  accessLoading: boolean;
  canModifyAccess: boolean;
  lookups: ReturnType<typeof useRegistrationLookups>;
  fieldErrors: RegistrationFieldErrors;
  onClearFieldError: (field: keyof RegistrationFieldErrors) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  onToggleRole: (role: RegistrationRole) => void;
  employeeOnly?: boolean;
}) {
  const canShowAccess = showAccess ?? (accessExisting || canModifyAccess);
  const location = useLocation();
  const { hasPermission } = useAuth();
  const route = resolveAdminRoute(location.pathname);
  const registrationId = !creating && route.tab === "customers" && route.resourceId && route.resourceId !== "new" ? route.resourceId : null;
  const canManageEmployeeSignature = hasPermission("registrations.employee_signature.manage");

  return <AdminPage
    open
    onClose={onClose}
    breadcrumb={employeeOnly ? "Usuários" : "Cadastros"}
    title={creating ? (employeeOnly ? "Novo usuário" : "Novo cadastro") : registrationDisplayName(form) || (employeeOnly ? "Editar usuário" : "Editar cadastro")}
    subtitle={creating
      ? (employeeOnly ? "Cadastre um funcionário e configure seu acesso à Union World." : "Cadastre uma pessoa ou empresa e defina seus vínculos.")
      : (employeeOnly ? "Atualize os dados do funcionário e seu acesso ao sistema." : "Atualize dados pessoais, endereços, fornecedor e acesso quando permitido.")}
    maxW="max-w-6xl"
  >
    <div className="space-y-5 p-4 sm:p-5">
      {employeeOnly ? (
        <Section title="Vínculo">
          <div className="flex items-center gap-3 rounded-xl border border-[#0057e7] bg-[#0057e7]/5 p-4">
            <Checkbox checked disabled tabIndex={-1} />
            <Users size={18} className="text-[#0057e7]" />
            <div>
              <div className="text-sm font-black text-[#0d1b2e]">Funcionário</div>
              <div className="mt-0.5 text-xs text-[#5a6a82]">Usuário interno da Union World.</div>
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Tipo e vínculos">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" disabled={!canModify} onClick={() => setForm(current => ({ ...current, person_type: "PF" }))} className={`rounded-xl border p-4 text-left disabled:opacity-50 ${form.person_type === "PF" ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec] bg-white"}`}>
              <div className="font-black text-[#0d1b2e]">Pessoa Física</div><div className="mt-1 text-xs text-[#5a6a82]">CPF, nascimento e contatos.</div>
            </button>
            <button type="button" disabled={form.roles.includes("employee") || !canModify} onClick={() => setForm(current => ({ ...current, person_type: "PJ" }))} className={`rounded-xl border p-4 text-left disabled:opacity-40 ${form.person_type === "PJ" ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec] bg-white"}`}>
              <div className="font-black text-[#0d1b2e]">Pessoa Jurídica</div><div className="mt-1 text-xs text-[#5a6a82]">CNPJ e dados empresariais.</div>
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{(["customer", "employee", "supplier"] as RegistrationRole[]).map(role => {
            const Icon = roleIcons[role];
            const checked = form.roles.includes(role);
            return <button key={role} type="button" disabled={!canModify} onClick={() => onToggleRole(role)} className={`flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-40 ${checked ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec] bg-white"}`}>
              <Checkbox checked={checked} tabIndex={-1} /><Icon size={17} className="text-[#0057e7]" /><span className="text-sm font-bold text-[#0d1b2e]">{roleLabels[role]}</span>
            </button>;
          })}</div>
          {fieldErrors.roles && <p className="mt-2 text-[10px] font-semibold leading-relaxed text-red-600">{fieldErrors.roles}</p>}
        </Section>
      )}

      <Section title="Dados Pessoais">
        {form.person_type === "PF" ? <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">CPF<span className="text-red-400">*</span></label>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><FCpfInput required error={lookups.cpfError || fieldErrors.document} value={form.document} onChange={(event: any) => { onClearFieldError("document"); setForm(current => ({ ...current, document: event.target.value })); lookups.setCpfError(""); }} /></div>
              <BtnSecondary className="h-[42px] shrink-0 px-4" onClick={() => void lookups.lookupCpfName()} disabled={lookups.cpfLoading}>Consultar</BtnSecondary>
            </div>
          </div>
          <FInput label="Nome completo" required error={fieldErrors.name} value={form.name} onChange={(event: any) => { onClearFieldError("name"); setForm(current => ({ ...current, name: event.target.value })); }} />
          <FPhoneInput label="Telefone" error={fieldErrors.phone} value={form.phone} onChange={(event: any) => { onClearFieldError("phone"); onClearFieldError("whatsapp"); setForm(current => ({ ...current, phone: event.target.value })); }} />
          <FPhoneInput label="WhatsApp" mobile error={fieldErrors.whatsapp} value={form.whatsapp} onChange={(event: any) => { onClearFieldError("whatsapp"); setForm(current => ({ ...current, whatsapp: event.target.value })); }} />
          <FBrazilianDateInput label="Data de nascimento" required error={fieldErrors.birth_date} value={form.birth_date} onChange={(event: any) => { onClearFieldError("birth_date"); setForm(current => ({ ...current, birth_date: event.target.value })); }} />
          <FEmailInput label="E-mail de contato" error={fieldErrors.email} value={form.email} onChange={(event: any) => { onClearFieldError("email"); setForm(current => ({ ...current, email: event.target.value })); }} />
        </div> : <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">CNPJ<span className="text-red-400">*</span></label>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><FCnpjInput required error={lookups.cnpjError || fieldErrors.document} value={form.document} onChange={(event: any) => { onClearFieldError("document"); setForm(current => ({ ...current, document: event.target.value })); lookups.setCnpjError(""); }} /></div>
              <BtnSecondary className="h-[42px] shrink-0 px-4" onClick={() => void lookups.lookupCnpj()} disabled={lookups.cnpjLoading}>Consultar</BtnSecondary>
            </div>
          </div>
          <FInput label="Nome fantasia" required error={fieldErrors.trade_name} value={form.trade_name} onChange={(event: any) => { onClearFieldError("trade_name"); setForm(current => ({ ...current, trade_name: event.target.value })); }} />
          <FInput label="Razão social" value={form.legal_name} onChange={(event: any) => setForm(current => ({ ...current, legal_name: event.target.value }))} />
          <FBrazilianDateInput label="Data de fundação" error={fieldErrors.foundation_date} value={form.foundation_date} onChange={(event: any) => { onClearFieldError("foundation_date"); setForm(current => ({ ...current, foundation_date: event.target.value })); }} />
          <FInput label="Inscrição estadual" value={form.state_registration} onChange={(event: any) => setForm(current => ({ ...current, state_registration: event.target.value }))} />
          <FInput label="Inscrição municipal" value={form.municipal_registration} onChange={(event: any) => setForm(current => ({ ...current, municipal_registration: event.target.value }))} />
          <FPhoneInput label="Telefone" value={form.phone} onChange={(event: any) => setForm(current => ({ ...current, phone: event.target.value }))} />
          <FPhoneInput label="WhatsApp" mobile value={form.whatsapp} onChange={(event: any) => setForm(current => ({ ...current, whatsapp: event.target.value }))} />
          <div className="sm:col-span-2"><FEmailInput label="E-mail de contato" error={fieldErrors.email} value={form.email} onChange={(event: any) => { onClearFieldError("email"); setForm(current => ({ ...current, email: event.target.value })); }} /></div>
        </div>}
        <label className="mt-4 flex items-center gap-2 text-sm font-bold text-[#0d1b2e]"><Checkbox checked={form.is_active} onCheckedChange={checked => setForm(current => ({ ...current, is_active: checked === true }))} /> Cadastro ativo</label>
      </Section>

      <RegistrationAddressesEditor value={addresses} onChange={setAddresses} disabled={!canModify} />

      {form.roles.includes("employee") && <Section title="Geral">
        <div className="grid gap-4 sm:grid-cols-3">
          <FInput label="Cargo" value={form.job_title} onChange={(event: any) => setForm(current => ({ ...current, job_title: event.target.value }))} />
          <FInput label="Setor" value={form.team_name} onChange={(event: any) => setForm(current => ({ ...current, team_name: event.target.value }))} />
          <FInput label="Data de admissão" type="date" value={form.admission_date} onChange={(event: any) => setForm(current => ({ ...current, admission_date: event.target.value }))} />
        </div>

        {canShowAccess && <div className="mt-5 border-t border-[#0d1b2e]/8 pt-5">
          <div className="mb-4 text-sm font-black text-[#0d1b2e]">Acesso ao sistema</div>
          <UserAccessSection
            embedded
            organizationId={organizationId}
            value={accessForm}
            onChange={onAccessChange}
            existingAccess={accessExisting}
            registrationEmail={form.email}
            disabled={!canModifyAccess}
            loading={accessLoading}
          />
        </div>}
      </Section>}

      {form.roles.includes("employee") && <EmployeeSignatureSection organizationId={organizationId} entityId={registrationId} canManage={canManageEmployeeSignature} />}

      {form.roles.includes("supplier") && <SupplierItemsEditor organizationId={organizationId} value={supplierItems} onChange={setSupplierItems} disabled={!canModify} />}
    </div>

    <AdminStickyToolbar className="flex-wrap justify-end gap-2">
      <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
      <BtnPrimary disabled={!canModify} onClick={onSave} loading={saving} loadingText="Salvando...">{creating ? "Criar" : "Salvar alterações"}</BtnPrimary>
    </AdminStickyToolbar>
  </AdminPage>;
}
