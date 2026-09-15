import { useCallback, useEffect, useState } from "react";
import { Edit2, Mail, MessageCircle, Pause, Phone, Play, Plus, UserRound } from "lucide-react";
import { cn, formatPhone, isValidEmail, normalizeDigits } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminDialog, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { FEmailInput, FInput, FPhoneInput } from "@/shared/ui/admin/AdminFormControls";
import type { Registration } from "../infrastructure/registrations.repository";
import {
  createRegistrationContact,
  listRegistrationContacts,
  setRegistrationContactActive,
  updateRegistrationContact,
  type RegistrationContact,
  type RegistrationContactPayload,
} from "../infrastructure/registration-contacts.repository";

type ContactForm = {
  name: string;
  job_title: string;
  phone: string;
  whatsapp: string;
  email: string;
};

const emptyContactForm = (): ContactForm => ({ name: "", job_title: "", phone: "", whatsapp: "", email: "" });

function contactPayload(form: ContactForm): RegistrationContactPayload {
  return {
    name: form.name.trim(),
    job_title: form.job_title.trim(),
    phone: form.phone.trim(),
    whatsapp: form.whatsapp.trim(),
    email: form.email.trim(),
  };
}

function contactFormFromRecord(contact: RegistrationContact): ContactForm {
  return {
    name: contact.name || "",
    job_title: contact.job_title || "",
    phone: contact.phone || "",
    whatsapp: contact.whatsapp || "",
    email: contact.email || "",
  };
}

