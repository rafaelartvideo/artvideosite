import React, { useEffect, useState } from "react";
import { CheckCircle, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  useSaveSiteSettingsMutation,
  useSiteSettingsQuery,
} from "@/features/settings/presentation/useSiteSettingsQuery";
import { BtnPrimary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";

export function TabContact() {
  const { user, hasPermission } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const settingsQuery = useSiteSettingsQuery();
  const saveSettings = useSaveSiteSettingsMutation();

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(Object.fromEntries(
        Object.entries(settingsQuery.data).map(([key, value]) => [key, String(value ?? "")]),
      ));
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!settingsQuery.error) return;
    const message = settingsQuery.error instanceof Error ? settingsQuery.error.message : "erro desconhecido";
    setToast({ msg: `Erro ao carregar contato: ${message}`, type: "error" });
  }, [settingsQuery.error]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSettings.mutateAsync({ settings, updatedBy: user?.id ?? null });
      setToast({ msg: "Informações de contato salvas!", type: "success" });
    } catch (error) {
      console.error("[ADMIN] site settings contact save error:", error);
      const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
      setToast({ msg: `Erro ao salvar: ${message}`, type: "error" });
    }
  };

  const updateSetting = (key: string, value: string) => setSettings((current) => ({ ...current, [key]: value }));
  const groups = [
    { title: "Contato", fields: [["phone", "Telefone", "(79) 0000-0000"], ["whatsapp", "WhatsApp", "(79) 99999-9999"], ["email", "E-mail", "contato@empresa.com"]] },
    { title: "Redes sociais", fields: [["instagram", "Instagram", "@empresa"]] },
    { title: "Endereço", fields: [["zip_code", "CEP", "00000-000"], ["street", "Rua", "Rua da empresa"], ["number", "Número", "123"], ["complement", "Complemento", "Sala, bloco..."], ["neighborhood", "Bairro", "Bairro"], ["city", "Cidade", "Cidade"], ["state", "Estado", "SE"]] },
    { title: "Horário", fields: [["business_hours", "Horário de funcionamento", "Seg a Sex: 8h às 18h"]] },
    { title: "Identidade", fields: [["company_name", "Nome da empresa", "Eletrônica Artvideo"]] },
  ];

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Informações de Contato" subtitle="Dados exibidos no site e usados nos botões de ação" />

      {settingsQuery.isPending ? <LoadingState /> : (
        <form onSubmit={handleSave} className="max-w-xl space-y-5">
          {groups.map((group) => <Section key={group.title} title={group.title}><div className="space-y-4">{group.fields.map(([key, label, placeholder]) => <FInput key={key} label={label} value={settings[key] || ""} onChange={(event: any) => updateSetting(key, event.target.value)} placeholder={placeholder} />)}</div></Section>)}

          <div className="flex items-center gap-3">
            {hasPermission("contact.update") && <BtnPrimary type="submit" disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
              {saveSettings.isPending ? "Salvando..." : "Salvar contato"}
            </BtnPrimary>}
            <p className="text-xs text-[#5a6a82]">Essas informações alimentam o site público.</p>
          </div>
        </form>
      )}
    </div>
  );
}
