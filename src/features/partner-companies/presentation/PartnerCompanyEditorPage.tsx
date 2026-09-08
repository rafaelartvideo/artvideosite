import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Search } from "lucide-react";
import { lookupCompanyByCnpj } from "@/features/settings/infrastructure/company-registry.gateway";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminPage, AdminSegmentedControl, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCnpjInput, FCpfInput, FEmailInput, FInput, FPhoneInput } from "@/shared/ui/admin/AdminFormControls";
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
  email: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

const emptyDraft: CompanyDraft = {
  personType: "PJ",
  name: "",
  legalName: "",
  document: "",
  phone: "",
  email: "",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
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
  if (!company) return emptyDraft;
  const settings = (company.settings || {}) as PartnerCompanySettings;
  return {
    personType: settings.person_type === "PF" ? "PF" : "PJ",
    name: company.name || "",
    legalName: company.legal_name || "",
    document: company.document || "",
    phone: settings.phone || "",
    email: settings.email || "",
    zipCode: settings.zip_code || "",
    street: settings.street || "",
    number: settings.number || "",
    complement: settings.complement || "",
    neighborhood: settings.neighborhood || "",
    city: settings.city || "",
    state: settings.state || "",
  };
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
  const [saving, setSaving] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (open) setForm(toDraft(company));
  }, [open, company]);

  if (!open) return null;

  const setField = (key: keyof CompanyDraft, value: string) => setForm(current => ({ ...current, [key]: value }));

  const consultCnpj = async () => {
    if (form.personType !== "PJ") return;
    setConsulting(true);
    try {
      const data = await lookupCompanyByCnpj(form.document);
      setForm(current => ({
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
      }));
      setToast({ msg: "Dados do CNPJ preenchidos.", type: "success" });
    } catch (error) {
      setToast({ msg: error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.", type: "error" });
    } finally {
      setConsulting(false);
    }
  };

  const save = async () => {
    const digits = form.document.replace(/\D/g, "");
    if (!form.name.trim()) {
      setToast({ msg: form.personType === "PJ" ? "Informe o nome fantasia ou nome da empresa." : "Informe o nome da pessoa.", type: "error" });
      return;
    }
    if ((form.personType === "PF" && digits.length !== 11) || (form.personType === "PJ" && digits.length !== 14)) {
      setToast({ msg: `Informe um ${form.personType === "PF" ? "CPF" : "CNPJ"} válido.`, type: "error" });
      return;
    }
    if (!canSave) return;

    const settings: PartnerCompanySettings = {
      person_type: form.personType,
      phone: form.phone.trim(),
      email: form.email.trim(),
      zip_code: form.zipCode.trim(),
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim(),
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
    };
    const payload: PartnerCompanyInput = {
      name: form.name.trim(),
      legal_name: form.personType === "PJ" ? form.legalName.trim() || null : null,
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
    fullPage={editing}
  >
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <div className="space-y-5 p-5">
      <AdminCard>
        <AdminCardHeader>
          <div className="flex min-w-0 items-center gap-2">
            <Building2 size={17} className="shrink-0 text-[#0057e7]" />
            <div className="min-w-0">
              <h3 className="text-sm font-black text-[#0d1b2e]">Dados cadastrais</h3>
              <p className="mt-0.5 text-xs text-[#5a6a82]">Identifique a pessoa física ou jurídica responsável pela empresa.</p>
            </div>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo de cadastro</label>
              <AdminSegmentedControl
                value={form.personType}
                options={[{ value: "PF", label: "CPF — Pessoa Física" }, { value: "PJ", label: "CNPJ — Pessoa Jurídica" }]}
                onChange={(value) => setForm(current => ({ ...current, personType: value, document: "", legalName: value === "PF" ? "" : current.legalName }))}
                className="grid-cols-2"
              />
            </div>

            {form.personType === "PF" ? (
              <FCpfInput label="CPF" required value={form.document} onChange={(event: any) => setField("document", event.target.value)} />
            ) : (
              <div className="min-w-0">
                <FCnpjInput label="CNPJ" required value={form.document} onChange={(event: any) => setField("document", event.target.value)} />
                <BtnSecondary className="mt-2" onClick={() => void consultCnpj()} disabled={consulting}>
                  <Search size={14} /> {consulting ? "Consultando..." : "Consultar CNPJ"}
                </BtnSecondary>
              </div>
            )}

            <FInput
              label={form.personType === "PJ" ? "Nome fantasia" : "Nome completo"}
              required
              value={form.name}
              onChange={(event: any) => setField("name", event.target.value)}
            />
            {form.personType === "PJ" && <FInput label="Razão social" value={form.legalName} onChange={(event: any) => setField("legalName", event.target.value)} />}
            <FPhoneInput label="Telefone" mobile value={form.phone} onChange={(event: any) => setField("phone", event.target.value)} />
            <FEmailInput label="E-mail" value={form.email} onChange={(event: any) => setField("email", event.target.value)} />
          </div>
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader>
          <div>
            <h3 className="text-sm font-black text-[#0d1b2e]">Endereço</h3>
            <p className="mt-0.5 text-xs text-[#5a6a82]">Dados cadastrais da sede ou do responsável.</p>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <FInput label="CEP" value={form.zipCode} onChange={(event: any) => setField("zipCode", event.target.value)} />
            <FInput label="UF" maxLength={2} value={form.state} onChange={(event: any) => setField("state", event.target.value.toUpperCase())} />
            <FInput label="Cidade" value={form.city} onChange={(event: any) => setField("city", event.target.value)} />
            <FInput label="Bairro" value={form.neighborhood} onChange={(event: any) => setField("neighborhood", event.target.value)} />
            <FInput label="Rua / Logradouro" value={form.street} onChange={(event: any) => setField("street", event.target.value)} />
            <FInput label="Número" value={form.number} onChange={(event: any) => setField("number", event.target.value)} />
            <div className="sm:col-span-2"><FInput label="Complemento" value={form.complement} onChange={(event: any) => setField("complement", event.target.value)} /></div>
          </div>
        </AdminCardContent>
      </AdminCard>
    </div>

    <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-5 py-4 backdrop-blur">
      <BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
      <BtnPrimary onClick={() => void save()} disabled={!canSave || saving}>
        <CheckCircle2 size={15} /> {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar empresa"}
      </BtnPrimary>
    </div>
  </AdminPage>;
}
