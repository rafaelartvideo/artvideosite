import { Edit2, MapPin, ShieldCheck } from "lucide-react";
import { getAddressMapUrl } from "@/lib/address";
import { AdminPage, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { formatCnpj, formatCpf, formatDateOnly, formatPhone } from "@/shared/domain/formatters";
import { activeRegistrationRoles } from "../domain/registration-form";
import type { Registration, RegistrationRole, SupplierInventoryItem } from "../infrastructure/registrations.repository";
import type { EmployeeAccessFormState } from "@/features/access/presentation/UserAccessSection";

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
  const roles = activeRegistrationRoles(selected);
  const employee = selected.employee_details?.[0];
  const activeAddresses = (selected.addresses || [])
    .filter(address => address.is_active !== false)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

  return <AdminPage open onClose={onClose} breadcrumb="Cadastros" title={selected.name} subtitle={selected.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} maxW="max-w-6xl">
    <div className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {roles.map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-3 py-1 text-xs font-black text-[#0057e7]">{roleLabels[role]}</span>)}
        <StatusBadge status={selected.is_active ? "Ativo" : "Inativo"} />
      </div>

      <Section title="Informações"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        {activeAddresses.length ? <div className="space-y-3">{activeAddresses.map((address, index) => {
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
          return <div key={address.id} className="rounded-xl border border-[#0d1b2e]/10 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-[#0d1b2e]">{address.type || `Endereço ${index + 1}`}</span>
              {address.is_primary && <span className="rounded-full bg-[#eaf2ff] px-2 py-1 text-[10px] font-black text-[#0057e7]">Principal</span>}
              {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-3 py-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5"><MapPin size={13} /> Abrir mapa</a>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {detailValue("CEP", address.zip_code || "—")}
              {detailValue("Rua", address.street || "—")}
              {detailValue("Número", address.number || "—")}
              {detailValue("Complemento", address.complement || "—")}
              {detailValue("Bairro", address.neighborhood || "—")}
              {detailValue("Cidade / UF", [address.city, address.state].filter(Boolean).join(" / ") || "—")}
              {detailValue("Referência", address.reference || "—")}
            </div>
          </div>;
        })}</div> : <p className="text-sm text-[#5a6a82]">Nenhum endereço cadastrado.</p>}
      </Section>

      {roles.includes("employee") && <Section title="Funcionário"><div className="grid gap-4 sm:grid-cols-3">
        {detailValue("Cargo", employee?.job_title || "—")}
        {detailValue("Setor", employee?.team_name || "—")}
        {detailValue("Admissão", formatDateOnly(employee?.admission_date, "—"))}
      </div></Section>}

      {roles.includes("employee") && canViewAccess && <Section title="Acesso ao sistema">
        {accessLoading ? <LoadingState text="Carregando acesso..." /> : <div className="grid gap-4 sm:grid-cols-3">
          {detailValue("Status", accessExisting ? (accessForm.enabled ? "Habilitado" : "Bloqueado") : "Sem login")}
          {detailValue("E-mail de acesso", accessForm.email || "—")}
          {detailValue("Função vinculada", accessForm.role_id ? "Configurada" : "—")}
        </div>}
      </Section>}

      {roles.includes("supplier") && <Section title="Itens fornecidos">
        {supplierItems.length ? <div className="grid gap-2 md:grid-cols-2">{supplierItems.map(item => <div key={item.id} className="rounded-xl border border-[#0d1b2e]/10 bg-white p-3"><div className="text-sm font-bold text-[#0d1b2e]">{item.name}</div><div className="mt-1 text-xs text-[#5a6a82]">{item.sku ? `SKU ${item.sku}` : "Sem SKU"}</div></div>)}</div> : <p className="text-sm text-[#5a6a82]">Nenhum item do estoque vinculado.</p>}
      </Section>}
    </div>

    <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
      <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
      {roles.includes("customer") && selected.legacy_customer_id && onOpenCustomerHistory && <BtnSecondary onClick={() => onOpenCustomerHistory(selected.legacy_customer_id!)}>Ficha do cliente</BtnSecondary>}
      {roles.includes("employee") && permissionUserId && canViewPermissionOverrides && <BtnSecondary onClick={onOpenPermissions}><ShieldCheck size={15} /> Acessos e permissões</BtnSecondary>}
      {canEdit && <BtnPrimary onClick={onEdit}><Edit2 size={15} /> Editar cadastro</BtnPrimary>}
    </div>
  </AdminPage>;
}
