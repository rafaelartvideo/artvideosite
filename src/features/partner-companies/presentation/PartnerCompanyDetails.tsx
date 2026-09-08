import { Building2, Edit2 } from "lucide-react";
import { AdminCard, AdminCardContent, AdminCardHeader, BtnSecondary, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { PartnerCompanyUsersSection } from "./PartnerCompanyUsersSection";
import { PartnerCompanyPermissionsSection } from "./PartnerCompanyPermissionsSection";

function statusLabel(value:string){return value==="active"?"Ativa":value==="suspended"?"Suspensa":"Cancelada";}

export function PartnerCompanyDetails({ company, canEdit, onBack, onEdit }: { company:any; canEdit:boolean; onBack:()=>void; onEdit:()=>void }) {
  const settings=company.settings||{};
  return <div className="min-w-0 space-y-5">
    <PageHeader title={company.name} subtitle="Detalhes e configurações da empresa parceira." actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack}/>{canEdit&&<BtnSecondary onClick={onEdit}><Edit2 size={14}/> Editar</BtnSecondary>}</div>}/>
    <AdminCard>
      <AdminCardHeader><div className="flex items-center gap-2"><Building2 size={17} className="text-[#0057e7]"/><div><h3 className="text-sm font-black text-[#0d1b2e]">Dados da empresa</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Informações cadastrais principais.</p></div></div></AdminCardHeader>
      <AdminCardContent><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{settings.person_type==="PF"?"Pessoa Física":"Pessoa Jurídica"}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">CPF/CNPJ</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{company.document||"—"}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Status</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{statusLabel(company.status)}</p></div>
        {company.legal_name&&<div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Razão social</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{company.legal_name}</p></div>}
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Telefone</p><p className="mt-1 text-sm text-[#0d1b2e]">{settings.phone||"—"}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">E-mail</p><p className="mt-1 text-sm text-[#0d1b2e]">{settings.email||"—"}</p></div>
        <div className="sm:col-span-2 lg:col-span-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Endereço</p><p className="mt-1 text-sm text-[#0d1b2e]">{[settings.street,settings.number,settings.neighborhood,settings.city,settings.state,settings.zip_code].filter(Boolean).join(", ")||"—"}</p></div>
      </div></AdminCardContent>
    </AdminCard>
    <PartnerCompanyUsersSection organizationId={company.id} companyStatus={company.status}/>
    <PartnerCompanyPermissionsSection organizationId={company.id}/>
  </div>;
}
