import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Edit2, MapPin, ShieldCheck } from "lucide-react";
import { getAddressMapUrl } from "@/lib/address";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminPage, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { formatCnpj, formatCpf, formatDateOnly, formatPhone } from "@/shared/domain/formatters";
import { setEmployeeAccessActive } from "@/features/access/infrastructure/user-access.repository";
import { activeRegistrationRoles } from "../domain/registration-form";
import type { Registration, RegistrationRole, SupplierInventoryItem } from "../infrastructure/registrations.repository";
import type { EmployeeAccessFormState } from "@/features/access/presentation/UserAccessSection";
import { SupplierItemsTable } from "./SupplierItemsTable";

const roleLabels: Record<RegistrationRole, string> = {
  customer: "Cliente",
  employee: "Funcionário",
  supplier: "Fornecedor",
};

function detailValue(label: string, value: string) {
  return <div key={label} className="min-w-0">
    <div className="text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">{label}</div>
    <div className="mt-1 break-words text-sm font-bold text-[#0d1b2e]">{value || "—"}</div>
  </div>;
}

function formatZipCode(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value || "";
}

function formatBrazilianAddress(address: Registration["addresses"] extends Array<infer T> | null | undefined ? T : never) {
  const streetNumber = [address.street, address.number].filter(Boolean).join(", ");
  const complement = address.complement ? `, ${address.complement}` : "";
  const neighborhood = address.neighborhood ? ` - ${address.neighborhood}` : "";
  const cityState = [address.city, address.state].filter(Boolean).join(" - ");
  const locality = cityState ? `${streetNumber || complement || neighborhood ? ", " : ""}${cityState}` : "";
  const zipCode = address.zip_code ? `${streetNumber || complement || neighborhood || locality ? ", " : ""}CEP ${formatZipCode(address.zip_code)}` : "";
  return `${streetNumber}${complement}${neighborhood}${locality}${zipCode}`.trim() || "Endereço sem dados informados";
}

