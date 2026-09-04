import { useEffect, useState } from "react";
import { ArrowLeft, Building2, CheckCircle, Clock, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSaveSiteSettingsMutation, useSiteSettingsQuery } from "./useSiteSettingsQuery";
import { lookupCompanyByCnpj } from "../infrastructure/company-registry.gateway";
import { AdminButton, AdminCard, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";

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
const maskCnpj = (value: string) => value.replace(/\D/g, "").slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
const maskZipCode = (value: string) => value.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

export function TabSettings({ onBack, routeResourceId, onRouteChange }: {
  onBack: () => void;
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null) => void;
}) {
  const { user, hasPermission } = useAuth();
  const query = useSiteSettingsQuery();
  const saveSettings = useSaveSiteSettingsMutation();
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY);
  const [lookingUp, setLookingUp] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const companyOpen = routeResourceId === "company";

  useEffect(() => {
    if (!query.data) return;
    setForm(Object.fromEntries(COMPANY_KEYS.map((key) => [key, settingText(query.data?.[key])])) as CompanyForm);
  }, [query.data]);

  const update = (key: keyof CompanyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const lookupCnpj = async () => {
    setLookingUp(true);
    try {
      const company = await lookupCompanyByCnpj(form.company_cnpj);
      setForm((current) => ({
        ...current,
        company_cnpj: maskCnpj(company.cnpj),
        company_legal_name: company.legalName,
        company_name: company.tradeName || company.legalName,
        company_phone: company.phone,
        company_email: company.email,
        company_zip_code: maskZipCode(company.zipCode),
        company_street: company.street,
        company_number: company.number,
        company_complement: company.complement,
        company_neighborhood: company.neighborhood,
        company_city: company.city,
        company_state: company.state,
      }));
      setToast({ msg: "Dados do CNPJ preenchidos. Confira antes de salvar.", type: "success" });
    } catch (error) {
      setToast({ msg: error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.", type: "error" });
    } finally {
      setLookingUp(false);
    }
  };

  const save = async () => {
    if (!form.company_name.trim()) {
      setToast({ msg: "Informe o nome da empresa.", type: "error" });
      return;
    }
    try {
      await saveSettings.mutateAsync({ settings: form, updatedBy: user?.id ?? null });
      setToast({ msg: "Dados da empresa salvos com sucesso.", type: "success" });
    } catch (error) {
      setToast({ msg: error instanceof Error ? error.message : "Não foi possível salvar os dados.", type: "error" });
    }
  };

  if (query.isPending) return <LoadingState />;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title="Configurações"
      subtitle="Gerencie as informações institucionais e configurações do site."
      actions={<InternalBackButton onBack={onBack} />}
    />
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <AdminCard className="group min-w-0 transition-all hover:border-[#0057e7]/40 hover:shadow-md">
        <AdminButton variant="ghost" type="button" onClick={() => onRouteChange?.("company")} className="h-auto w-full min-w-0 flex-col items-stretch whitespace-normal rounded-none p-0 text-left hover:bg-transparent">
          <div className="min-w-0 p-5 sm:p-6">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e8eef8] text-[#0057e7] transition-colors group-hover:bg-[#0057e7] group-hover:text-white">
                <Building2 size={20} />
              </div>
              <ArrowLeft size={16} className="shrink-0 rotate-180 text-[#5a6a82] transition-colors group-hover:text-[#0057e7]" />
            </div>
            <h3 className="mt-5 break-words text-base font-black leading-tight text-[#0d1b2e]">Dados da empresa</h3>
            <p className="mt-2 max-w-full break-words text-sm font-normal leading-6 text-[#5a6a82]">Nome, CNPJ, contatos, endereço e logo usados no site e nos documentos.</p>
            <span className="mt-5 inline-block text-xs font-bold text-[#0057e7]">Acessar módulo</span>
          </div>
        </AdminButton>
      </AdminCard>
    </div>

    <AdminPage open={companyOpen} onClose={() => onRouteChange?.(null)} breadcrumb="Configurações" title="Dados da empresa" subtitle="Informações oficiais utilizadas no site e nos documentos impressos." maxW="max-w-6xl">
      <div className="min-w-0 space-y-5 p-4 sm:p-5">
        <Section title="Identificação">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="min-w-0 md:col-span-2">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">CNPJ</label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <FInput label="" value={form.company_cnpj} onChange={(event: any) => update("company_cnpj", maskCnpj(event.target.value))} placeholder="00.000.000/0000-00" className="min-w-0 flex-1" />
                <BtnSecondary onClick={() => void lookupCnpj()} disabled={lookingUp}><Search size={15} />{lookingUp ? "Consultando..." : "Consultar CNPJ"}</BtnSecondary>
              </div>
              <p className="mt-2 break-words text-xs leading-relaxed text-[#718096]">A consulta preenche automaticamente os dados públicos disponíveis. Revise antes de salvar.</p>
            </div>
            <FInput label="Nome da empresa / Nome fantasia" value={form.company_name} required onChange={(event: any) => update("company_name", event.target.value)} />
            <FInput label="Razão social" value={form.company_legal_name} onChange={(event: any) => update("company_legal_name", event.target.value)} />
            <FInput label="Telefone" value={form.company_phone} onChange={(event: any) => update("company_phone", event.target.value)} />
            <FInput label="E-mail" type="email" value={form.company_email} onChange={(event: any) => update("company_email", event.target.value)} />
          </div>
        </Section>
        <Section title="Endereço">
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FInput label="CEP" value={form.company_zip_code} onChange={(event: any) => update("company_zip_code", maskZipCode(event.target.value))} />
            <div className="min-w-0 lg:col-span-2"><FInput label="Rua / Logradouro" value={form.company_street} onChange={(event: any) => update("company_street", event.target.value)} /></div>
            <FInput label="Número" value={form.company_number} onChange={(event: any) => update("company_number", event.target.value)} />
            <div className="min-w-0 lg:col-span-2"><FInput label="Complemento" value={form.company_complement} onChange={(event: any) => update("company_complement", event.target.value)} /></div>
            <div className="min-w-0 lg:col-span-2"><FInput label="Bairro" value={form.company_neighborhood} onChange={(event: any) => update("company_neighborhood", event.target.value)} /></div>
            <div className="min-w-0 lg:col-span-2"><FInput label="Cidade" value={form.company_city} onChange={(event: any) => update("company_city", event.target.value)} /></div>
            <FInput label="Estado / UF" maxLength={2} value={form.company_state} onChange={(event: any) => update("company_state", event.target.value.toUpperCase())} />
          </div>
        </Section>
        <Section title="Logo da empresa">
          <ImageUpload bucket="public-assets" currentMediaId={form.company_logo_media_id} onUpload={(mediaId) => update("company_logo_media_id", mediaId)} canUpload={hasPermission("settings.update")} label="Logo utilizada nos documentos" />
        </Section>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5">
        <BtnSecondary onClick={() => onRouteChange?.(null)}>Voltar</BtnSecondary>
        {hasPermission("settings.update") && <BtnPrimary onClick={() => void save()} disabled={saveSettings.isPending}>{saveSettings.isPending ? <Clock size={15} /> : <CheckCircle size={15} />}{saveSettings.isPending ? "Salvando..." : "Salvar dados"}</BtnPrimary>}
      </div>
    </AdminPage>
  </div>;
}
