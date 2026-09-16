import { Edit2, MapPin } from "lucide-react";
import { getAddressMapUrl } from "@/lib/address";
import { useAuth } from "@/lib/auth";
import { AdminPage, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { formatCnpj, formatCpf, formatDateOnly, formatPhone } from "@/shared/domain/formatters";
import { usernameFromAuthEmail } from "@/features/auth/domain/username";
import { activeRegistrationRoles } from "../domain/registration-form";
import type { Registration, RegistrationRole, SupplierInventoryItem } from "../infrastructure/registrations.repository";
import type { EmployeeAccessFormState } from "@/features/access/presentation/UserAccessSection";
import { SupplierItemsTable } from "./SupplierItemsTable";
import { RegistrationDetailsToolbar } from "./RegistrationDetailsToolbar";

const roleLabels: Record<RegistrationRole, string> = { customer: "Cliente", employee: "Funcionário", supplier: "Fornecedor" };

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

function formatBrazilianAddress(address: NonNullable<Registration["addresses"]>[number]) {
  const streetNumber = [address.street, address.number].filter(Boolean).join(", ");
  const complement = address.complement ? `, ${address.complement}` : "";
  const neighborhood = address.neighborhood ? ` - ${address.neighborhood}` : "";
  const cityState = [address.city, address.state].filter(Boolean).join(" - ");
  const locality = cityState ? `${streetNumber || complement || neighborhood ? ", " : ""}${cityState}` : "";
  const zipCode = address.zip_code ? `${streetNumber || complement || neighborhood || locality ? ", " : ""}CEP ${formatZipCode(address.zip_code)}` : "";
  return `${streetNumber}${complement}${neighborhood}${locality}${zipCode}`.trim() || "Endereço sem dados informados";
}

type RegistrationDetailsProps = {
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
  onOpenContacts: () => void;
  onOpenRecords: () => void;
  onOpenCustomerHistory?: (customerId: string) => void;
  onOpenPermissions: () => void;
};

export function RegistrationDetails({ selected, supplierItems, accessForm, accessExisting, accessLoading, permissionUserId, canViewAccess, canViewPermissionOverrides, canEdit, onClose, onEdit, onOpenContacts, onOpenRecords, onOpenCustomerHistory, onOpenPermissions }: RegistrationDetailsProps) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const roles = activeRegistrationRoles(selected);
  const employee = selected.employee_details?.[0];
  const employeeRecord = selected.legacy_employee;
  const accessActive = employeeRecord?.is_active !== false && accessForm.enabled !== false;
  const accessUsername = accessForm.username || usernameFromAuthEmail(accessForm.email) || "—";
  const activeAddresses = (selected.addresses || []).filter(address => address.is_active !== false).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const canManageContacts = hasPermission("registrations.contacts.manage");
  const canViewContacts = hasPermission("registrations.contacts.view") || canManageContacts;
  const canCreateRecords = hasPermission("registrations.records.create");
  const canViewRecords = hasPermission("registrations.records.view") || canCreateRecords;
  const canOpenPermissions = roles.includes("employee") && Boolean(permissionUserId) && canViewPermissionOverrides;

  return <AdminPage open onClose={onClose} breadcrumb="Cadastros" title={selected.name} subtitle={selected.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} maxW="max-w-7xl">
    <div className="space-y-5 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-3 py-1">
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
          {roles.map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-3 py-1 text-xs font-black text-[#0057e7]">{roleLabels[role]}</span>)}
        </div>
        <div className="hidden h-7 w-px shrink-0 bg-[#0d1b2e]/14 sm:block" aria-hidden="true" />
        <RegistrationDetailsToolbar
          canViewContacts={Boolean(activeOrganizationId && canViewContacts)}
          canViewRecords={Boolean(activeOrganizationId && canViewRecords)}
          canViewPermissions={canOpenPermissions}
          onOpenContacts={onOpenContacts}
          onOpenRecords={onOpenRecords}
          onOpenPermissions={onOpenPermissions}
        />
      </div>

      <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,34rem),1fr))]">
        <Section title="Dados Pessoais"><div className="grid gap-4 sm:grid-cols-2">
          {selected.person_type === "PF" && detailValue("Nome completo", selected.name || "—")}
          {detailValue(selected.person_type === "PJ" ? "CNPJ" : "CPF", selected.document ? (selected.person_type === "PJ" ? formatCnpj(selected.document) : formatCpf(selected.document)) : "—")}
          {detailValue("Telefone", formatPhone(selected.phone) || "—")}
          {detailValue("WhatsApp", formatPhone(selected.whatsapp) || "—")}
          {detailValue("E-mail de contato", selected.email || "—")}
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
            const mapUrl = getAddressMapUrl({ zip_code: address.zip_code || "", street: address.street || "", number: address.number || "", complement: address.complement || "", neighborhood: address.neighborhood || "", city: address.city || "", state: address.state || "", shared_map_url: address.location_url || "" });
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
        </Section>}

        {roles.includes("employee") && canViewAccess && <Section title="Acesso ao sistema">
          <div aria-busy={accessLoading}>
            {accessLoading ? <LoadingState text="Carregando acesso ao sistema..." /> : <div className="grid gap-4 sm:grid-cols-2">
              {detailValue("Status", accessExisting ? (accessActive ? "Ativo" : "Inativo") : "Sem login")}
              {detailValue("Usuário", accessUsername)}
              {detailValue("Função vinculada", accessForm.role_id ? "Configurada" : "—")}
              {detailValue("Restrição por IP", accessForm.restrict_by_ip ? "Ativada" : "Desativada")}
              {accessForm.restrict_by_ip && <div className="sm:col-span-2">{detailValue("IPs permitidos", accessForm.allowed_ips.split("\n").filter(Boolean).join(", ") || "—")}</div>}
            </div>}
          </div>
        </Section>}

        {roles.includes("supplier") && <SupplierItemsTable items={supplierItems} />}
      </div>
    </div>

    <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
      <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
      {roles.includes("customer") && selected.legacy_customer_id && onOpenCustomerHistory && <BtnSecondary onClick={() => onOpenCustomerHistory(selected.legacy_customer_id!)}>Ficha do cliente</BtnSecondary>}
      {canEdit && <BtnPrimary onClick={onEdit}><Edit2 size={15} /> Editar cadastro</BtnPrimary>}
    </div>
  </AdminPage>;
}
