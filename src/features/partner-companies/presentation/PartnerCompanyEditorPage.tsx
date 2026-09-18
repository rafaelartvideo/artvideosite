import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { lookupCompanyByCnpj } from "@/features/settings/infrastructure/company-registry.gateway";
import { type Address } from "@/lib/address";
import {
  isValidBrazilianMobile,
  isValidBrazilianPhone,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  normalizeDigits,
} from "@/shared/domain/formatters";
import { AddressFields } from "@/shared/ui/address/AddressFields";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminPage, AdminSegmentedControl, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCnpjInput, FCpfInput, FEmailInput, FInput, FPhoneInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import {
  createPartnerCompany,
  updatePartnerCompany,
  type PartnerCompanyInput,
  type PartnerCompanySettings,
} from "../infrastructure/partner-companies.repository";

type PersonType = "PF" | "PJ";

type CompanyDraft = {
  personType: PersonType;
  name: string;
  legalName: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  companyLogoMediaId: string;
  menuLogoMediaId: string;
};

type FormErrors = Partial<Record<keyof CompanyDraft | "address", string>>;

const emptyDraft: CompanyDraft = {
  personType: "PJ",
  name: "",
  legalName: "",
  document: "",
  phone: "",
  whatsapp: "",
  email: "",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  companyLogoMediaId: "",
  menuLogoMediaId: "",
};

function normalizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "empresa";
}

function internalSlug(name: string) {
  return `${normalizeSlug(name)}-${crypto.randomUUID().slice(0, 8)}`;
}

function toDraft(company?: any | null): CompanyDraft {
  if (!company) return { ...emptyDraft };
  const settings = (company.settings || {}) as PartnerCompanySettings;
  return {
    personType: settings.person_type === "PF" ? "PF" : "PJ",
    name: company.name || "",
    legalName: company.legal_name || "",
    document: company.document || "",
    phone: settings.phone || "",
    whatsapp: settings.whatsapp || "",
    email: settings.email || "",
    zipCode: settings.zip_code || "",
    street: settings.street || "",
    number: settings.number || "",
    complement: settings.complement || "",
    neighborhood: settings.neighborhood || "",
    city: settings.city || "",
    state: settings.state || "",
    companyLogoMediaId: settings.company_logo_media_id || "",
    menuLogoMediaId: settings.menu_logo_media_id || "",
  };
}

function validateCompany(form: CompanyDraft): FormErrors {
  const errors: FormErrors = {};
  const documentDigits = normalizeDigits(form.document);
  const zipDigits = normalizeDigits(form.zipCode);
  const hasAddress = Boolean(zipDigits || form.street.trim() || form.number.trim() || form.neighborhood.trim() || form.city.trim() || form.state.trim());

  if (!form.name.trim()) {
    errors.name = form.personType === "PJ" ? "Informe o nome fantasia ou nome da empresa." : "Informe o nome completo.";
  }

  if (form.personType === "PF") {
    if (!isValidCpf(documentDigits)) errors.document = "Informe um CPF válido.";
  } else {
    if (!isValidCnpj(documentDigits)) errors.document = "Informe um CNPJ válido.";
    if (!form.legalName.trim()) errors.legalName = "Informe a razão social.";
  }

  if (form.phone && !isValidBrazilianPhone(form.phone)) errors.phone = "Informe um telefone brasileiro válido.";
  if (form.whatsapp && !isValidBrazilianMobile(form.whatsapp)) errors.whatsapp = "Informe um WhatsApp celular válido com DDD.";
  if (form.email && !isValidEmail(form.email)) errors.email = "Informe um e-mail válido.";

  if (zipDigits && zipDigits.length !== 8) errors.address = "O CEP deve conter 8 dígitos.";
  if (hasAddress && zipDigits.length === 8) {
    if (!form.street.trim()) errors.address = "Informe o logradouro do endereço.";
    else if (!form.city.trim()) errors.address = "Informe a cidade do endereço.";
    else if (!/^[A-Za-z]{2}$/.test(form.state.trim())) errors.address = "Informe uma UF válida com 2 letras.";
  }

  return errors;
}

