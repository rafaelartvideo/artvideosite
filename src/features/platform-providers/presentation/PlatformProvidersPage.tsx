import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MapPin, Paperclip, Pencil, Phone, Plus, Search, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminIconButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  addPlatformService, addProviderAttachment, draftFromProvider,
  countPlatformProviders, editPlatformService, emptyProviderDraft, listPlatformProviders, listPlatformServices,
  listProviderAttachments, listProviderLocations,
  removeProviderAttachment, savePlatformProvider,
  type PlatformProvider, type PlatformProviderDraft, type PlatformService,
  type ProviderFilters,
} from "../infrastructure/platform-providers.repository";
import { PlatformProviderEditor } from "./PlatformProviderEditor";
import { ProviderFiltersPanel } from "./ProviderFiltersPanel";
import { ProviderDetailsDialog } from "./ProviderDetailsDialog";
import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { formatPhone } from "@/shared/domain/formatters";

const inputClass = "h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary";
const normalSort = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
const emptyFilters = (): ProviderFilters => ({
  search: "", serviceIds: [], states: [], cities: [], statuses: [], page: 1, pageSize: 24,
});

function ServiceChoices({ services, selected, onToggle }: {
  services: PlatformService[]; selected: string[]; onToggle: (id: string) => void;
}) {
  const sorted = useMemo(() => services
    .filter(item => item.is_active || selected.includes(item.id))
    .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || normalSort(a.name, b.name)),
    [services, selected]);
  return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
    {sorted.map(service => <label key={service.id}
      className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-semibold ${selected.includes(service.id) ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground"}`}>
      <input type="checkbox" checked={selected.includes(service.id)}
        onChange={() => onToggle(service.id)} className="h-4 w-4 shrink-0 accent-primary" />
      <span className="min-w-0 flex-1">{service.name}</span>
      {selected.includes(service.id) && <Check size={13} className="shrink-0 text-primary" />}
    </label>)}
    {sorted.length === 0 && <p className="text-xs text-muted-foreground">Cadastre o primeiro serviço.</p>}
  </div>;
}