export function RegistrationDetails({
  selected,
  supplierItems,
  accessForm,
  accessExisting,
  accessLoading,
  permissionUserId,
  canViewAccess,
  canViewPermissionOverrides,
  canEdit,
  onClose,
  onEdit,
  onOpenCustomerHistory,
  onOpenPermissions,
}: {
  selected: Registration;
  supplierItems: SupplierInventoryItem[];
  accessForm: EmployeeAccessFormState;
  accessExisting: boolean;
  accessLoading: boolean;
  permissionUserId: string | null;
  canViewAccess: boolean;
  canViewPermissionOverrides: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onOpenCustomerHistory?: (customerId: string) => void;
  onOpenPermissions: () => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const roles = activeRegistrationRoles(selected);
  const employee = selected.employee_details?.[0];
  const employeeRecord = selected.legacy_employee;
  const canToggleAccess = hasPermission("employees.toggle_active");
  const [accessActive, setAccessActive] = useState(employeeRecord?.is_active !== false && accessForm.enabled !== false);
  const [togglingAccess, setTogglingAccess] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const activeAddresses = (selected.addresses || [])
    .filter(address => address.is_active !== false)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

  useEffect(() => {
    setAccessActive(employeeRecord?.is_active !== false && accessForm.enabled !== false);
  }, [selected.id, employeeRecord?.is_active, accessForm.enabled]);

  const toggleAccess = async () => {
    if (!activeOrganizationId || !selected.legacy_employee_id || !accessExisting || !canToggleAccess || togglingAccess) return;
    const next = !accessActive;
    setTogglingAccess(true);
    try {
      const { error } = await setEmployeeAccessActive(activeOrganizationId, selected.legacy_employee_id, next);
      if (error) throw error;
      setAccessActive(next);
      if (employeeRecord) employeeRecord.is_active = next;
      accessForm.enabled = next;
      setToast({ msg: next ? "Usuário ativado." : "Usuário inativado. O acesso ao sistema foi bloqueado.", type: "success" });
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error ? String((error as any).message || "Erro desconhecido") : String(error || "Erro desconhecido");
      setToast({ msg: `Erro ao alterar usuário: ${message}`, type: "error" });
    } finally {
      setTogglingAccess(false);
    }
  };

  return <AdminPage open onClose={onClose} breadcrumb="Cadastros" title={selected.name} subtitle={selected.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} maxW="max-w-6xl">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <div className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {roles.map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-3 py-1 text-xs font-black text-[#0057e7]">{roleLabels[role]}</span>)}
      </div>

      <Section title="Dados Pessoais"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {selected.person_type === "PF" && detailValue("Nome completo", selected.name || "—")}
        {detailValue(selected.person_type === "PJ" ? "CNPJ" : "CPF", selected.document ? (selected.person_type === "PJ" ? formatCnpj(selected.document) : formatCpf(selected.document)) : "—")}
        {detailValue("Telefone", formatPhone(selected.phone) || "—")}
        {detailValue("WhatsApp", formatPhone(selected.whatsapp) || "—")}
        {detailValue("E-mail", selected.email || "—")}
        {selected.person_type === "PJ" ? <>
          {detailValue("Nome fantasia", selected.trade_name || selected.name || "—")}
          {detailValue("Razão social", selected.legal_name || "—")}
          {detailValue("Inscrição estadual", selected.state_registration || "—")}
          {detailValue("Inscrição municipal", selected.municipal_registration || "—")}
          {detailValue("Fundação", formatDateOnly(selected.foundation_date, "—"))}
        </> : detailValue("Nascimento", formatDateOnly(selected.birth_date, "—"))}
      </div></Section>

      <Section title="Endereços">
        {activeAddresses.length ? <div className="divide-y divide-[#0d1b2e]/8">{activeAddresses.map((address, index) => {
          const mapUrl = getAddressMapUrl({
            zip_code: address.zip_code || "",
            street: address.street || "",
            number: address.number || "",
            complement: address.complement || "",
            neighborhood: address.neighborhood || "",
            city: address.city || "",
            state: address.state || "",
            shared_map_url: address.location_url || "",
          });
          return <div key={address.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-[#0d1b2e]">{address.type || `Endereço ${index + 1}`}</span>
              {address.is_primary && <span className="text-[10px] font-black uppercase tracking-wide text-[#0057e7]">Principal</span>}
              {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/20 px-3 py-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5"><MapPin size={13} /> Abrir mapa</a>}
            </div>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-[#0d1b2e]">{formatBrazilianAddress(address)}</p>
            {address.reference && <p className="mt-1 text-xs text-[#5a6a82]">Referência: {address.reference}</p>}
          </div>;
        })}</div> : <p className="text-sm text-[#5a6a82]">Não há endereço cadastrado.</p>}
      </Section>

      {roles.includes("employee") && <Section title="Geral">
        <div className="grid gap-4 sm:grid-cols-3">
          {detailValue("Cargo", employee?.job_title || "—")}
          {detailValue("Setor", employee?.team_name || "—")}
          {detailValue("Admissão", formatDateOnly(employee?.admission_date, "—"))}
        </div>
        {canViewAccess && <div className="mt-5 border-t border-[#0d1b2e]/8 pt-5" aria-busy={accessLoading}>
          <div className="mb-4 text-sm font-black text-[#0d1b2e]">Acesso ao sistema</div>
          <div className="grid gap-4 sm:grid-cols-3">
            {detailValue("Status", accessExisting ? (accessActive ? "Ativo" : "Inativo") : "Sem login")}
            {detailValue("E-mail de acesso", accessForm.email || "—")}
            {detailValue("Função vinculada", accessForm.role_id ? "Configurada" : "—")}
          </div>
        </div>}
      </Section>}

      {roles.includes("supplier") && <Section title="Itens fornecidos">
        <SupplierItemsTable items={supplierItems} />
      </Section>}
    </div>

    <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
      <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
      {roles.includes("customer") && selected.legacy_customer_id && onOpenCustomerHistory && <BtnSecondary onClick={() => onOpenCustomerHistory(selected.legacy_customer_id!)}>Ficha do cliente</BtnSecondary>}
      {roles.includes("employee") && permissionUserId && canViewPermissionOverrides && <BtnSecondary onClick={onOpenPermissions}><ShieldCheck size={15} /> Acessos e permissões</BtnSecondary>}
      {roles.includes("employee") && accessExisting && selected.legacy_employee_id && canToggleAccess && <AdminButton variant={accessActive ? "danger" : "secondary"} onClick={() => void toggleAccess()} disabled={togglingAccess}>{accessActive ? <><AlertCircle size={15} /> Inativar usuário</> : <><CheckCircle size={15} /> Ativar usuário</>}</AdminButton>}
      {canEdit && <BtnPrimary onClick={onEdit}><Edit2 size={15} /> Editar cadastro</BtnPrimary>}
    </div>
  </AdminPage>;
}
