import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSaveSiteSettingsMutation, useSiteSettingsQuery } from "./useSiteSettingsQuery";
import { BtnPrimary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";

export function TabSiteSettings({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("site_settings.view");
  const canViewDetails = hasPermission("site_settings.details.view");
  const canUpdate = hasPermission("site_settings.update");
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const settingsQuery = useSiteSettingsQuery();
  const saveSettings = useSaveSiteSettingsMutation();

  useEffect(() => { if (settingsQuery.data) setSettings(settingsQuery.data); }, [settingsQuery.data]);
  useEffect(() => { if (settingsQuery.error) setToast({ msg: `Erro ao carregar configurações: ${settingsQuery.error instanceof Error ? settingsQuery.error.message : "erro desconhecido"}`, type: "error" }); }, [settingsQuery.error]);
  if (!canView) return null;

  const updateSetting = (key: string, value: any) => { if (canUpdate) setSettings(prev => ({ ...prev, [key]: value })); };
  const handleSave = async () => {
    if (!canUpdate) return;
    try { await saveSettings.mutateAsync({ settings, updatedBy: user?.id ?? null }); setToast({ msg: "Configurações salvas com sucesso!", type: "success" }); }
    catch (error) { console.error("[ADMIN] site_settings save error:", error); setToast({ msg: `Erro ao salvar configurações: ${error instanceof Error ? error.message : "erro desconhecido"}`, type: "error" }); }
  };

  const groups = [
    { title: "Identidade Visual", keys: [
      { key: "primary_color", label: "Cor primária", type: "color", placeholder: "#0057e7" },
      { key: "secondary_color", label: "Cor secundária", type: "color", placeholder: "#0d1b2e" },
      { key: "logo_url", label: "URL do logo", type: "text", placeholder: "https://..." },
    ] },
    { title: "Home — Textos", keys: [
      { key: "hero_title", label: "Título do Hero", type: "text", placeholder: "Tecnologia, produtos e serviços em um só lugar." },
      { key: "hero_subtitle", label: "Subtítulo do Hero", type: "text", placeholder: "Descrição curta da empresa." },
      { key: "hero_image_url", label: "Imagem do Hero (URL)", type: "text", placeholder: "https://..." },
    ] },
    { title: "Site — Informações Gerais", keys: [
      { key: "site_name", label: "Nome do site", type: "text", placeholder: "Eletrônica Artvideo" },
      { key: "site_description", label: "Descrição do site", type: "text", placeholder: "Meta description..." },
      { key: "whatsapp_number", label: "Número WhatsApp (com DDI)", type: "text", placeholder: "5579999999999" },
    ] },
  ];

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Configurações do Site" subtitle="Controle identidade visual e conteúdo do site público" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{canUpdate && <BtnPrimary onClick={handleSave} loading={saveSettings.isPending} loadingText="Salvando...">Salvar</BtnPrimary>}</div>} />
    {canViewDetails && (settingsQuery.isPending ? <LoadingState /> : <div className="max-w-2xl space-y-4">{groups.map(group => <Section key={group.title} title={group.title}><div className="space-y-4">{group.keys.map(field => <FInput key={field.key} label={field.label} type={field.type} value={settings[field.key] || ""} disabled={!canUpdate || saveSettings.isPending} onChange={(e: any) => updateSetting(field.key, e.target.value)} placeholder={field.placeholder} />)}</div></Section>)}{Object.keys(settings).length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="mb-1 font-bold">Tabela site_settings vazia ou sem dados.</p><p>As configurações serão criadas ao salvar pela primeira vez.</p></div>}</div>)}
  </div>;
}
