import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getArtVideoOrganizationId } from "@/lib/organization-identity";
import { Image, LayoutTemplate, Layers3, MonitorPlay, MessagesSquare, Settings2, Search, X } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useAuth } from "@/lib/auth";
import { useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { DEFAULT_HOME_CATEGORIES, homeCategories, homeServiceDisplay, PUBLIC_ICON_OPTIONS } from "@/features/public-shell/domain/site-appearance";
import { useSaveSiteSettingsMutation, useSiteSettingsQuery } from "./useSiteSettingsQuery";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
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
  { title: "Depoimentos temporários", subtitle: "Até cadastrar avaliações reais, a home mostra três textos ilustrativos, devidamente identificados.", fields: [
    { key: "home_testimonials_title", label: "Título da seção", placeholder: "Uma experiência de atendimento que faz diferença" },
    { key: "home_testimonials_subtitle", label: "Descrição", placeholder: "Cuidado, transparência e atenção em cada atendimento." },
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
  const mediaOrganizationQuery = useQuery({
    queryKey: ["organization", "artvideo-id"],
    queryFn: getArtVideoOrganizationId,
    staleTime: Infinity,
  });
  return <div className="space-y-2">
    <ImageUpload bucket="public-assets" organizationId={mediaOrganizationQuery.data}
      currentMediaId={mediaId} onUpload={onChange}
      canUpload={!disabled && Boolean(mediaOrganizationQuery.data)}
      label={label} />
    {mediaId && !disabled && <button type="button" onClick={() => onChange("")} className="text-xs font-semibold text-red-600 hover:underline">Remover imagem</button>}
  </div>;
}

type SiteSection = "identity" | "home" | "catalog" | "assistance" | "testimonials" | "general";

const sections = [
  { id: "identity", label: "Identidade", icon: Image, hint: "Cores, logo e imagens institucionais." },
  { id: "home", label: "Página inicial", icon: LayoutTemplate, hint: "Capa, acessos, etapas e chamada final." },
  { id: "catalog", label: "Catálogos", icon: Layers3, hint: "Produtos e apresentação visual dos serviços." },
  { id: "assistance", label: "Assistência", icon: MonitorPlay, hint: "Marcas e categorias atendidas." },
  { id: "testimonials", label: "Depoimentos", icon: MessagesSquare, hint: "Textos ilustrativos da página inicial." },
  { id: "general", label: "Informações", icon: Settings2, hint: "Dados institucionais e informações do site." },
] as const;

const sectionGroups: Record<SiteSection, string[]> = {
  identity: ["Identidade visual"],
  home: ["Capa da página inicial", "Três acessos rápidos", "Etapas do atendimento", "Chamada final e informações"],
  catalog: ["Catálogos na página inicial"],
  assistance: ["Assistência e marcas"],
  testimonials: ["Depoimentos temporários"],
  general: ["Chamada final e informações"],
};

export function TabSiteSettings({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("site_settings.view");
  const canViewDetails = hasPermission("site_settings.details.view");
  const canUpdate = hasPermission("site_settings.update");
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [section, setSection] = useState<SiteSection>("identity");
  const [serviceSearch, setServiceSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const settingsQuery = useSiteSettingsQuery();
  const saveSettings = useSaveSiteSettingsMutation();
  const { services, loading: servicesLoading } = useServices();

  useEffect(() => { if (settingsQuery.data) setSettings(settingsQuery.data); }, [settingsQuery.data]);
  useEffect(() => {
    if (settingsQuery.error) setToast({
      msg: "Erro ao carregar configurações: " + systemErrorMessage(settingsQuery.error), type: "error",
    });
  }, [settingsQuery.error]);

  const busy = saveSettings.isPending;
  const disabled = !canUpdate || busy;
  const dirty = Boolean(settingsQuery.data) && JSON.stringify(settings) !== JSON.stringify(settingsQuery.data);
  const display = homeServiceDisplay(settings.home_service_display);
  const categories = homeCategories(settings.home_categories);
  const filteredServices = useMemo(() => {
    const query = serviceSearch.trim().toLocaleLowerCase("pt-BR");
    return services.filter(item => !query || item.title.toLocaleLowerCase("pt-BR").includes(query));
  }, [services, serviceSearch]);

  const updateSetting = (key: string, value: unknown) => {
    if (disabled) return;
    setSettings(previous => ({ ...previous, [key]: value }));
  };
  const updateService = (id: string, key: "icon" | "media_id", value: string) =>
    updateSetting("home_service_display", { ...display, [id]: { ...display[id], [key]: value } });
  const updateCategory = (index: number, key: "title" | "icon", value: string) =>
    updateSetting("home_categories", categories.map((item, i) => i === index ? { ...item, [key]: value } : item));

  const back = () => {
    if (dirty && !window.confirm("Existem alterações não salvas. Deseja sair?")) return;
    onBack();
  };

  const handleSave = async () => {
    if (disabled) return;
    try {
      await saveSettings.mutateAsync({ settings, updatedBy: user?.id ?? null });
      setToast({ msg: "Configurações do site salvas com sucesso!", type: "success" });
    } catch (error) {
      setToast({ msg: "Erro ao salvar: " + systemErrorMessage(error), type: "error" });
    }
  };

  if (!canView) return null;
  const current = sections.find(item => item.id === section)!;
  const CurrentIcon = current.icon;
  const visibleGroups = groups.filter(group => sectionGroups[section].includes(group.title));

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Configurações do Site" eyebrow="Site"
      subtitle="Organize a aparência e o conteúdo da Artvideo em subseções." />
    <nav aria-label="Subseções das configurações do site"
      className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card p-2">
      <div className="grid min-w-[650px] grid-cols-6 gap-1.5">
        {sections.map(item => {
          const Icon = item.icon;
          const active = item.id === section;
          return <button type="button" key={item.id}
            aria-current={active ? "page" : undefined}
            onClick={() => setSection(item.id)}
            className={"flex min-h-[78px] flex-col items-center justify-center gap-2 rounded-lg border px-2 py-3 text-center text-xs font-bold transition-colors " +
              (active ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Icon size={20} strokeWidth={1.8} />
            <span className="leading-tight">{item.label}</span>
          </button>;
        })}
      </div>
    </nav>
    {settingsQuery.isPending ? <LoadingState /> : settingsQuery.isError ? (
      <Section title="Falha ao carregar dados">
        <button type="button" onClick={() => void settingsQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline">Tentar novamente</button>
      </Section>
    ) : canViewDetails ? <div className="min-w-0 space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CurrentIcon size={20} />
        </span>
        <div>
          <h2 className="text-sm font-black text-foreground">{current.label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{current.hint}</p>
        </div>
      </div>
      {visibleGroups.map(group => {
        const fields = group.title === "Chamada final e informações"
          ? group.fields.filter(field => section === "home"
              ? field.key.startsWith("home_cta_")
              : !field.key.startsWith("home_cta_"))
          : group.fields;
        if (!fields.length) return null;
        const title = group.title === "Chamada final e informações"
          ? section === "home" ? "Chamada final" : "Informações do site"
          : group.title;
        return <Section key={title} title={title} description={group.subtitle}>
          <div className="space-y-4">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {fields.map(field => <div key={field.key} className={field.type === "textarea" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                {field.type === "textarea" ? <FTextarea label={field.label} rows={3}
                  value={String(settings[field.key] ?? "")} disabled={disabled}
                  placeholder={field.placeholder}
                  onChange={(event: any) => updateSetting(field.key, event.target.value)} /> :
                  <FInput label={field.label} type={field.type || "text"}
                    value={field.type === "color" ? String(settings[field.key] || field.placeholder) : String(settings[field.key] ?? "")}
                    disabled={disabled} placeholder={field.placeholder}
                    onChange={(event: any) => updateSetting(field.key, event.target.value)} />}
              </div>)}
            </div>
            {group.title === "Identidade visual" && <ImageSetting label="Logotipo do site"
              mediaId={String(settings.logo_media_id || "")}
              onChange={id => updateSetting("logo_media_id", id)} disabled={disabled} />}
            {group.title === "Capa da página inicial" && <ImageSetting label="Foto da capa"
              mediaId={String(settings.hero_image_media_id || "")}
              onChange={id => updateSetting("hero_image_media_id", id)} disabled={disabled} />}
          </div>
        </Section>;
      })}
      {section === "identity" && <Section title="Imagens institucionais"
        description="Fotos das páginas Sobre nós e Assistência. O degradê permanece até escolher uma imagem.">
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          {[
            { key: "assistance_image_media_id", label: "Capa da assistência técnica" },
            { key: "about_image_media_id", label: "Imagem da empresa" },
            { key: "team_image_media_id", label: "Imagem da equipe" },
          ].map(item => <ImageSetting key={item.key} label={item.label}
            mediaId={String(settings[item.key] || "")}
            onChange={id => updateSetting(item.key, id)} disabled={disabled} />)}
        </div>
      </Section>}
      {section === "catalog" && <Section title="Ícones e imagens dos serviços"
        description="Personalize a apresentação de cada serviço no site.">
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={serviceSearch} onChange={event => setServiceSearch(event.target.value)}
              placeholder="Buscar serviço" aria-label="Buscar serviço"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm outline-none focus:border-primary" />
            {serviceSearch && <button type="button" onClick={() => setServiceSearch("")}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>}
          </div>
          {servicesLoading ? <p className="text-sm text-muted-foreground">Carregando serviços...</p>
          : filteredServices.length ? <div className="space-y-3">
            {filteredServices.map(service => <details key={service.id}
              className="rounded-lg border border-border bg-background p-4">
              <summary className="cursor-pointer text-sm font-bold">{service.title}</summary>
              <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                <FSelect label="Ícone" disabled={disabled}
                  value={display[service.id]?.icon || service.public_icon || "wrench"}
                  onChange={(event: any) => updateService(service.id, "icon", event.target.value)}
                  options={PUBLIC_ICON_OPTIONS.map(item => ({ value: item.value, label: item.label }))} />
                <ImageSetting label="Imagem exclusiva na home (opcional)"
                  mediaId={display[service.id]?.media_id || ""}
                  onChange={id => updateService(service.id, "media_id", id)} disabled={disabled} />
              </div>
            </details>)}
          </div> : <p className="text-sm text-muted-foreground">{serviceSearch ? "Nenhum serviço encontrado." : "Não há serviços publicados."}</p>}
        </div>
      </Section>}
      {section === "assistance" && <Section title="Categorias da assistência"
        description="Atalhos com ícones exibidos na página inicial.">
        <div className="space-y-3">
          {categories.map((category, i) => <div key={i}
            className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
            <FInput label={"Categoria " + (i + 1)} value={category.title} disabled={disabled}
              onChange={(event: any) => updateCategory(i, "title", event.target.value)} />
            <FSelect label="Ícone" value={category.icon} disabled={disabled}
              onChange={(event: any) => updateCategory(i, "icon", event.target.value)}
              options={PUBLIC_ICON_OPTIONS.map(item => ({ value: item.value, label: item.label }))} />
            {canUpdate && <button type="button" disabled={busy}
              className="mb-2 rounded-lg px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
              onClick={() => updateSetting("home_categories", categories.filter((_, index) => index !== i))}>Remover</button>}
          </div>)}
          {canUpdate && <div className="flex flex-wrap gap-4">
            <button type="button" className="text-xs font-bold text-primary hover:underline"
              onClick={() => updateSetting("home_categories", [...categories, { title: "Nova categoria", icon: "wrench" }])}>Adicionar categoria</button>
            <button type="button" className="text-xs font-bold text-muted-foreground hover:underline"
              onClick={() => updateSetting("home_categories", DEFAULT_HOME_CATEGORIES)}>Restaurar categorias padrão</button>
          </div>}
        </div>
      </Section>}
      <p className="px-1 text-xs text-muted-foreground">As alterações são salvas juntas, independentemente da subseção aberta.</p>
    </div> : null}
    <AdminStickyToolbar className="mt-5">
      <BtnSecondary onClick={back} disabled={busy}>Voltar</BtnSecondary>
      {dirty && <span className="hidden text-xs font-semibold text-amber-600 sm:inline">Alterações não salvas</span>}
      {canUpdate && <BtnPrimary onClick={handleSave} disabled={settingsQuery.isPending || settingsQuery.isError || !dirty}
        loading={busy} loadingText="Salvando...">Salvar</BtnPrimary>}
    </AdminStickyToolbar>
  </div>;
}
