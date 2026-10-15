import { useEffect, useState } from "react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useAuth } from "@/lib/auth";
import { useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { DEFAULT_HOME_CATEGORIES, homeCategories, homeServiceDisplay, PUBLIC_ICON_OPTIONS } from "@/features/public-shell/domain/site-appearance";
import { useSaveSiteSettingsMutation, useSiteSettingsQuery } from "./useSiteSettingsQuery";
import { BtnPrimary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";

type Field = { key: string; label: string; placeholder?: string; type?: "text" | "color" | "textarea" };

const groups: { title: string; subtitle?: string; fields: Field[] }[] = [
  { title: "Identidade visual", subtitle: "Cores aplicadas à nova home e ao cabeçalho do site.", fields: [
    { key: "primary_color", label: "Azul principal", type: "color", placeholder: "#0057e7" },
    { key: "secondary_color", label: "Azul escuro", type: "color", placeholder: "#0d1b2e" },
    { key: "logo_url", label: "Logo (URL HTTPS, opcional)", placeholder: "https://..." },
  ] },
  { title: "Capa da página inicial", subtitle: "A imagem cobre toda a área. O degradê escuro permanece por cima para manter o texto legível.", fields: [
    { key: "home_hero_eyebrow", label: "Texto pequeno acima do título", placeholder: "Eletrônica Artvideo · Aracaju, SE" },
    { key: "hero_title", label: "Título principal", placeholder: "Tecnologia, produtos e serviços" },
    { key: "hero_highlight", label: "Trecho azul do título", placeholder: "em um só lugar." },
    { key: "hero_subtitle", label: "Descrição", type: "textarea", placeholder: "Produtos eletrônicos, assistência técnica, instalações e manutenção..." },
    { key: "hero_image_alt", label: "Descrição acessível da imagem", placeholder: "Interior da Eletrônica Artvideo" },
    { key: "hero_image_url", label: "Imagem externa (URL HTTPS, opcional)", placeholder: "https://..." },
  ] },
  { title: "Três acessos rápidos", fields: [
    { key: "home_buy_title", label: "Título · Comprar", placeholder: "COMPRAR" },
    { key: "home_buy_description", label: "Descrição · Comprar", type: "textarea", placeholder: "Encontre eletrônicos, acessórios e equipamentos." },
    { key: "home_repair_title", label: "Título · Consertar", placeholder: "CONSERTAR" },
    { key: "home_repair_description", label: "Descrição · Consertar", type: "textarea", placeholder: "Assistência técnica e manutenção..." },
    { key: "home_tracking_title", label: "Título · Acompanhar", placeholder: "ACOMPANHAR SERVIÇO" },
    { key: "home_tracking_description", label: "Descrição · Acompanhar", type: "textarea", placeholder: "Consulte o andamento do seu serviço..." },
  ] },
  { title: "Catálogos na página inicial", subtitle: "Os produtos e serviços são carregados do CRM; aqui você personaliza os títulos.", fields: [
    { key: "home_products_title", label: "Título dos produtos", placeholder: "Destaques da loja" },
    { key: "home_products_subtitle", label: "Descrição dos produtos", placeholder: "Produtos selecionados para você." },
    { key: "home_services_title", label: "Título dos serviços", placeholder: "Serviços para sua casa e seus equipamentos" },
    { key: "home_services_subtitle", label: "Descrição dos serviços", placeholder: "Instalações, manutenções e suporte técnico..." },
  ] },
  { title: "Assistência e marcas", fields: [
    { key: "home_assistance_title", label: "Título da assistência", placeholder: "Seu equipamento apresentou algum problema?" },
    { key: "home_assistance_subtitle", label: "Descrição da assistência", type: "textarea", placeholder: "Nossa assistência técnica atende diversos equipamentos..." },
    { key: "home_brands_title", label: "Título das marcas", placeholder: "Marcas que atendemos" },
    { key: "home_brands_subtitle", label: "Descrição das marcas", placeholder: "Trabalhamos com marcas de diversos segmentos." },
  ] },
  { title: "Etapas do atendimento", fields: [
    { key: "home_steps_title", label: "Título da seção", placeholder: "Precisa de assistência? É fácil." },
    { key: "home_steps_subtitle", label: "Descrição da seção", placeholder: "Em poucos passos seu equipamento estará em boas mãos." },
    ...["Solicite", "Avaliamos", "Orçamento", "Reparo"].flatMap((title, i): Field[] => [
      { key: `home_step_${i + 1}_title`, label: `Etapa ${i + 1} · Título`, placeholder: title },
      { key: `home_step_${i + 1}_description`, label: `Etapa ${i + 1} · Descrição`, type: "textarea" },
    ]),
  ] },
  { title: "Chamada final e informações", fields: [
    { key: "home_cta_title", label: "Título da chamada final", placeholder: "Precisa de um produto ou de um reparo?" },
    { key: "home_cta_subtitle", label: "Descrição da chamada final", placeholder: "Conte com a Eletrônica Artvideo..." },
    { key: "site_name", label: "Nome do site", placeholder: "Eletrônica Artvideo" },
    { key: "site_description", label: "Descrição do site", placeholder: "Assistência técnica e produtos..." },
    { key: "whatsapp_number", label: "WhatsApp (com DDI)", placeholder: "5579999999999" },
    { key: "privacy_url", label: "URL da política de privacidade (opcional)", placeholder: "https://..." },
  ] },
];

function ImageSetting({ label, mediaId, onChange, disabled }: {
  label: string; mediaId: string; onChange: (id: string) => void; disabled: boolean;
}) {
  return <div className="space-y-2">
    <ImageUpload bucket="public-assets" currentMediaId={mediaId} onUpload={onChange} canUpload={!disabled} label={label} />
    {mediaId && !disabled && <button type="button" onClick={() => onChange("")} className="text-xs font-semibold text-red-600 hover:underline">Remover imagem</button>}
  </div>;
}

export function TabSiteSettings({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("site_settings.view");
  const canViewDetails = hasPermission("site_settings.details.view");
  const canUpdate = hasPermission("site_settings.update");
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const settingsQuery = useSiteSettingsQuery();
  const saveSettings = useSaveSiteSettingsMutation();
  const { services, loading: servicesLoading } = useServices();
  useEffect(() => { if (settingsQuery.data) setSettings(settingsQuery.data); }, [settingsQuery.data]);
  useEffect(() => { if (settingsQuery.error) setToast({ msg: `Erro ao carregar configurações: ${systemErrorMessage(settingsQuery.error)}`, type: "error" }); }, [settingsQuery.error]);

  const disabled = !canUpdate || saveSettings.isPending;
  const updateSetting = (key: string, value: unknown) => { if (!disabled) setSettings(prev => ({ ...prev, [key]: value })); };
  const display = homeServiceDisplay(settings.home_service_display);
  const categories = homeCategories(settings.home_categories);

  const updateService = (id: string, key: "icon" | "media_id", value: string) =>
    updateSetting("home_service_display", { ...display, [id]: { ...display[id], [key]: value } });
  const updateCategory = (index: number, key: "title" | "icon", value: string) =>
    updateSetting("home_categories", categories.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));

  const handleSave = async () => {
    if (disabled) return;
    try {
      await saveSettings.mutateAsync({ settings, updatedBy: user?.id ?? null });
      setToast({ msg: "Configurações do site salvas com sucesso!", type: "success" });
    } catch (error) {
      setToast({ msg: `Erro ao salvar: ${systemErrorMessage(error)}`, type: "error" });
    }
  };

  if (!canView) return null;
  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Configurações do Site" subtitle="Personalize a página pública da Artvideo sem alterar o código." actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{canUpdate && <BtnPrimary onClick={handleSave} loading={saveSettings.isPending} loadingText="Salvando...">Salvar</BtnPrimary>}</div>} />
    {canViewDetails && (settingsQuery.isPending ? <LoadingState /> : <div className="max-w-4xl space-y-5">
      {groups.map(group => <Section key={group.title} title={group.title}>
        <div className="space-y-4">
          {group.subtitle && <p className="text-xs leading-relaxed text-muted-foreground">{group.subtitle}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map(field => <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
              {field.type === "textarea" ? <FTextarea label={field.label} value={String(settings[field.key] ?? "")} disabled={disabled} rows={2} placeholder={field.placeholder} onChange={(e: any) => updateSetting(field.key, e.target.value)} /> :
                <FInput label={field.label} type={field.type || "text"} value={field.type === "color" ? String(settings[field.key] || field.placeholder) : String(settings[field.key] ?? "")} disabled={disabled} placeholder={field.placeholder} onChange={(e: any) => updateSetting(field.key, e.target.value)} />}
            </div>)}
          </div>
          {group.title === "Capa da página inicial" && <ImageSetting label="Enviar foto da capa (recomendado)" mediaId={String(settings.hero_image_media_id || "")} onChange={id => updateSetting("hero_image_media_id", id)} disabled={disabled} />}
          {group.title === "Identidade visual" && <ImageSetting label="Enviar logo da Artvideo (opcional)" mediaId={String(settings.logo_media_id || "")} onChange={id => updateSetting("logo_media_id", id)} disabled={disabled} />}
        </div>
      </Section>)}

      <Section title="Imagens institucionais">
        <p className="mb-4 text-sm text-muted-foreground">Troque as imagens das páginas Sobre nós e Assistência técnica. Enquanto não houver imagem, um degradê aparecerá no lugar.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            { key: "assistance_image_media_id", label: "Capa da assistência técnica" },
            { key: "about_image_media_id", label: "Imagem da empresa · Sobre nós" },
            { key: "team_image_media_id", label: "Imagem da equipe · Sobre nós" },
          ].map(item => <ImageSetting key={item.key} label={item.label} mediaId={String(settings[item.key] || "")} onChange={id => updateSetting(item.key, id)} disabled={disabled} />)}
        </div>
      </Section>
      <Section title="Ícone e imagem de cada serviço na página inicial">
        <p className="mb-4 text-sm text-muted-foreground">Escolha o ícone individualmente. A imagem cadastrada em Produtos e Serviços → Serviços será utilizada automaticamente; você também pode definir uma imagem exclusiva para a home. Os três serviços em destaque aparecem primeiro.</p>
        {servicesLoading ? <p className="text-sm text-muted-foreground">Carregando serviços...</p> : services.length ? <div className="space-y-5">
          {services.map(service => <div key={service.id} className="border-b border-border pb-5 last:border-0 last:pb-0">
            <h4 className="mb-3 text-sm font-bold">{service.title}</h4>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <FSelect label="Ícone do serviço" value={display[service.id]?.icon || "wrench"} disabled={disabled} onChange={(e: any) => updateService(service.id, "icon", e.target.value)} options={PUBLIC_ICON_OPTIONS.map(item => ({ value: item.value, label: item.label }))} />
              <ImageSetting label="Imagem exclusiva para a home (opcional)" mediaId={display[service.id]?.media_id || ""} onChange={id => updateService(service.id, "media_id", id)} disabled={disabled} />
            </div>
          </div>)}
        </div> : <p className="text-sm text-muted-foreground">Cadastre e ative os serviços no CRM para personalizar seus cartões.</p>}
      </Section>

      <Section title="Categorias destacadas na assistência">
        <p className="mb-4 text-sm text-muted-foreground">Defina o nome e o ícone dos atalhos que aparecem na faixa azul-escura da home.</p>
        <div className="space-y-3">
          {categories.map((category, i) => <div className="grid items-end gap-3 border-b border-border pb-3 sm:grid-cols-[1fr_1fr_auto]" key={i}>
            <FInput label={`Categoria ${i + 1}`} value={category.title} disabled={disabled} onChange={(e: any) => updateCategory(i, "title", e.target.value)} />
            <FSelect label="Ícone" value={category.icon} disabled={disabled} onChange={(e: any) => updateCategory(i, "icon", e.target.value)} options={PUBLIC_ICON_OPTIONS.map(item => ({ value: item.value, label: item.label }))} />
            {!disabled && <button type="button" className="mb-2 text-xs font-bold text-red-600" onClick={() => updateSetting("home_categories", categories.filter((_, idx) => idx !== i))}>Remover</button>}
          </div>)}
          {!disabled && <div className="flex flex-wrap gap-4">
            <button type="button" className="text-xs font-bold text-primary" onClick={() => updateSetting("home_categories", [...categories, { title: "Nova categoria", icon: "wrench" }])}>Adicionar categoria</button>
            <button type="button" className="text-xs font-bold text-muted-foreground" onClick={() => updateSetting("home_categories", DEFAULT_HOME_CATEGORIES)}>Restaurar categorias padrão</button>
          </div>}
        </div>
      </Section>
      <p className="text-xs text-muted-foreground">Após enviar imagens, clique em Salvar para publicá-las no site. Sem imagens, o layout exibe degradês automaticamente.</p>
    </div>)}
  </div>;
}
