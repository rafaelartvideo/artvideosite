import { useEffect, useState } from "react";
import { ArrowLeft, Building2, CheckCircle, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCompanySettingsQuery, useSaveCompanySettingsMutation } from "./useCompanySettingsQuery";
import { lookupCompanyByCnpj } from "../infrastructure/company-registry.gateway";
import { AdminButton, AdminCard, AdminPage, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FPhoneInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { formatCnpj, formatPhone, isValidBrazilianPhone, isValidCnpj, isValidEmail } from "@/shared/domain/formatters";
import { formatZipCode } from "@/lib/address";

type CompanyForm = {
  company_name: string;
  company_legal_name: string;
  company_cnpj: string;
  company_phone: string;
  company_email: string;
  company_zip_code: string;
  company_street: string;
  company_number: string;
  company_complement: string;
  company_neighborhood: string;
  company_city: string;
  company_state: string;
  company_logo_media_id: string;
  company_menu_logo_media_id: string;
};

const EMPTY_COMPANY: CompanyForm = {
  company_name: "", company_legal_name: "", company_cnpj: "", company_phone: "", company_email: "",
  company_zip_code: "", company_street: "", company_number: "", company_complement: "",
  company_neighborhood: "", company_city: "", company_state: "", company_logo_media_id: "",
  company_menu_logo_media_id: "",
};
const COMPANY_KEYS = Object.keys(EMPTY_COMPANY) as Array<keyof CompanyForm>;
const settingText = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export function TabSettings({ routeResourceId, onRouteChange }: {
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null) => void;
}) {
  const { user, hasPermission, activeOrganizationId, activeOrganization } = useAuth();
  const canView = hasPermission("settings.view");
  const canViewDetails = hasPermission("settings.details.view");
  const canUpdate = hasPermission("settings.update");
  const canLookupCnpj = hasPermission("settings.lookup_cnpj");
  const query = useCompanySettingsQuery(activeOrganizationId);
  const saveSettings = useSaveCompanySettingsMutation();
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY);
  const [lookingUp, setLookingUp] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const companyOpen = routeResourceId === "company" && canViewDetails;
  const busy = lookingUp || saveSettings.isPending;
  const isPartnerOrganization = activeOrganization?.organization_type === "partner";
  const canEditOfficialData = canUpdate;
  const canEditContacts = canUpdate;
  const canEditBranding = canUpdate;

  useEffect(() => {
    if (!query.data) return;
    const loaded = Object.fromEntries(COMPANY_KEYS.map((key) => [key, settingText(query.data?.[key])])) as CompanyForm;
    setForm({
      ...loaded,
      company_cnpj: formatCnpj(loaded.company_cnpj),
      company_phone: formatPhone(loaded.company_phone),
      company_zip_code: formatZipCode(loaded.company_zip_code),
      company_state: loaded.company_state.toUpperCase().slice(0, 2),
    });
  }, [query.data]);

  const update = (key: keyof CompanyForm, value: string) => {
    if (!canUpdate || busy) return;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const lookupCnpj = async () => {
    if (!canLookupCnpj || !canEditOfficialData || busy) return;
    if (!isValidCnpj(form.company_cnpj)) {
      setToast({ msg: "Informe um CNPJ válido antes de consultar.", type: "error" });
      return;
    }
    setLookingUp(true);
    try {
      const company = await lookupCompanyByCnpj(form.company_cnpj);
      setForm((current) => ({
        ...current,
        company_cnpj: formatCnpj(company.cnpj),
        company_legal_name: company.legalName,
        company_name: company.tradeName || company.legalName,
        company_phone: formatPhone(company.phone),
        company_email: company.email,
        company_zip_code: formatZipCode(company.zipCode),
        company_street: company.street,
        company_number: company.number,
        company_complement: company.complement,
        company_neighborhood: company.neighborhood,
        company_city: company.city,
        company_state: company.state.toUpperCase().slice(0, 2),
      }));
      setToast({ msg: "Dados do CNPJ preenchidos. Confira antes de salvar.", type: "success" });
    } catch (error) {
      setToast({ msg: error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.", type: "error" });
    } finally {
      setLookingUp(false);
    }
  };

  const save = async () => {
    if (!canUpdate || busy || !activeOrganizationId) return;
    if (!form.company_name.trim()) {
      setToast({ msg: "Informe o nome da empresa.", type: "error" });
      return;
    }
    if (form.company_cnpj && !isValidCnpj(form.company_cnpj)) {
      setToast({ msg: "CNPJ inválido. Verifique os números informados.", type: "error" });
      return;
    }
    if (form.company_phone && !isValidBrazilianPhone(form.company_phone)) {
      setToast({ msg: "Telefone inválido. Informe DDD e número válidos.", type: "error" });
      return;
    }
    if (form.company_email && !isValidEmail(form.company_email)) {
      setToast({ msg: "E-mail inválido. Verifique o endereço informado.", type: "error" });
      return;
    }
    if (form.company_zip_code && form.company_zip_code.replace(/\D/g, "").length !== 8) {
      setToast({ msg: "CEP inválido. Informe os 8 dígitos.", type: "error" });
      return;
    }
    try {
      await saveSettings.mutateAsync({ organizationId: activeOrganizationId, settings: form, updatedBy: user?.id ?? null });
      setToast({ msg: "Dados da empresa salvos com sucesso.", type: "success" });
    } catch (error) {
      setToast({ msg: error instanceof Error ? error.message : "Não foi possível salvar os dados.", type: "error" });
    }
  };

  if (!canView) return null;
  if (query.isPending) return <LoadingState />;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Configurações" subtitle="Gerencie as informações institucionais da empresa ativa." />
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {canViewDetails && <AdminCard className="group min-w-0 transition-all hover:border-[#0057e7]/40 hover:shadow-md">
        <AdminButton variant="ghost" type="button" onClick={() => onRouteChange?.("company")} className="h-auto w-full min-w-0 flex-col items-stretch whitespace-normal rounded-none p-0 text-left hover:bg-transparent">
          <div className="min-w-0 px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex min-w-0 items-start justify-between gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8eef8] text-[#0057e7] transition-colors group-hover:bg-[#0057e7] group-hover:text-white"><Building2 size={18} /></div><ArrowLeft size={15} className="shrink-0 rotate-180 text-[#5a6a82] transition-colors group-hover:text-[#0057e7]" /></div>
            <h3 className="mt-4 min-w-0 whitespace-normal break-words text-base font-black leading-tight text-[#0d1b2e]">Dados da empresa</h3>
            <p className="mt-1.5 min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-sm font-normal leading-5 text-[#5a6a82]">Nome, CNPJ, contatos, endereço e logo usados nos documentos desta empresa.</p>
            <span className="mt-4 inline-block text-xs font-bold text-[#0057e7]">Acessar módulo</span>
          </div>
        </AdminButton>
      </AdminCard>}
    </div>

    <AdminPage open={companyOpen} onClose={() => { if (!busy) onRouteChange?.(null); }} breadcrumb="Configurações" title="Dados da empresa" subtitle="Informações oficiais utilizadas nos documentos e na identificação da empresa ativa." maxW="max-w-6xl">
      <div className="min-w-0 space-y-5 p-4 sm:p-5">
        {isPartnerOrganization && <div className="rounded-xl border border-[#0057e7]/15 bg-[#eef5ff] px-4 py-3 text-sm leading-6 text-[#35506f]">Estas informações são administradas pelo administrador da empresa.</div>}
        <Section title="Identificação"><div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-w-0"><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">CNPJ</label><div className="flex min-w-0 flex-col gap-2 sm:flex-row"><FInput label="" inputMode="numeric" maxLength={18} value={form.company_cnpj} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_cnpj", formatCnpj(event.target.value))} placeholder="00.000.000/0000-00" className="min-w-0 flex-1" />{canEditOfficialData && canLookupCnpj && <AdminButton variant="secondary" onClick={lookupCnpj} loading={lookingUp} loadingText="Consultando..." disabled={saveSettings.isPending}><Search size={15} /> Consultar CNPJ</AdminButton>}</div><p className="mt-2 break-words text-xs leading-relaxed text-[#718096]">A consulta preenche automaticamente os dados públicos disponíveis. Revise antes de salvar.</p></div>
          <FInput label="Nome da empresa / Nome fantasia" value={form.company_name} required disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_name", event.target.value)} />
          <FInput label="Razão social" value={form.company_legal_name} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_legal_name", event.target.value)} />
          <FPhoneInput label="Telefone" value={form.company_phone} disabled={!canEditContacts || busy} onChange={(event: any) => update("company_phone", event.target.value)} />
          <FInput label="E-mail" type="email" autoComplete="email" value={form.company_email} disabled={!canEditContacts || busy} onChange={(event: any) => update("company_email", event.target.value.trimStart())} />
        </div></Section>
        <Section title="Endereço"><div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <FInput label="CEP" inputMode="numeric" maxLength={9} placeholder="00000-000" value={form.company_zip_code} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_zip_code", formatZipCode(event.target.value))} />
          <FInput label="Rua / Logradouro" value={form.company_street} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_street", event.target.value)} />
          <FInput label="Número" inputMode="numeric" value={form.company_number} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_number", event.target.value.replace(/[^0-9A-Za-z/-]/g, ""))} />
          <FInput label="Complemento" value={form.company_complement} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_complement", event.target.value)} />
          <FInput label="Bairro" value={form.company_neighborhood} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_neighborhood", event.target.value)} />
          <FInput label="Cidade" value={form.company_city} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_city", event.target.value)} />
          <FInput label="Estado / UF" maxLength={2} value={form.company_state} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_state", event.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2))} />
        </div></Section>
        <Section title="Identidade visual"><div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <ImageUpload photoActions bucket="public-assets" organizationId={activeOrganizationId} currentMediaId={form.company_logo_media_id} onUpload={(mediaId) => update("company_logo_media_id", mediaId)} canUpload={canEditBranding && !busy} label="Logo utilizada nos documentos" />
          <ImageUpload photoActions bucket="public-assets" organizationId={activeOrganizationId} currentMediaId={form.company_menu_logo_media_id} onUpload={(mediaId) => update("company_menu_logo_media_id", mediaId)} canUpload={canEditBranding && !busy} label="Logo do menu" />
        </div></Section>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={() => onRouteChange?.(null)} disabled={busy}>Voltar</BtnSecondary>{canUpdate && <BtnPrimary onClick={save} loading={saveSettings.isPending} loadingText="Salvando..." disabled={lookingUp}><CheckCircle size={15} /> Salvar dados</BtnPrimary>}</div>
    </AdminPage>
  </div>;
}
