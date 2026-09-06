import { useEffect, useState } from "react";
import { ArrowLeft, Building2, CheckCircle, Clock, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSaveSiteSettingsMutation, useSiteSettingsQuery } from "./useSiteSettingsQuery";
import { lookupCompanyByCnpj } from "../infrastructure/company-registry.gateway";
import { AdminButton, AdminCard, AdminPage, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
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
};

const EMPTY_COMPANY: CompanyForm = {
  company_name: "", company_legal_name: "", company_cnpj: "", company_phone: "", company_email: "",
  company_zip_code: "", company_street: "", company_number: "", company_complement: "",
  company_neighborhood: "", company_city: "", company_state: "", company_logo_media_id: "",
};
const COMPANY_KEYS = Object.keys(EMPTY_COMPANY) as Array<keyof CompanyForm>;
const settingText = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export function TabSettings({ routeResourceId, onRouteChange }: {
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null) => void;
}) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("settings.view");
  const canViewDetails = hasPermission("settings.details.view");
  const canUpdate = hasPermission("settings.update");
  const canLookupCnpj = hasPermission("settings.lookup_cnpj");
  const query = useSiteSettingsQuery();
  const saveSettings = useSaveSiteSettingsMutation();
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY);
  const [lookingUp, setLookingUp] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const companyOpen = routeResourceId === "company" && canViewDetails;

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
    if (!canUpdate) return;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const lookupCnpj = async () => {
    if (!canLookupCnpj || !canUpdate) return;
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
    if (!canUpdate) return;
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
      await saveSettings.mutateAsync({ settings: form, updatedBy: user?.id ?? null });
      setToast({ msg: "Dados da empresa salvos com sucesso.", type: "success" });
    } catch (error) {
      setToast({ msg: error instanceof Error ? error.message : "Não foi possível salvar os dados.", type: "error" });
    }
  };

  if (!canView) return null;
  if (query.isPending) return <LoadingState />;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Configurações" subtitle="Gerencie as informações institucionais e configurações do site." />
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {canViewDetails && <AdminCard className="group min-w-0 transition-all hover:border-[#0057e7]/40 hover:shadow-md">
        <AdminButton variant="ghost" type="button" onClick={() => onRouteChange?.("company")} className="h-auto w-full min-w-0 flex-col items-stretch whitespace-normal rounded-none p-0 text-left hover:bg-transparent">
          <div className="min-w-0 px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex min-w-0 items-start justify-between gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8eef8] text-[#0057e7] transition-colors group-hover:bg-[#0057e7] group-hover:text-white"><Building2 size={18} /></div><ArrowLeft size={15} className="shrink-0 rotate-180 text-[#5a6a82] transition-colors group-hover:text-[#0057e7]" /></div>
            <h3 className="mt-4 min-w-0 whitespace-normal break-words text-base font-black leading-tight text-[#0d1b2e]">Dados da empresa</h3>
            <p className="mt-1.5 min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-sm font-normal leading-5 text-[#5a6a82]">Nome, CNPJ, contatos, endereço e logo usados no site e nos documentos.</p>
            <span className="mt-4 inline-block text-xs font-bold text-[#0057e7]">Acessar módulo</span>
          </div>
        </AdminButton>
      </AdminCard>}
    </div>

    <AdminPage open={companyOpen} onClose={() => onRouteChange?.(null)} breadcrumb="Configurações" title="Dados da empresa" subtitle="Informações oficiais utilizadas no site e nos documentos impressos." maxW="max-w-6xl">
      <div className="min-w-0 space-y-5 p-4 sm:p-5">
        <Section title="Identificação"><div className="grid min-w-0 gap-4 md:grid-cols-2">
          <div className="min-w-0 md:col-span-2"><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">CNPJ</label><div className="flex min-w-0 flex-col gap-2 sm:flex-row"><FInput label="" inputMode="numeric" maxLength={18} value={form.company_cnpj} disabled={!canUpdate} onChange={(event: any) => update("company_cnpj", formatCnpj(event.target.value))} placeholder="00.000.000/0000-00" className="min-w-0 flex-1" />{canUpdate && canLookupCnpj && <AdminButton variant="secondary" onClick={() => void lookupCnpj()} disabled={lookingUp}><Search size={15} />{lookingUp ? "Consultando..." : "Consultar CNPJ"}</AdminButton>}</div><p className="mt-2 break-words text-xs leading-relaxed text-[#718096]">A consulta preenche automaticamente os dados públicos disponíveis. Revise antes de salvar.</p></div>
          <FInput label="Nome da empresa / Nome fantasia" value={form.company_name} required disabled={!canUpdate} onChange={(event: any) => update("company_name", event.target.value)} /><FInput label="Razão social" value={form.company_legal_name} disabled={!canUpdate} onChange={(event: any) => update("company_legal_name", event.target.value)} /><FInput label="Telefone" inputMode="tel" maxLength={16} placeholder="(79) 9 9999-9999" value={form.company_phone} disabled={!canUpdate} onChange={(event: any) => update("company_phone", formatPhone(event.target.value))} /><FInput label="E-mail" type="email" autoComplete="email" value={form.company_email} disabled={!canUpdate} onChange={(event: any) => update("company_email", event.target.value.trimStart())} />
        </div></Section>
        <Section title="Endereço"><div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4"><FInput label="CEP" inputMode="numeric" maxLength={9} placeholder="00000-000" value={form.company_zip_code} disabled={!canUpdate} onChange={(event: any) => update("company_zip_code", formatZipCode(event.target.value))} /><div className="min-w-0 lg:col-span-2"><FInput label="Rua / Logradouro" value={form.company_street} disabled={!canUpdate} onChange={(event: any) => update("company_street", event.target.value)} /></div><FInput label="Número" inputMode="numeric" value={form.company_number} disabled={!canUpdate} onChange={(event: any) => update("company_number", event.target.value.replace(/[^0-9A-Za-z/-]/g, ""))} /><div className="min-w-0 lg:col-span-2"><FInput label="Complemento" value={form.company_complement} disabled={!canUpdate} onChange={(event: any) => update("company_complement", event.target.value)} /></div><div className="min-w-0 lg:col-span-2"><FInput label="Bairro" value={form.company_neighborhood} disabled={!canUpdate} onChange={(event: any) => update("company_neighborhood", event.target.value)} /></div><div className="min-w-0 lg:col-span-2"><FInput label="Cidade" value={form.company_city} disabled={!canUpdate} onChange={(event: any) => update("company_city", event.target.value)} /></div><FInput label="Estado / UF" maxLength={2} value={form.company_state} disabled={!canUpdate} onChange={(event: any) => update("company_state", event.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2))} /></div></Section>
        <Section title="Logo da empresa"><ImageUpload bucket="public-assets" currentMediaId={form.company_logo_media_id} onUpload={(mediaId) => update("company_logo_media_id", mediaId)} canUpload={canUpdate} label="Logo utilizada nos documentos" /></Section>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={() => onRouteChange?.(null)}>Voltar</BtnSecondary>{canUpdate && <BtnPrimary onClick={() => void save()} disabled={saveSettings.isPending}>{saveSettings.isPending ? <Clock size={15} /> : <CheckCircle size={15} />}{saveSettings.isPending ? "Salvando..." : "Salvar dados"}</BtnPrimary>}</div>
    </AdminPage>
  </div>;
}