function whatsappUrl(value?: string | null) {
  const digits = normalizeDigits(value || "");
  if (!digits) return "";
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

function ContactChannels({ phone, whatsapp, email }: { phone?: string | null; whatsapp?: string | null; email?: string | null }) {
  const phoneDigits = normalizeDigits(phone || "");
  const whatsUrl = whatsappUrl(whatsapp);
  return <div className="mt-3 flex min-w-0 flex-wrap gap-2">
    {phoneDigits && <a href={`tel:${phoneDigits}`} className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-[#0d1b2e]/10 bg-white px-2.5 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><Phone size={13} /><span>{formatPhone(phone) || phone}</span></a>}
    {whatsUrl && <a href={whatsUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><MessageCircle size={13} /><span>{formatPhone(whatsapp) || whatsapp}</span></a>}
    {email && <a href={`mailto:${email}`} className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-[#0d1b2e]/10 bg-white px-2.5 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><Mail size={13} /><span className="max-w-[16rem] truncate">{email}</span></a>}
  </div>;
}

export function RegistrationContactsPage({
  open,
  registration,
  organizationId,
  canManage,
  onClose,
}: {
  open: boolean;
  registration: Registration;
  organizationId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<RegistrationContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<RegistrationContact | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ContactForm>(emptyContactForm());

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listRegistrationContacts(organizationId, registration.id);
    setLoading(false);
    if (result.error) {
      notifyAdmin(`Erro ao carregar contatos: ${result.error.message}`, "error");
      return;
    }
    setContacts(result.data);
  }, [organizationId, registration.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyContactForm());
    setFormOpen(true);
  };

  const openEdit = (contact: RegistrationContact) => {
    setEditing(contact);
    setForm(contactFormFromRecord(contact));
    setFormOpen(true);
  };

  const save = async () => {
    const payload = contactPayload(form);
    if (!payload.name) {
      notifyAdmin("Informe o nome do contato.", "error");
      return;
    }
    if (!payload.phone && !payload.whatsapp && !payload.email) {
      notifyAdmin("Informe pelo menos telefone, WhatsApp ou e-mail.", "error");
      return;
    }
    if (payload.email && !isValidEmail(payload.email)) {
      notifyAdmin("Informe um e-mail válido para o contato.", "error");
      return;
    }

    setSaving(true);
    const result = editing
      ? await updateRegistrationContact(organizationId, registration.id, editing.id, payload)
      : await createRegistrationContact(organizationId, registration.id, payload);
    setSaving(false);
    if (result.error) {
      notifyAdmin(`Erro ao salvar contato: ${result.error.message}`, "error");
      return;
    }
    setFormOpen(false);
    notifyAdmin(editing ? "Contato atualizado." : "Contato adicionado.");
    await load();
  };

  const toggleActive = async (contact: RegistrationContact) => {
    const next = !contact.is_active;
    const result = await setRegistrationContactActive(organizationId, registration.id, contact.id, next);
    if (result.error) {
      notifyAdmin(`Erro ao alterar contato: ${result.error.message}`, "error");
      return;
    }
    notifyAdmin(next ? "Contato ativado." : "Contato inativado.");
    await load();
  };

  if (!open) return null;
  const hasPrimaryChannels = Boolean(registration.phone || registration.whatsapp || registration.email);

  return <>
    <AdminPage open onClose={onClose} breadcrumb={`Cadastros > ${registration.name}`} title="Contatos" subtitle="Contatos principais e adicionais deste cadastro" maxW="max-w-4xl">
      <div className="space-y-4 p-4 sm:p-5">
        <AdminCard className="p-4 shadow-none sm:p-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate text-sm font-black text-[#0d1b2e]">{registration.name}</p>
                <span className="rounded-full bg-[#eaf2ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#0057e7]">Contato principal</span>
              </div>
              <p className="mt-1 text-xs text-[#5a6a82]">Mantido nos dados principais do cadastro para compatibilidade com OS e demais fluxos.</p>
            </div>
          </div>
          {hasPrimaryChannels ? <ContactChannels phone={registration.phone} whatsapp={registration.whatsapp} email={registration.email} /> : <p className="mt-3 text-sm text-[#5a6a82]">Nenhum telefone, WhatsApp ou e-mail principal informado.</p>}
        </AdminCard>

        {loading ? <LoadingState text="Carregando contatos..." /> : contacts.length === 0 ? <AdminCard className="shadow-none"><EmptyState icon={UserRound} title="Nenhum contato adicional" message="Adicione outros responsáveis, setores ou pessoas de contato para este cadastro." onAdd={canManage ? openNew : undefined} addLabel="Adicionar contato" /></AdminCard> : <div className="grid gap-3 md:grid-cols-2">{contacts.map(contact => <AdminCard key={contact.id} className={cn("p-4 shadow-none", !contact.is_active && "bg-[#f8fafc] opacity-80")}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate text-sm font-black text-[#0d1b2e]">{contact.name}</p>
                <StatusBadge status={contact.is_active ? "Ativo" : "Inativo"} />
              </div>
              {contact.job_title && <p className="mt-1 text-xs font-semibold text-[#5a6a82]">{contact.job_title}</p>}
            </div>
            {canManage && <div className="flex shrink-0 items-center gap-1.5">
              <AdminIconButton ariaLabel="Editar contato" title="Editar contato" onClick={() => openEdit(contact)}><Edit2 size={14} /></AdminIconButton>
              <AdminIconButton ariaLabel={contact.is_active ? "Inativar contato" : "Ativar contato"} title={contact.is_active ? "Inativar contato" : "Ativar contato"} variant={contact.is_active ? "danger" : "secondary"} onClick={() => void toggleActive(contact)}>{contact.is_active ? <Pause size={14} /> : <Play size={14} />}</AdminIconButton>
            </div>}
          </div>
          <ContactChannels phone={contact.phone} whatsapp={contact.whatsapp} email={contact.email} />
        </AdminCard>)}</div>}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
        <BtnSecondary onClick={onClose}>Voltar</BtnSecondary>
        {canManage && <BtnPrimary onClick={openNew}><Plus size={15} /> Adicionar contato</BtnPrimary>}
      </div>
    </AdminPage>

    <AdminDialog
      open={formOpen}
      onClose={() => { if (!saving) setFormOpen(false); }}
      title={editing ? "Editar contato" : "Novo contato"}
      description="Cadastre uma pessoa, setor ou responsável adicional."
      className="max-w-xl"
      footer={<div className="flex w-full gap-2 sm:justify-end"><BtnSecondary onClick={() => setFormOpen(false)} disabled={saving} className="min-w-0 flex-1 sm:flex-none">Cancelar</BtnSecondary><BtnPrimary onClick={() => void save()} loading={saving} loadingText="Salvando..." className="min-w-0 flex-1 sm:flex-none">Salvar contato</BtnPrimary></div>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FInput label="Nome" required value={form.name} onChange={(event: any) => setForm(current => ({ ...current, name: event.target.value }))} /></div>
        <div className="sm:col-span-2"><FInput label="Cargo / identificação" value={form.job_title} onChange={(event: any) => setForm(current => ({ ...current, job_title: event.target.value }))} placeholder="Ex.: Financeiro, responsável técnico" /></div>
        <FPhoneInput label="Telefone" value={form.phone} onChange={(event: any) => setForm(current => ({ ...current, phone: event.target.value }))} />
        <FPhoneInput label="WhatsApp" mobile value={form.whatsapp} onChange={(event: any) => setForm(current => ({ ...current, whatsapp: event.target.value }))} />
        <div className="sm:col-span-2"><FEmailInput label="E-mail" value={form.email} onChange={(event: any) => setForm(current => ({ ...current, email: event.target.value }))} /></div>
      </div>
    </AdminDialog>
  </>;
}
