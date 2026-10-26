import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getArtVideoOrganizationId } from "@/lib/organization-identity";
import { Image, LayoutTemplate, Layers3, MonitorPlay, MessagesSquare, Settings2, Search, PanelsTopLeft, ArrowUp, ArrowDown, Plus, Trash2, Phone, Pencil } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useAuth } from "@/lib/auth";
import { useProducts, useServices } from "@/features/public-catalog/application/usePublicCatalog";
import type { Service } from "@/lib/database.types";
import { siteBanners, type SiteBanner, type SiteBannerType } from "@/features/public-catalog/domain/site-banners";
import { DEFAULT_HOME_CATEGORIES, homeCategories, homeServiceDisplay, PUBLIC_ICON_OPTIONS } from "@/features/public-shell/domain/site-appearance";
import { useSaveSiteSettingsMutation, useSiteSettingsQuery } from "./useSiteSettingsQuery";
import { AdminButton, AdminCard, AdminDialog, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSubsectionButtons } from "@/shared/ui/admin/AdminSubsectionButtons";
import { SiteContactFields, siteContactGroups } from "./SiteContactFields";
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

type SiteSection = "identity" | "home" | "banners" | "catalog" | "assistance" | "testimonials" | "general" | "contact";

const sections = [
  { id: "identity", label: "Identidade", icon: Image, hint: "Cores, logo e imagens institucionais." },
  { id: "home", label: "Página inicial", icon: LayoutTemplate, hint: "Capa, acessos, etapas e chamada final." },
  { id: "banners", label: "Banners", icon: PanelsTopLeft, hint: "Banners da loja e dos serviços, associados a produtos ou serviços ou livres." },
  { id: "catalog", label: "Catálogos", icon: Layers3, hint: "Produtos e apresentação visual dos serviços." },
  { id: "assistance", label: "Assistência", icon: MonitorPlay, hint: "Marcas e categorias atendidas." },
  { id: "testimonials", label: "Depoimentos", icon: MessagesSquare, hint: "Textos ilustrativos da página inicial." },
  { id: "general", label: "Informações", icon: Settings2, hint: "Dados institucionais e informações do site." },
  { id: "contact", label: "Contato", icon: Phone, hint: "Telefone, WhatsApp, redes sociais, endereço e horários." },
] as const;

const sectionGroups: Record<SiteSection, string[]> = {
  identity: ["Identidade visual"],
  home: ["Capa da página inicial", "Três acessos rápidos", "Etapas do atendimento", "Chamada final e informações"],
  banners: [],
  catalog: ["Catálogos na página inicial"],
  assistance: ["Assistência e marcas"],
  testimonials: ["Depoimentos temporários"],
  general: ["Chamada final e informações"],
  contact: [],
};

