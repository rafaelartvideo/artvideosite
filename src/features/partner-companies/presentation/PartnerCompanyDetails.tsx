import { useState } from "react";
import { Edit2, MapPin, MessageCircle, Phone } from "lucide-react";
import { getAddressMapUrl } from "@/lib/address";
import { cn, normalizeDigits } from "@/shared/domain/formatters";
import { AdminCard, AdminCardContent, AdminCardHeader, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { PartnerCompanyUsersSection } from "./PartnerCompanyUsersSection";
import { PartnerCompanyPermissionsSection } from "./PartnerCompanyPermissionsSection";
import { PartnerCompanySharedDataSection } from "./PartnerCompanySharedDataSection";

type CompanySection = "general" | "users" | "access" | "data";

const COMPANY_SECTIONS: Array<{ key: CompanySection; label: string }> = [
  { key: "general", label: "GERAL" },
  { key: "users", label: "USUÁRIOS" },
  { key: "access", label: "ACESSOS" },
  { key: "data", label: "DADOS" },
];

function statusLabel(value: string) {
  return value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : "Cancelada";
}

function brazilPhoneDigits(value?: string | null) {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  return (digits.length === 10 || digits.length === 11) && !digits.startsWith("55") ? `55${digits}` : digits;
}

export function PartnerCompanyDetails({ company, canEdit, onBack, onEdit }: { company: any; canEdit: boolean; onBack: () => void; onEdit: () => void }) {
  const [activeSection, setActiveSection] = useState<CompanySection>("general");
  const settings = company.settings || {};
  const phone = brazilPhoneDigits(settings.phone || settings.whatsapp);
  const whatsapp = brazilPhoneDigits(settings.whatsapp || settings.phone);
  const telUrl = phone ? `tel:+${phone}` : "";
  const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp}` : "";
  const mapUrl = getAddressMapUrl({
    street: settings.street || "",
    number: settings.number || "",
    complement: settings.complement || "",
    neighborhood: settings.neighborhood || "",
    city: settings.city || "",
    state: settings.state || "",
    zip_code: settings.zip_code || "",
  });
  const actionClass = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold normal-case tracking-normal transition-colors sm:h-auto sm:w-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5";
  const actionLabelClass = "hidden sm:inline";

  return <div className="min-w-0 space-y-5">
    <PageHeader
      title={company.name}
      subtitle="Detalhes e configurações da empresa parceira."
      actions={<InternalBackButton onBack={onBack} />}
    />

    <div className="overflow-x-auto border-b border-[#0d1b2e]/10">
      <nav className="flex min-w-max items-center gap-6" aria-label="Seções da empresa parceira">
        {COMPANY_SECTIONS.map(section => <button
          key={section.key}
          type="button"
          onClick={() => setActiveSection(section.key)}
          className={cn(
            "border-b-2 px-1 py-3 text-xs font-black transition-colors",
            activeSection === section.key ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]",
          )}
        >{section.label}</button>)}
      </nav>
    </div>

    {activeSection === "general" && <AdminCard>
      <AdminCardHeader>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-[#0d1b2e]">Dados da empresa</h3>
          <p className="mt-0.5 truncate text-xs text-[#5a6a82]">Informações cadastrais principais.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer" aria-label="Abrir endereço da empresa no mapa" title="Abrir endereço no mapa" className={`${actionClass} border-[#0057e7]/20 bg-white text-[#0057e7] hover:bg-[#eef5ff]`}><MapPin size={14} /><span className={actionLabelClass}>Mapa</span></a> : <button type="button" disabled aria-label="Endereço não disponível" title="Endereço não disponível" className={`${actionClass} cursor-not-allowed border-[#0d1b2e]/10 text-[#94a0b0] opacity-60`}><MapPin size={14} /><span className={actionLabelClass}>Mapa</span></button>}
          {telUrl ? <a href={telUrl} aria-label="Ligar para a empresa" title="Abrir no telefone ou aplicativo de telefonia" className={`${actionClass} border-[#0057e7]/20 bg-white text-[#0057e7] hover:bg-[#eef5ff]`}><Phone size={14} /><span className={actionLabelClass}>Ligar</span></a> : <button type="button" disabled aria-label="Telefone não disponível" title="Telefone não disponível" className={`${actionClass} cursor-not-allowed border-[#0d1b2e]/10 text-[#94a0b0] opacity-60`}><Phone size={14} /><span className={actionLabelClass}>Ligar</span></button>}
          {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp da empresa" title="Abrir conversa no WhatsApp" className={`${actionClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}><MessageCircle size={14} /><span className={actionLabelClass}>WhatsApp</span></a> : <button type="button" disabled aria-label="WhatsApp não disponível" title="WhatsApp não disponível" className={`${actionClass} cursor-not-allowed border-[#0d1b2e]/10 text-[#94a0b0] opacity-60`}><MessageCircle size={14} /><span className={actionLabelClass}>WhatsApp</span></button>}
          {canEdit && <button type="button" onClick={onEdit} aria-label="Editar dados da empresa" title="Editar dados da empresa" className={`${actionClass} border-[#0057e7]/20 bg-white text-[#0057e7] hover:bg-[#eef5ff]`}><Edit2 size={14} /><span className={actionLabelClass}>Editar</span></button>}
        </div>
      </AdminCardHeader>

      <AdminCardContent><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{settings.person_type === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">CPF/CNPJ</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{company.document || "—"}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Status</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{statusLabel(company.status)}</p></div>
        {company.legal_name && <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Razão social</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{company.legal_name}</p></div>}
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Telefone</p><p className="mt-1 text-sm text-[#0d1b2e]">{settings.phone || "—"}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">WhatsApp</p><p className="mt-1 text-sm text-[#0d1b2e]">{settings.whatsapp || "—"}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">E-mail</p><p className="mt-1 text-sm text-[#0d1b2e]">{settings.email || "—"}</p></div>
        <div className="sm:col-span-2 lg:col-span-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Endereço</p><p className="mt-1 text-sm text-[#0d1b2e]">{[settings.street, settings.number, settings.neighborhood, settings.city, settings.state, settings.zip_code].filter(Boolean).join(", ") || "—"}</p></div>
      </div></AdminCardContent>
    </AdminCard>}

    {activeSection === "users" && <PartnerCompanyUsersSection organizationId={company.id} companyStatus={company.status} />}
    {activeSection === "access" && <PartnerCompanyPermissionsSection organizationId={company.id} />}
    {activeSection === "data" && <PartnerCompanySharedDataSection organizationId={company.id} />}
  </div>;
}
