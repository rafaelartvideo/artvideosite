import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useCompanySettingsQuery, useSaveCompanySettingsMutation } from "./useCompanySettingsQuery";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FPhoneInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { formatCnpj, formatPhone, isValidBrazilianPhone, isValidCnpj, isValidEmail } from "@/shared/domain/formatters";
import { formatZipCode } from "@/lib/address";

type CompanyForm = {
  company_name: string;
  company_legal_name: string;
  company_cnpj: string;
  company_state_registration: string;
  company_municipal_registration: string;
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
  company_name: "", company_legal_name: "", company_cnpj: "", company_state_registration: "", company_municipal_registration: "", company_phone: "", company_email: "",
  company_zip_code: "", company_street: "", company_number: "", company_complement: "",
  company_neighborhood: "", company_city: "", company_state: "", company_logo_media_id: "",
  company_menu_logo_media_id: "",
};
const COMPANY_KEYS = Object.keys(EMPTY_COMPANY) as Array<keyof CompanyForm>;
const settingText = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export function TabSettings({ onBack, identityOnly = false }: {
  onBack: () => void;
  identityOnly?: boolean;
}) {
  const { user, hasPermission, activeOrganizationId, activeOrganization } = useAuth();
  const canView = identityOnly
    ? hasPermission("settings.view") || hasPermission("settings.details.view") || hasPermission("settings.update")
    : hasPermission("settings.view") && hasPermission("settings.details.view");
  const canUpdate = hasPermission("settings.update");
  const query = useCompanySettingsQuery(activeOrganizationId);
  const saveSettings = useSaveCompanySettingsMutation();
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({});
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const busy = saveSettings.isPending;
  const isPartnerOrganization = activeOrganization?.organization_type === "partner";
  const canEditOfficialData = canUpdate && !isPartnerOrganization;
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
    if (identityOnly && key !== "company_logo_media_id" && key !== "company_menu_logo_media_id") return;
    if (
      isPartnerOrganization
      && key !== "company_phone"
      && key !== "company_email"
      && key !== "company_logo_media_id"
      && key !== "company_menu_logo_media_id"
    ) return;
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!canUpdate || busy || !activeOrganizationId) return;
    const nextErrors: Partial<Record<keyof CompanyForm, string>> = {};
    if (!identityOnly && !form.company_name.trim()) nextErrors.company_name = "Informe o nome da empresa.";
    if (!identityOnly && form.company_cnpj && !isValidCnpj(form.company_cnpj)) nextErrors.company_cnpj = "CNPJ inválido. Verifique os números informados.";
    if (!identityOnly && form.company_phone && !isValidBrazilianPhone(form.company_phone)) nextErrors.company_phone = "Telefone inválido. Informe DDD e número válidos.";
    if (!identityOnly && form.company_email && !isValidEmail(form.company_email)) nextErrors.company_email = "E-mail inválido. Verifique o endereço informado.";
    if (!identityOnly && form.company_zip_code && form.company_zip_code.replace(/\D/g, "").length !== 8) nextErrors.company_zip_code = "CEP inválido. Informe os 8 dígitos.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      const settingsToSave = identityOnly && query.data
        ? {
            ...query.data,
            company_logo_media_id: form.company_logo_media_id,
            company_menu_logo_media_id: form.company_menu_logo_media_id,
          }
        : isPartnerOrganization && query.data
        ? {
            ...query.data,
            company_phone: form.company_phone,
            company_email: form.company_email,
            company_logo_media_id: form.company_logo_media_id,
            company_menu_logo_media_id: form.company_menu_logo_media_id,
          }
        : form;
      await saveSettings.mutateAsync({ organizationId: activeOrganizationId, settings: settingsToSave, updatedBy: user?.id ?? null });
      setToast({ msg: identityOnly ? "Identidade visual salva com sucesso." : "Dados da empresa salvos com sucesso.", type: "success" });
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível salvar os dados."), type: "error" });
    }
  };

  if (!canView) return null;
  if (query.isPending) return <LoadingState />;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Dados da empresa" subtitle={identityOnly ? "Identidade visual utilizada no menu e nos documentos da Union World." : "Informações oficiais utilizadas nos documentos e na identificação da empresa ativa."} />
      <div className="min-w-0 space-y-5 p-4 sm:p-5">
        {!identityOnly && <>
        {isPartnerOrganization && <div className="rounded-xl border border-[#0057e7]/15 bg-[#eef5ff] px-4 py-3 text-sm leading-6 text-[#35506f]">Estas informações são administradas pelo administrador da empresa.</div>}
        <Section title="Identificação"><div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-w-0 w-full"><FInput label="CNPJ" inputMode="numeric" maxLength={18} error={fieldErrors.company_cnpj} value={form.company_cnpj} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_cnpj", formatCnpj(event.target.value))} placeholder="00.000.000/0000-00" /></div>
          <div className="min-w-0 w-full"><FInput label="Nome da empresa / Nome fantasia" error={fieldErrors.company_name} value={form.company_name} required disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_name", event.target.value)} /></div>
          <div className="min-w-0 w-full"><FInput label="Razão social" value={form.company_legal_name} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_legal_name", event.target.value)} /></div>
          {isPartnerOrganization && <div className="min-w-0 w-full"><FInput label="Inscrição estadual" value={form.company_state_registration} disabled /></div>}
          {isPartnerOrganization && <div className="min-w-0 w-full"><FInput label="Inscrição municipal" value={form.company_municipal_registration} disabled /></div>}
          <div className="min-w-0 w-full"><FPhoneInput label="Telefone" error={fieldErrors.company_phone} value={form.company_phone} disabled={!canEditContacts || busy} onChange={(event: any) => update("company_phone", event.target.value)} /></div>
          <div className="min-w-0 w-full md:col-span-2"><FInput label="E-mail" type="email" autoComplete="email" error={fieldErrors.company_email} value={form.company_email} disabled={!canEditContacts || busy} onChange={(event: any) => update("company_email", event.target.value.trimStart())} /></div>
        </div></Section>
        <Section title="Endereço"><div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-w-0 w-full"><FInput label="CEP" inputMode="numeric" maxLength={9} placeholder="00000-000" error={fieldErrors.company_zip_code} value={form.company_zip_code} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_zip_code", formatZipCode(event.target.value))} /></div>
          <div className="min-w-0 w-full"><FInput label="Rua / Logradouro" value={form.company_street} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_street", event.target.value)} /></div>
          <div className="min-w-0 w-full"><FInput label="Número" inputMode="numeric" value={form.company_number} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_number", event.target.value.replace(/[^0-9A-Za-z/-]/g, ""))} /></div>
          <div className="min-w-0 w-full"><FInput label="Complemento" value={form.company_complement} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_complement", event.target.value)} /></div>
          <div className="min-w-0 w-full"><FInput label="Bairro" value={form.company_neighborhood} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_neighborhood", event.target.value)} /></div>
          <div className="min-w-0 w-full"><FInput label="Cidade" value={form.company_city} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_city", event.target.value)} /></div>
          <div className="min-w-0 w-full md:col-span-2"><FInput label="Estado / UF" maxLength={2} value={form.company_state} disabled={!canEditOfficialData || busy} onChange={(event: any) => update("company_state", event.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2))} /></div>
        </div></Section>
        </>}
        <Section title="Identidade visual"><div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <ImageUpload photoActions bucket="public-assets" organizationId={activeOrganizationId} currentMediaId={form.company_logo_media_id} onUpload={(mediaId) => update("company_logo_media_id", mediaId)} canUpload={canEditBranding && !busy} label="Logo utilizada nos documentos" />
          <ImageUpload photoActions bucket="public-assets" organizationId={activeOrganizationId} currentMediaId={form.company_menu_logo_media_id} onUpload={(mediaId) => update("company_menu_logo_media_id", mediaId)} canUpload={canEditBranding && !busy} label="Logo do menu" />
        </div></Section>
      </div>
      <AdminStickyToolbar><BtnSecondary onClick={onBack} disabled={busy}>Voltar</BtnSecondary>{canUpdate && <BtnPrimary onClick={save} loading={saveSettings.isPending} loadingText="Salvando...">Salvar</BtnPrimary>}</AdminStickyToolbar>
  </div>;
}