function BannerSettingsEditor({ banners, services, disabled, onChange }: {
  banners: SiteBanner[];
  services: Service[];
  disabled: boolean;
  onChange: (banners: SiteBanner[]) => void;
}) {
  const { products, loading: productsLoading } = useProducts();
  const edit = (index: number, patch: Partial<SiteBanner>) =>
    onChange(banners.map((item, i) => i === index ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;
    const next = [...banners];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = () => onChange([...banners, {
    id: "banner-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
    placement: "loja", type: "livre", referenceId: "",
    title: "", description: "", label: "", actionLabel: "",
    actionPage: "", imageId: "", active: true,
  }]);
  return <Section title="Banners da loja e dos serviços"
    description="Crie banners próprios com imagem opcional. Escolha onde aparecem, associe a um produto ou serviço ou deixe como banner livre. A ordem abaixo define a sequência do carrossel.">
    <div className="space-y-4">
      {banners.map((banner, index) => {
        const linkedItems = banner.type === "produto"
          ? products.map(product => ({ value: product.id, label: product.name }))
          : banner.type === "servico"
            ? services.map(service => ({ value: service.id, label: service.title }))
            : [];
        return <div key={banner.id} className="space-y-4 rounded-xl border border-border bg-background p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-sm font-bold text-foreground">{banner.title || (banner.type === "livre" ? "Novo banner" : "Banner vinculado")}</p>
                <p className="text-xs text-muted-foreground">{banner.placement === "ambos" ? "Loja e serviços" : banner.placement === "loja" ? "Loja" : "Serviços"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" role="switch" aria-label={`Ativar banner ${index + 1}`} checked={banner.active} disabled={disabled}
                  onChange={event => edit(index, { active: event.target.checked })} className="h-4 w-4 accent-primary"/>
                Ativo
              </label>
              <button type="button" onClick={() => move(index, -1)} disabled={disabled || index === 0} title="Subir banner" aria-label="Subir banner"
                className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-35"><ArrowUp size={16}/></button>
              <button type="button" onClick={() => move(index, 1)} disabled={disabled || index === banners.length - 1} title="Descer banner" aria-label="Descer banner"
                className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-35"><ArrowDown size={16}/></button>
              <button type="button" onClick={() => onChange(banners.filter(item => item.id !== banner.id))}
                disabled={disabled} title="Excluir banner" aria-label="Excluir banner"
                className="rounded-md border border-border p-2 text-destructive hover:bg-destructive/10 disabled:opacity-35"><Trash2 size={16}/></button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FSelect label="Exibir em" disabled={disabled} value={banner.placement}
              onChange={(event: any) => edit(index, { placement: event.target.value })}
              options={[{ value: "loja", label: "Loja" }, { value: "servicos", label: "Serviços" }, { value: "ambos", label: "Loja e Serviços" }]}/>
            <FSelect label="Tipo de banner" disabled={disabled} value={banner.type}
              onChange={(event: any) => edit(index, { type: event.target.value as SiteBannerType, referenceId: "", title: "", description: "", label: "", actionLabel: "" })}
              options={[{ value: "livre", label: "Banner livre" }, { value: "produto", label: "Produto cadastrado" }, { value: "servico", label: "Serviço cadastrado" }]}/>
            {banner.type !== "livre" && <div className="sm:col-span-2">
              <FSelect label={banner.type === "produto" ? "Selecionar produto" : "Selecionar serviço"}
                disabled={disabled || (banner.type === "produto" && productsLoading)}
                value={banner.referenceId}
                onChange={(event: any) => edit(index, { referenceId: event.target.value })}
                options={[{ value: "", label: "Selecione um item" }, ...linkedItems]}/>
              {!banner.referenceId && <p className="mt-1 text-xs text-amber-600">Escolha um item para publicar este banner.</p>}
            </div>}
            <FInput label="Título (opcional para item vinculado)" disabled={disabled} value={banner.title}
              placeholder={banner.type === "livre" ? "Título do banner" : "Padrão: nome do item"}
              onChange={(event: any) => edit(index, { title: event.target.value })}/>
            <FInput label="Destaque acima do título" disabled={disabled} value={banner.label}
              placeholder="Ex.: Loja Artvideo"
              onChange={(event: any) => edit(index, { label: event.target.value })}/>
            <div className="sm:col-span-2">
              <FTextarea label="Descrição do banner" rows={2} disabled={disabled} value={banner.description}
                placeholder="Uma frase curta para apresentar a oferta ou o serviço."
                onChange={(event: any) => edit(index, { description: event.target.value })}/>
            </div>
            <FInput label="Texto do botão" disabled={disabled} value={banner.actionLabel}
              placeholder="Ex.: Saiba mais"
              onChange={(event: any) => edit(index, { actionLabel: event.target.value })}/>
            {banner.type === "livre" ? <FSelect label="Destino do botão" value={banner.actionPage} disabled={disabled}
              onChange={(event: any) => edit(index, { actionPage: event.target.value })}
              options={[{ value: "", label: "Sem botão" }, { value: "loja", label: "Loja" }, { value: "servicos", label: "Serviços" },
                { value: "assistencia", label: "Assistência" }, { value: "orcamento", label: "Solicitar orçamento" }, { value: "contato", label: "Contato" }]}/>
              : <div className="flex items-center text-xs text-muted-foreground">O botão abrirá automaticamente o {banner.type === "produto" ? "produto" : "serviço"} selecionado.</div>}
          </div>
          <div className="border-t border-border pt-4">
            <ImageSetting label="Imagem exclusiva do banner (opcional: sem imagem, usa arte em degradê)"
              mediaId={banner.imageId} onChange={imageId => edit(index, { imageId })} disabled={disabled}/>
          </div>
        </div>;
      })}
      {!banners.length && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum banner cadastrado. A loja e os serviços aparecerão sem carrossel até você adicionar um.</p>}
      <button type="button" disabled={disabled} onClick={add}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50">
        <Plus size={16}/> Adicionar banner
      </button>
      <p className="text-xs text-muted-foreground">Depois das alterações, clique em Salvar na barra inferior. Os banners não alteram fotos, preços ou destaques cadastrados de produtos e serviços.</p>
    </div>
  </Section>;
}

export function TabSiteSettings({ onBack, initialSection }: { onBack: () => void; initialSection?: SiteSection }) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("site_settings.view");
  const canViewDetails = hasPermission("site_settings.details.view");
  const canUpdate = hasPermission("site_settings.update");
  const canViewContact = hasPermission("contact.view");
  const canViewContactDetails = hasPermission("contact.details.view");
  const canUpdateContact = hasPermission("contact.update");
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [section, setSection] = useState<SiteSection>(initialSection || "identity");
  const [editor, setEditor] = useState<string | null>(null);
  useEffect(() => { if (initialSection) setSection(initialSection); }, [initialSection]);
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
  const contactSection = section === "contact";
  const canEditCurrent = contactSection ? canUpdateContact : canUpdate;
  const disabled = !canEditCurrent || busy;
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
    if (disabled) return false;
    try {
      await saveSettings.mutateAsync({ settings, updatedBy: user?.id ?? null });
      setToast({ msg: "Configurações salvas com sucesso!", type: "success" });
      return true;
    } catch (error) {
      setToast({ msg: "Erro ao salvar: " + systemErrorMessage(error), type: "error" });
      return false;
    }
  };

  if (!canView && !canViewContact) return null;
  const availableSections = sections.filter(item => item.id === "contact"
    ? canViewContact && canViewContactDetails : canView);
  const visibleGroups = groups.filter(group => sectionGroups[section].includes(group.title));

  const editableGroups = visibleGroups.map(group => ({
    ...group,
    title: group.title === "Chamada final e informações"
      ? section === "home" ? "Chamada final" : "Informações do site" : group.title,
    fields: group.title === "Chamada final e informações"
      ? group.fields.filter(field => section === "home" ? field.key.startsWith("home_cta_") : !field.key.startsWith("home_cta_"))
      : group.fields,
  })).filter(group => group.fields.length > 0);
  const editingGroup = editor?.startsWith("group:")
    ? editableGroups.find(group => group.title === editor.slice(6)) : undefined;
  const editingService = editor?.startsWith("service:")
    ? services.find(service => service.id === editor.slice(8)) : undefined;
  const editingCategoryIndex = editor?.startsWith("category:") ? Number(editor.slice(9)) : -1;
  const editingCategory = editingCategoryIndex >= 0 ? categories[editingCategoryIndex] : null;
  const editingContact = editor?.startsWith("contact:")
    ? siteContactGroups.find(group => group.id === editor.slice(8)) : undefined;
  const modalTitle = editingGroup?.title || editingService?.title ||
    (editingCategory ? "Editar categoria" : "") || editingContact?.title ||
    (editor === "banners" ? "Banners" : editor === "institutional" ? "Imagens institucionais" : "");
  const modalDescription = editingGroup?.subtitle || editingContact?.description ||
    "Edite os dados e salve para publicá-los no site.";
  const closeEditor = () => { if (!busy) setEditor(null); };

  return <div className="min-w-0 space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Configurações do Site"
      subtitle="Personalize a aparência, os textos e os dados públicos da Artvideo." />

    <AdminSubsectionButtons value={section} ariaLabel="Subseções das configurações do site"
      items={availableSections.map(item => ({
        id: item.id,
        label: item.label,
        Icon: item.icon,
      }))}
      onChange={value => { setEditor(null); setSection(value); }} />

    {settingsQuery.isPending ? <LoadingState /> : settingsQuery.isError
      ? <Section title="Falha ao carregar dados">
          <AdminButton variant="secondary" onClick={() => void settingsQuery.refetch()}>Tentar novamente</AdminButton>
        </Section>
      : (contactSection ? canViewContactDetails : canViewDetails) ? <div className="min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {editableGroups.map(group => {
            const filled = group.fields.filter(field => String(settings[field.key] || "").trim()).length;
            return <AdminCard key={group.title} className="flex min-w-0 flex-col justify-between gap-3 p-4">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground">{group.title}</h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{group.subtitle || group.fields.map(field => field.label).slice(0, 3).join(" · ")}</p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">{filled} de {group.fields.length} campos preenchidos</p>
              </div>
              <AdminButton size="sm" variant="secondary" onClick={() => setEditor("group:" + group.title)}
                className="self-start"><Pencil size={14}/> {canEditCurrent ? "Editar" : "Visualizar"}</AdminButton>
            </AdminCard>;
          })}

          {section === "identity" && <AdminCard className="flex min-w-0 flex-col justify-between gap-3 p-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Imagens institucionais</h2>
              <p className="mt-1 text-xs text-muted-foreground">Fotos de assistência, empresa e equipe.</p>
            </div>
            <AdminButton size="sm" variant="secondary" onClick={() => setEditor("institutional")} className="self-start">
              <Image size={14}/> {canEditCurrent ? "Editar imagens" : "Visualizar"}
            </AdminButton>
          </AdminCard>}

          {section === "banners" && <AdminCard className="flex min-w-0 flex-col justify-between gap-3 p-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Banners da loja e serviços</h2>
              <p className="mt-1 text-xs text-muted-foreground">Organize títulos, destinos, imagens e a sequência.</p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">{siteBanners(settings.site_banners).length} banner(s) cadastrado(s)</p>
            </div>
            <AdminButton size="sm" variant="secondary" onClick={() => setEditor("banners")} className="self-start">
              <PanelsTopLeft size={14}/> Gerenciar banners
            </AdminButton>
          </AdminCard>}

          {section === "contact" && siteContactGroups.map(group => {
            const keys: Record<string,string[]> = {
              channels: ["phone","whatsapp","email"], social: ["instagram"],
              address: ["zip_code","street","number","complement","neighborhood","city","state"],
              hours: ["business_hours"], business: ["company_name"],
            };
            const filled = keys[group.id].filter(key => String(settings[key] || "").trim()).length;
            return <AdminCard key={group.id} className="flex min-w-0 flex-col justify-between gap-3 p-4">
              <div>
                <h2 className="text-sm font-bold text-foreground">{group.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">{filled} de {keys[group.id].length} campos preenchidos</p>
              </div>
              <AdminButton size="sm" variant="secondary" onClick={() => setEditor("contact:" + group.id)}
                className="self-start"><Pencil size={14}/> {canEditCurrent ? "Editar" : "Visualizar"}</AdminButton>
            </AdminCard>;
          })}
        </div>

        {section === "catalog" && <AdminCard className="min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Ícones e imagens dos serviços</h2>
              <p className="text-xs text-muted-foreground">Configure somente o serviço que deseja alterar.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input value={serviceSearch} onChange={event => setServiceSearch(event.target.value)}
                placeholder="Buscar serviço" aria-label="Buscar serviço" className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary"/>
            </div>
          </div>
          {servicesLoading ? <LoadingState /> : <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {filteredServices.map(service => <div key={service.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{service.title}</span>
              <AdminButton size="sm" variant="secondary" onClick={() => setEditor("service:" + service.id)}><Pencil size={14}/> Editar</AdminButton>
            </div>)}
            {!filteredServices.length && <p className="py-4 text-sm text-muted-foreground">Nenhum serviço encontrado.</p>}
          </div>}
        </AdminCard>}

        {section === "assistance" && <AdminCard className="min-w-0 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Categorias da assistência</h2>
              <p className="text-xs text-muted-foreground">Atalhos exibidos na página inicial.</p>
            </div>
            {canEditCurrent && <AdminButton size="sm" onClick={() => {
              updateSetting("home_categories", [...categories, { title: "Nova categoria", icon: "wrench" }]);
              setEditor("category:" + categories.length);
            }}><Plus size={14}/> Nova</AdminButton>}
          </div>
          <div className="divide-y divide-border">
            {categories.map((category, index) => <div key={index} className="flex min-w-0 items-center justify-between gap-3 py-2">
              <span className="truncate text-sm font-medium text-foreground">{category.title || "Sem título"}</span>
              <div className="flex shrink-0 items-center gap-2">
                <AdminButton size="sm" variant="secondary" onClick={() => setEditor("category:" + index)}><Pencil size={14}/> Editar</AdminButton>
                {canEditCurrent && <AdminButton size="sm" variant="danger" onClick={() =>
                  updateSetting("home_categories", categories.filter((_, i) => i !== index))} aria-label="Remover categoria"><Trash2 size={14}/></AdminButton>}
              </div>
            </div>)}
          </div>
          {canEditCurrent && <button type="button" onClick={() => updateSetting("home_categories", DEFAULT_HOME_CATEGORIES)}
            className="mt-3 text-xs font-semibold text-muted-foreground hover:text-primary">Restaurar categorias padrão</button>}
        </AdminCard>}

        <p className="px-1 text-xs text-muted-foreground">As alterações ficam pendentes até clicar em Salvar. Você pode editar várias subseções antes de salvar.</p>
      </div> : null}

    <AdminDialog open={Boolean(editor)} onClose={closeEditor} title={modalTitle} description={modalDescription}
      className="max-w-3xl" bodyClassName="p-4 sm:p-5" footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AdminButton variant="secondary" disabled={busy} onClick={closeEditor}>Fechar</AdminButton>
          {canEditCurrent && <AdminButton disabled={busy || !dirty} loading={busy}
            onClick={async () => { if (await handleSave()) setEditor(null); }}>Salvar alterações</AdminButton>}
        </div>
      }>
      {editingGroup && <div className="space-y-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {editingGroup.fields.map(field => <div key={field.key} className={field.type === "textarea" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
            {field.type === "textarea" ? <FTextarea label={field.label} rows={2} value={String(settings[field.key] ?? "")}
              disabled={disabled} placeholder={field.placeholder}
              onChange={(event: any) => updateSetting(field.key, event.target.value)} /> :
            <FInput label={field.label} type={field.type || "text"}
              value={field.type === "color" ? String(settings[field.key] || field.placeholder) : String(settings[field.key] ?? "")}
              disabled={disabled} placeholder={field.placeholder}
              onChange={(event: any) => updateSetting(field.key, event.target.value)} />}
          </div>)}
        </div>
        {editingGroup.title === "Identidade visual" && <ImageSetting label="Logotipo do site"
          mediaId={String(settings.logo_media_id || "")} onChange={id => updateSetting("logo_media_id", id)} disabled={disabled}/>}
        {editingGroup.title === "Capa da página inicial" && <ImageSetting label="Foto da capa"
          mediaId={String(settings.hero_image_media_id || "")} onChange={id => updateSetting("hero_image_media_id", id)} disabled={disabled}/>}
      </div>}
      {editor === "institutional" && <div className="grid gap-4 sm:grid-cols-2">
        {[
          { key: "assistance_image_media_id", label: "Capa da assistência técnica" },
          { key: "about_image_media_id", label: "Imagem da empresa" },
          { key: "team_image_media_id", label: "Imagem da equipe" },
        ].map(item => <ImageSetting key={item.key} label={item.label}
          mediaId={String(settings[item.key] || "")} onChange={id => updateSetting(item.key, id)} disabled={disabled} />)}
      </div>}
      {editor === "banners" && <BannerSettingsEditor banners={siteBanners(settings.site_banners)} services={services}
        disabled={disabled} onChange={value => updateSetting("site_banners", value)}/>}
      {editingService && <div className="grid gap-4 sm:grid-cols-2">
        <FSelect label="Ícone" disabled={disabled}
          value={display[editingService.id]?.icon || editingService.public_icon || "wrench"}
          onChange={(event: any) => updateService(editingService.id, "icon", event.target.value)}
          options={PUBLIC_ICON_OPTIONS.map(item => ({ value: item.value, label: item.label }))}/>
        <ImageSetting label="Imagem exclusiva na home"
          mediaId={display[editingService.id]?.media_id || ""}
          onChange={id => updateService(editingService.id, "media_id", id)} disabled={disabled}/>
      </div>}
      {editingCategory && <div className="grid gap-3 sm:grid-cols-2">
        <FInput label="Nome da categoria" value={editingCategory.title} disabled={disabled}
          onChange={(event: any) => updateCategory(editingCategoryIndex, "title", event.target.value)} />
        <FSelect label="Ícone" value={editingCategory.icon} disabled={disabled}
          onChange={(event: any) => updateCategory(editingCategoryIndex, "icon", event.target.value)}
          options={PUBLIC_ICON_OPTIONS.map(item => ({ value: item.value, label: item.label }))}/>
      </div>}
      {editingContact && <SiteContactFields group={editingContact.id} settings={settings}
        onChange={(key, value) => updateSetting(key, value)} disabled={disabled}/>}
    </AdminDialog>

    <AdminStickyToolbar className="mt-4">
      <BtnSecondary onClick={back} disabled={busy}>Voltar</BtnSecondary>
      {dirty && <span className="hidden text-xs font-semibold text-amber-600 sm:inline">Alterações não salvas</span>}
      {canEditCurrent && <BtnPrimary onClick={handleSave} disabled={settingsQuery.isPending || settingsQuery.isError || !dirty}
        loading={busy} loadingText="Salvando...">Salvar</BtnPrimary>}
    </AdminStickyToolbar>
  </div>;
}