export function PartnerCompanyEditorPage({
  company,
  open,
  canSave,
  onClose,
  onSaved,
}: {
  company?: any | null;
  open: boolean;
  canSave: boolean;
  onClose: () => void;
  onSaved: (company: any) => void;
}) {
  const editing = Boolean(company?.id);
  const [form, setForm] = useState<CompanyDraft>(() => toDraft(company));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [consultingCnpj, setConsultingCnpj] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const lastCnpjLookupRef = useRef("");

  useEffect(() => {
    if (!open) return;
    const draft = toDraft(company);
    setForm(draft);
    setErrors({});
    setToast(null);
    lastCnpjLookupRef.current = normalizeDigits(draft.document);
  }, [open, company]);

  useEffect(() => {
    if (!open || form.personType !== "PJ") return;
    const digits = normalizeDigits(form.document);
    if (digits.length !== 14 || digits === lastCnpjLookupRef.current) return;

    if (!isValidCnpj(digits)) {
      lastCnpjLookupRef.current = digits;
      setErrors(current => ({ ...current, document: "Informe um CNPJ válido." }));
      return;
    }

    lastCnpjLookupRef.current = digits;
    let active = true;
    setConsultingCnpj(true);
    setErrors(current => ({ ...current, document: undefined }));

    lookupCompanyByCnpj(digits)
      .then(data => {
        if (!active) return;
        setForm(current => {
          if (current.personType !== "PJ" || normalizeDigits(current.document) !== digits) return current;
          return {
            ...current,
            document: data.cnpj,
            name: data.tradeName || data.legalName || current.name,
            legalName: data.legalName || current.legalName,
            phone: data.phone || current.phone,
            email: data.email || current.email,
            zipCode: data.zipCode || current.zipCode,
            street: data.street || current.street,
            number: data.number || current.number,
            complement: data.complement || current.complement,
            neighborhood: data.neighborhood || current.neighborhood,
            city: data.city || current.city,
            state: data.state || current.state,
          };
        });
        setToast({ msg: "CNPJ consultado e dados preenchidos automaticamente.", type: "success" });
      })
      .catch(error => {
        if (!active) return;
        setToast({ msg: error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.", type: "error" });
      })
      .finally(() => {
        if (active) setConsultingCnpj(false);
      });

    return () => { active = false; };
  }, [open, form.personType, form.document]);

  if (!open) return null;

  const setField = (key: keyof CompanyDraft, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
  };

  const changePersonType = (value: PersonType) => {
    if (value === form.personType) return;
    lastCnpjLookupRef.current = "";
    setErrors({});
    setForm({ ...emptyDraft, personType: value });
  };

  const addressValue: Address = {
    zip_code: form.zipCode,
    street: form.street,
    number: form.number,
    complement: form.complement,
    neighborhood: form.neighborhood,
    city: form.city,
    state: form.state,
    shared_map_url: "",
  };

  const setAddress = (address: Address) => {
    setForm(current => ({
      ...current,
      zipCode: address.zip_code,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: String(address.state || "").toUpperCase().slice(0, 2),
    }));
    setErrors(current => ({ ...current, address: undefined }));
  };

  const save = async () => {
    const validationErrors = validateCompany(form);
    setErrors(validationErrors);
    const firstError = Object.values(validationErrors).find(Boolean);
    if (firstError) {
      setToast({ msg: String(firstError), type: "error" });
      return;
    }
    if (!canSave) return;

    const settings: PartnerCompanySettings = {
      person_type: form.personType,
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(),
      email: form.email.trim(),
      zip_code: form.zipCode.trim(),
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim(),
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      company_logo_media_id: form.companyLogoMediaId || "",
      menu_logo_media_id: form.menuLogoMediaId || "",
    };
    const payload: PartnerCompanyInput = {
      name: form.name.trim(),
      legal_name: form.personType === "PJ" ? form.legalName.trim() : null,
      document: form.document,
      slug: editing ? company.slug : internalSlug(form.name),
      status: company?.status || "active",
      settings,
    };

    setSaving(true);
    try {
      const result = editing
        ? await updatePartnerCompany(company.id, payload)
        : await createPartnerCompany(payload);
      if (result.error) throw result.error;
      onSaved(result.data);
    } catch (error) {
      setToast({ msg: `Não foi possível salvar a empresa: ${error instanceof Error ? error.message : "Erro desconhecido"}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return <AdminPage
    open
    onClose={onClose}
    breadcrumb={editing ? `Empresas Parceiras > ${company.name}` : "Empresas Parceiras"}
    title={editing ? "Editar empresa" : "Nova empresa"}
    subtitle={editing ? "Atualize os dados cadastrais da empresa parceira." : "Cadastre uma nova empresa parceira independente."}
    maxW="max-w-2xl"
    fullPage
  >
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <div className="space-y-5 p-4 sm:p-5">
      <AdminCard>
        <AdminCardHeader>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-[#0d1b2e]">Dados cadastrais</h3>
            <p className="mt-0.5 text-xs text-[#5a6a82]">Identifique a pessoa física ou jurídica responsável pela empresa.</p>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo de cadastro</label>
              <AdminSegmentedControl
                value={form.personType}
                options={[{ value: "PF", label: "CPF — Pessoa Física" }, { value: "PJ", label: "CNPJ — Pessoa Jurídica" }]}
                onChange={changePersonType}
                className="grid-cols-2"
              />
            </div>

            {form.personType === "PF" ? (
              <FCpfInput label="CPF" required error={errors.document} value={form.document} onChange={(event: any) => setField("document", event.target.value)} />
            ) : (
              <FCnpjInput
                label="CNPJ"
                required
                error={errors.document}
                hint={consultingCnpj ? "Consultando CNPJ..." : "A consulta é feita automaticamente ao completar o CNPJ."}
                value={form.document}
                onChange={(event: any) => setField("document", event.target.value)}
              />
            )}

            <FInput
              label={form.personType === "PJ" ? "Nome fantasia" : "Nome completo"}
              required
              error={errors.name}
              value={form.name}
              onChange={(event: any) => setField("name", event.target.value)}
            />
            {form.personType === "PJ" && <FInput label="Razão social" required error={errors.legalName} value={form.legalName} onChange={(event: any) => setField("legalName", event.target.value)} />}
            <FPhoneInput label="Telefone" error={errors.phone} value={form.phone} onChange={(event: any) => setField("phone", event.target.value)} />
            <FPhoneInput label="WhatsApp" mobile error={errors.whatsapp} value={form.whatsapp} onChange={(event: any) => setField("whatsapp", event.target.value)} />
            <div className="sm:col-span-2"><FEmailInput label="E-mail" error={errors.email} value={form.email} onChange={(event: any) => setField("email", event.target.value)} /></div>
          </div>
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader>
          <div>
            <h3 className="text-sm font-black text-[#0d1b2e]">Endereço</h3>
            <p className="mt-0.5 text-xs text-[#5a6a82]">Informe o endereço principal da empresa parceira para identificação e atendimento.</p>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <AddressFields value={addressValue} onChange={setAddress} inputClassName={INPUT} />
          {errors.address && <p className="mt-2 text-[10px] font-semibold text-red-600">{errors.address}</p>}
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader>
          <div>
            <h3 className="text-sm font-black text-[#0d1b2e]">Identidade visual</h3>
            <p className="mt-0.5 text-xs text-[#5a6a82]">Configure a logo usada nos documentos e a logo exibida no menu da empresa parceira.</p>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {editing ? <div className="grid gap-5 sm:grid-cols-2">
            <ImageUpload
              bucket="public-assets"
              organizationId={company.id}
              currentMediaId={form.companyLogoMediaId}
              onUpload={(mediaId) => setField("companyLogoMediaId", mediaId)}
              canUpload={canSave && !saving}
              label="Logo dos documentos"
            />
            <ImageUpload
              bucket="public-assets"
              organizationId={company.id}
              currentMediaId={form.menuLogoMediaId}
              onUpload={(mediaId) => setField("menuLogoMediaId", mediaId)}
              canUpload={canSave && !saving}
              label="Logo do menu"
            />
          </div> : <p className="text-sm leading-6 text-[#5a6a82]">Cadastre a empresa primeiro. Depois, abra a edição para enviar as logos específicas desta empresa.</p>}
        </AdminCardContent>
      </AdminCard>
    </div>

    <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
      <BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
      <BtnPrimary onClick={() => void save()} disabled={!canSave || saving || consultingCnpj}>
        <CheckCircle2 size={15} /> {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar empresa"}
      </BtnPrimary>
    </div>
  </AdminPage>;
}