export function PlatformProvidersPage() {
  const { activeOrganizationId, activeOrganization, hasPermission } = useAuth();
  const isUnion = activeOrganization?.is_platform_operator === true;
  const canView = isUnion && hasPermission("platform.providers.view");
  const canManage = isUnion && hasPermission("platform.providers.manage");
  const queryClient = useQueryClient();
  const [section, setSection] = useState<"providers" | "services">("providers");
  const [filters, setFilters] = useState<ProviderFilters>(emptyFilters());
  const [searchText, setSearchText] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewing, setViewing] = useState<PlatformProvider | null>(null);
  const [editing, setEditing] = useState<PlatformProvider | null>(null);
  const [draft, setDraft] = useState<PlatformProviderDraft>(emptyProviderDraft());
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [persistedProviderId, setPersistedProviderId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [editingService, setEditingService] = useState<PlatformService | null>(null);
  const [serviceEditName, setServiceEditName] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters(current => current.search === searchText ? current : { ...current, search: searchText, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  useEffect(() => { setFilters(emptyFilters()); setSearchText(""); setEditorOpen(false); setViewing(null); setPersistedProviderId(null); }, [activeOrganizationId]);

  const servicesQuery = useQuery({
    queryKey: ["union-provider-services", activeOrganizationId],
    queryFn: () => listPlatformServices(activeOrganizationId!),
    enabled: Boolean(canView && activeOrganizationId), staleTime: 60_000,
  });
  const locationsQuery = useQuery({
    queryKey: ["union-provider-locations", activeOrganizationId],
    queryFn: listProviderLocations,
    enabled: Boolean(canView && activeOrganizationId), staleTime: 60_000,
  });
  const providersQuery = useQuery({
    queryKey: ["union-platform-providers", activeOrganizationId, filters],
    queryFn: () => listPlatformProviders(filters),
    enabled: Boolean(canView && activeOrganizationId), staleTime: 15_000,
  });
  const totalCountQuery = useQuery({
    queryKey: ["union-platform-providers-total", activeOrganizationId],
    queryFn: () => countPlatformProviders(activeOrganizationId!),
    enabled: Boolean(canView && activeOrganizationId), staleTime: 30_000,
  });
  const attachmentsQuery = useQuery({
    queryKey: ["union-provider-attachments", activeOrganizationId, editing?.id],
    queryFn: () => listProviderAttachments(activeOrganizationId!, editing!.id),
    enabled: Boolean(canView && activeOrganizationId && editing?.id && editorOpen),
  });

  const services = servicesQuery.data || [];
  const providers = providersQuery.data?.providers || [];
  const total = providersQuery.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const catalogFiltered = useMemo(() => services
    .filter(item => item.name.toLocaleLowerCase("pt-BR").includes(catalogSearch.trim().toLocaleLowerCase("pt-BR")))
    .sort((a,b) => normalSort(a.name,b.name)), [services, catalogSearch]);

  const changeFilter = (patch: Partial<ProviderFilters>) =>
    setFilters(current => ({ ...current, ...patch, page: 1 }));

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["union-platform-providers", activeOrganizationId] }),
      queryClient.invalidateQueries({ queryKey: ["union-provider-locations", activeOrganizationId] }),
      queryClient.invalidateQueries({ queryKey: ["union-platform-providers-total", activeOrganizationId] }),
    ]);
  };
  const openNew = () => {
    setEditing(null); setDraft(emptyProviderDraft()); setSelectedServiceIds([]);
    setPendingFiles([]); setServiceName(""); setPersistedProviderId(null); setEditorOpen(true);
  };
  const openEdit = (provider: PlatformProvider) => {
    if (!canManage) return;
    setEditing(provider); setDraft(draftFromProvider(provider));
    setSelectedServiceIds(provider.service_ids || []); setPendingFiles([]);
    setServiceName(""); setPersistedProviderId(provider.id); setEditorOpen(true);
  };
  const addService = async (selectNew: boolean) => {
    if (!canManage || !activeOrganizationId || catalogSaving) return;
    setCatalogSaving(true);
    try {
      const added = await addPlatformService(activeOrganizationId, serviceName);
      await queryClient.invalidateQueries({ queryKey: ["union-provider-services", activeOrganizationId] });
      if (selectNew) setSelectedServiceIds(current => [...new Set([...current, added.id])]);
      setServiceName("");
      notifyAdmin("Serviço cadastrado no catálogo da Union.", "success");
    } catch (error) { notifyAdmin(systemErrorMessage(error, "Não foi possível cadastrar o serviço."), "error"); }
    finally { setCatalogSaving(false); }
  };
  const saveServiceEdit = async (service: PlatformService, values: { name?: string; is_active?: boolean }) => {
    if (!canManage || !activeOrganizationId) return;
    try {
      await editPlatformService(activeOrganizationId, service.id, values);
      await queryClient.invalidateQueries({ queryKey: ["union-provider-services", activeOrganizationId] });
      setEditingService(null);
      notifyAdmin("Serviço atualizado.", "success");
    } catch (error) { notifyAdmin(systemErrorMessage(error, "Não foi possível atualizar o serviço."), "error"); }
  };
  const save = async () => {
    if (!canManage || !activeOrganizationId || saving) return;
    setSaving(true);
    try {
      const savedId = await savePlatformProvider(persistedProviderId || editing?.id || null, draft, selectedServiceIds);
      setPersistedProviderId(savedId);
      const failedFiles: File[] = [];
      for (const file of pendingFiles) {
        try { await addProviderAttachment(activeOrganizationId, savedId, file); }
        catch (error) {
          failedFiles.push(file);
          notifyAdmin(systemErrorMessage(error, `Não foi possível anexar ${file.name}.`), "error");
        }
      }
      setPendingFiles(failedFiles);
      await refresh();
      if (failedFiles.length) {
        notifyAdmin(`Prestador salvo. ${failedFiles.length} anexo(s) ainda não enviado(s). Os arquivos foram mantidos; tente salvar novamente.`, "warning");
        return;
      }
      setEditorOpen(false); setEditing(null); setPersistedProviderId(null);
      notifyAdmin("Prestador e anexos salvos com sucesso.", "success");
    } catch (error) { notifyAdmin(systemErrorMessage(error, "Não foi possível salvar o prestador."), "error"); }
    finally { setSaving(false); }
  };

  const deleteAttachment = async (attachment: NonNullable<typeof attachmentsQuery.data>[number]) => {
    try {
      await removeProviderAttachment(attachment);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["union-provider-attachments", activeOrganizationId, editing?.id] }),
        refresh(),
      ]);
      notifyAdmin("Anexo removido.", "success");
    } catch (error) { notifyAdmin(systemErrorMessage(error, "Não foi possível remover o anexo."), "error"); }
  };

  if (!canView) return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
    O módulo Prestadores de Serviços está disponível apenas na Union World, para perfis autorizados.
  </div>;

  return <div className="space-y-5">
    <PageHeader title="Prestadores de Serviços"
      subtitle={`${totalCountQuery.data ?? 0} cadastrado${totalCountQuery.data === 1 ? "" : "s"}`}
      actions={canManage ? <AdminButton onClick={openNew}><Plus size={16} /> Novo prestador</AdminButton> : undefined} />

    <div className="flex gap-5 border-b border-border" role="tablist" aria-label="Seções de prestadores">
      {([{ key: "providers", name: "Prestadores" }, { key: "services", name: "Serviços" }] as const).map(item =>
        <button key={item.key} type="button" role="tab" aria-selected={section === item.key}
          onClick={() => setSection(item.key)}
          className={`relative px-1 pb-3 text-sm font-semibold transition-colors ${section === item.key ? "text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground"}`}>
          {item.name}
        </button>)}
    </div>

    {section === "providers" ? <>
      <ProviderFiltersPanel filters={filters} searchText={searchText}
        onSearchTextChange={setSearchText} services={services}
        locations={locationsQuery.data || []} onChange={changeFilter}
        onClear={() => { setSearchText(""); setFilters(emptyFilters()); }} />

      {providersQuery.isPending ? <LoadingState text="Carregando prestadores" /> :
        providersQuery.isError ? <p className="rounded-lg border border-destructive/20 p-4 text-sm text-destructive">
          {systemErrorMessage(providersQuery.error, "Não foi possível carregar os prestadores.")}</p> :
        providers.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Wrench size={28} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">Nenhum prestador encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Revise os filtros ou cadastre um novo prestador.</p>
        </div> :
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map(provider => <article key={provider.id}
            role="button" tabIndex={0}
            aria-label={"Ver detalhes de "+provider.name}
            onClick={() => setViewing(provider)}
            onKeyDown={event => {if(event.target===event.currentTarget && (event.key==="Enter"||event.key===" ")){
              event.preventDefault();setViewing(provider);
            }}}
            className="flex min-w-0 cursor-pointer flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/35 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wrench size={21} /></div>
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-base font-bold text-foreground">{provider.name}</h3>
                <span className={"mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold "+
                  (provider.is_active?"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300":"bg-muted text-muted-foreground")}>
                  {provider.is_active?"Ativo":"Inativo"}
                </span>
              </div>
              {canManage && <AdminIconButton ariaLabel={"Editar "+provider.name}
                title="Editar prestador" variant="tertiary"
                className="h-9 w-9 shrink-0" onClick={event=>{event.stopPropagation();openEdit(provider);}}>
                <Pencil size={15}/>
              </AdminIconButton>}
            </div>
            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0"/>
                <span>{provider.city} / {provider.state}{provider.neighborhood?" · "+provider.neighborhood:""}</span>
              </p>
              {(provider.phone||provider.whatsapp)&&<p className="flex items-center gap-2">
                <Phone size={14} className="shrink-0"/><span>{formatPhone(provider.phone||provider.whatsapp||"")}</span>
              </p>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {provider.service_names.map(service=><span key={service}
                className="flex min-w-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 px-1.5 py-1.5 text-center text-[10px] font-semibold leading-snug text-primary">
                <span className="min-w-0 break-words">{service}</span>
              </span>)}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Paperclip size={14}/>
                {provider.attachment_count} anexo{provider.attachment_count===1?"":"s"}
              </span>
              {provider.whatsapp&&<a href={"https://wa.me/"+((digits)=>{
                return digits.length<=11?"55"+digits:digits;
              })(provider.whatsapp.replace(/\D/g,""))}
                target="_blank" rel="noopener noreferrer"
                aria-label={"Abrir WhatsApp de "+provider.name} title="Abrir WhatsApp"
                onClick={event=>event.stopPropagation()}
                className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-card text-emerald-600 transition-colors hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-primary">
                <WhatsAppBrandIcon size={19}/>
              </a>}
            </div>
          </article>)}
        </div>}
      {totalPages > 1 && <div className="flex items-center justify-center gap-3">
        <AdminButton variant="secondary" disabled={filters.page <= 1}
          onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>Anterior</AdminButton>
        <span className="text-xs text-muted-foreground">Página {filters.page} de {totalPages}</span>
        <AdminButton variant="secondary" disabled={filters.page >= totalPages}
          onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Próxima</AdminButton>
      </div>}
    </> : <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold text-foreground">Catálogo de serviços</h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">Os serviços são cadastrados uma vez na Union e ficam disponíveis para todos os prestadores. Inativos permanecem no histórico.</p>
        {canManage && <div className="flex flex-col gap-2 sm:flex-row">
          <input className={inputClass} value={serviceName} maxLength={120}
            placeholder="Ex.: Instalador de cerca elétrica" onChange={event => setServiceName(event.target.value)} />
          <AdminButton onClick={() => void addService(false)} loading={catalogSaving} disabled={!serviceName.trim()}><Plus size={15} /> Adicionar serviço</AdminButton>
        </div>}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="relative mb-4"><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={15} />
          <input className={inputClass + " pl-9"} value={catalogSearch}
            placeholder="Buscar no catálogo de serviços" onChange={event => setCatalogSearch(event.target.value)} /></div>
        {servicesQuery.isPending ? <LoadingState text="Carregando serviços" /> : servicesQuery.isError ?
          <p className="text-sm text-destructive">{systemErrorMessage(servicesQuery.error)}</p> :
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {catalogFiltered.map(service => <div key={service.id}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-3">
              {editingService?.id === service.id ? <>
                <input className={inputClass} maxLength={120} value={serviceEditName}
                  onChange={event => setServiceEditName(event.target.value)} />
                <button aria-label="Salvar nome" className="text-primary" onClick={() => void saveServiceEdit(service, { name: serviceEditName })}><Check size={16} /></button>
                <button aria-label="Cancelar edição" onClick={() => setEditingService(null)}><X size={16} /></button>
              </> : <>
                <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${service.is_active ? "text-foreground" : "text-muted-foreground line-through"}`} title={service.name}>{service.name}</span>
                {!service.is_active && <span className="text-[10px] text-muted-foreground">Inativo</span>}
                {canManage && <>
                  <button title="Renomear serviço" aria-label={`Renomear ${service.name}`} className="p-1 text-muted-foreground hover:text-primary"
                    onClick={() => { setEditingService(service); setServiceEditName(service.name); }}><Pencil size={14} /></button>
                  <button className="rounded border border-border px-2 py-1 text-[10px] font-bold"
                    onClick={() => void saveServiceEdit(service, { is_active: !service.is_active })}>
                    {service.is_active ? "Desativar" : "Ativar"}
                  </button>
                </>}
              </>}
            </div>)}
          </div>}
      </div>
    </section>}

    {viewing && activeOrganizationId && <ProviderDetailsDialog
      provider={viewing} organizationId={activeOrganizationId} onClose={() => setViewing(null)}/>}
    {editorOpen && activeOrganizationId && <PlatformProviderEditor
      key={editing?.id || "new"} editing={editing} organizationId={activeOrganizationId}
      draft={draft} setDraft={setDraft}
      servicesContent={<ServiceChoices services={services} selected={selectedServiceIds}
        onToggle={id => setSelectedServiceIds(current => current.includes(id)
          ? current.filter(item => item !== id) : [...current, id])}/>}
      serviceCount={selectedServiceIds.length} serviceName={serviceName}
      setServiceName={setServiceName} catalogSaving={catalogSaving}
      onCreateService={() => void addService(true)}
      pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
      attachments={attachmentsQuery.data || []} attachmentsLoading={Boolean(editing && attachmentsQuery.isPending)}
      saving={saving} onDeleteAttachment={item => void deleteAttachment(item)}
      onClose={() => { if (!saving) setEditorOpen(false); }}
      onSave={() => void save()}
    />}
  </div>;
}
