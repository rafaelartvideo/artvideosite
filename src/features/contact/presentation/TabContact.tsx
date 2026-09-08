import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle, Clock3, Mail, MapPin, MessageCircle, Phone, Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  useSaveSiteSettingsMutation,
  useSiteSettingsQuery,
} from "@/features/settings/presentation/useSiteSettingsQuery";
import { BtnPrimary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FEmailInput, FInput, FPhoneInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";

function SectionIcon({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center justify-center text-[#0057e7]">{children}</span>;
}

export function TabContact() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("contact.view");
  const canViewDetails = hasPermission("contact.details.view");
  const canUpdate = hasPermission("contact.update");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const settingsQuery = useSiteSettingsQuery();
  const saveSettings = useSaveSiteSettingsMutation();

  useEffect(() => {
    if (!settingsQuery.data) return;
    setSettings(Object.fromEntries(Object.entries(settingsQuery.data).map(([key, value]) => [key, String(value ?? "")] )));
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!settingsQuery.error) return;
    const message = settingsQuery.error instanceof Error ? settingsQuery.error.message : "erro desconhecido";
    setToast({ msg: `Erro ao carregar contato: ${message}`, type: "error" });
  }, [settingsQuery.error]);

  const updateSetting = (key: string, value: string) => {
    if (!canUpdate) return;
    setSettings(current => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!canUpdate) return;
    try {
      await saveSettings.mutateAsync({ settings, updatedBy: user?.id ?? null });
      setToast({ msg: "Informações de contato salvas com sucesso.", type: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao salvar contato: ${message}`, type: "error" });
    }
  };

  if (!canView || !canViewDetails) return null;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title="Informações de Contato"
      subtitle="Configure os canais, endereço e horários exibidos no site público."
      actions={<div className="flex items-center gap-2">
        <InternalBackButton onBack={() => navigate("/admin/site")} />
        {canUpdate && <BtnPrimary onClick={() => void handleSave()} loading={saveSettings.isPending} loadingText="Salvando..."><CheckCircle size={15} /> Salvar</BtnPrimary>}
      </div>}
    />

    {settingsQuery.isPending ? <LoadingState /> : <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <Section title="Canais de contato" actions={<SectionIcon><Phone size={14} /></SectionIcon>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FPhoneInput label="Telefone" value={settings.phone || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("phone", event.target.value)} />
          <FPhoneInput label="WhatsApp" mobile value={settings.whatsapp || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("whatsapp", event.target.value)} />
          <div className="sm:col-span-2"><FEmailInput label="E-mail" value={settings.email || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("email", event.target.value)} /></div>
        </div>
      </Section>

      <Section title="Redes sociais" actions={<SectionIcon><Share2 size={14} /></SectionIcon>}>
        <div className="space-y-4">
          <FInput label="Instagram" value={settings.instagram || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("instagram", event.target.value)} placeholder="@empresa" />
          <p className="flex items-center gap-2 text-xs leading-5 text-[#5a6a82]"><MessageCircle size={14} /> Use o identificador ou link público da rede social.</p>
        </div>
      </Section>

      <div className="xl:col-span-2">
        <Section title="Endereço" actions={<SectionIcon><MapPin size={14} /></SectionIcon>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FInput label="CEP" value={settings.zip_code || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("zip_code", event.target.value)} placeholder="00000-000" />
            <div className="sm:col-span-2"><FInput label="Rua" value={settings.street || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("street", event.target.value)} placeholder="Rua da empresa" /></div>
            <FInput label="Número" value={settings.number || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("number", event.target.value)} />
            <div className="sm:col-span-2"><FInput label="Complemento" value={settings.complement || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("complement", event.target.value)} placeholder="Sala, bloco..." /></div>
            <FInput label="Bairro" value={settings.neighborhood || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("neighborhood", event.target.value)} />
            <FInput label="Cidade" value={settings.city || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("city", event.target.value)} />
            <FInput label="Estado" value={settings.state || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("state", event.target.value.toUpperCase())} maxLength={2} placeholder="SE" />
          </div>
        </Section>
      </div>

      <Section title="Horário de funcionamento" actions={<SectionIcon><Clock3 size={14} /></SectionIcon>}>
        <FInput label="Horário" value={settings.business_hours || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("business_hours", event.target.value)} placeholder="Seg a Sex: 8h às 18h" />
      </Section>

      <Section title="Identificação pública" actions={<SectionIcon><Mail size={14} /></SectionIcon>}>
        <FInput label="Nome da empresa" value={settings.company_name || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("company_name", event.target.value)} placeholder="Eletrônica ArtVideo" />
      </Section>
    </div>}
  </div>;
}
