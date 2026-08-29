import { useEffect, useState } from "react";
import { CheckCircle, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  BtnPrimary,
  FInput,
  LoadingState,
  PageHeader,
  Section,
  Toast,
} from "@/app/admin/shared";

export function TabSettings() {
  const { user, hasPermission } = useAuth();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("site_settings").select("setting_key, setting_value");
    const map: Record<string, any> = {};
    if (error) setToast({ msg: `Erro ao carregar configurações: ${error.message}`, type: "error" });
    (data || []).forEach((row: any) => { map[row.setting_key] = row.setting_value; });
    setSettings(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateSetting = (key: string, value: any) => setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase.from("site_settings").upsert({ setting_key: key, setting_value: value, updated_by: user?.id || null }, { onConflict: "setting_key" });
        if (error) throw error;
      }
      setToast({ msg: "Configurações salvas com sucesso!", type: "success" });
    } catch (error) {
      console.error("[ADMIN] site_settings save error:", error);
      setToast({ msg: `Erro ao salvar configurações: ${error instanceof Error ? error.message : "erro desconhecido"}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const groups = [
    {
      title: "Identidade Visual", keys: [
        { key: "primary_color", label: "Cor primária", type: "text", placeholder: "#0057e7" },
        { key: "secondary_color", label: "Cor secundária", type: "text", placeholder: "#0d1b2e" },
        { key: "logo_url", label: "URL do logo", type: "text", placeholder: "https://..." },
      ]
    },
    {
      title: "Home — Textos", keys: [
        { key: "hero_title", label: "Título do Hero", type: "text", placeholder: "Tecnologia, produtos e serviços em um só lugar." },
        { key: "hero_subtitle", label: "Subtítulo do Hero", type: "text", placeholder: "Descrição curta da empresa." },
        { key: "hero_image_url", label: "Imagem do Hero (URL)", type: "text", placeholder: "https://..." },
      ]
    },
    {
      title: "Site — Informações Gerais", keys: [
        { key: "site_name", label: "Nome do site", type: "text", placeholder: "Eletrônica Artvideo" },
        { key: "site_description", label: "Descrição do site", type: "text", placeholder: "Meta description..." },
        { key: "whatsapp_number", label: "Número WhatsApp (com DDI)", type: "text", placeholder: "5579999999999" },
      ]
    },
  ];

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Configurações do Site" subtitle="Controle as configurações globais do site" actions={
        hasPermission("settings.update") && (
        <BtnPrimary onClick={handleSave} disabled={saving}>
          {saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
          {saving ? "Salvando..." : "Salvar tudo"}
        </BtnPrimary>
        )
      } />

      {loading ? <LoadingState /> : (
        <div className="space-y-4 max-w-2xl">
          {groups.map(group => (
            <Section key={group.title} title={group.title}>
              <div className="space-y-4">
                {group.keys.map(field => (
                  <FInput key={field.key} label={field.label} type={field.type} value={settings[field.key] || ""} onChange={(e: any) => updateSetting(field.key, e.target.value)} placeholder={field.placeholder} />
                ))}
              </div>
            </Section>
          ))}

          {Object.keys(settings).length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <p className="font-bold mb-1">Tabela site_settings vazia ou sem dados.</p>
              <p>As configurações serão criadas ao salvar pela primeira vez.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
