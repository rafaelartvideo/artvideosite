import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, MapPin, Paperclip, Pencil, Phone, Plus, Search, Trash2, UserRound, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog, AdminIconButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  addPlatformServices, addProviderAttachment, draftFromProvider,
  countPlatformProviders, deletePlatformProvider, deletePlatformService, editPlatformService, emptyProviderDraft, listPlatformProviders, listPlatformServices,
  listProviderAttachments, listProviderLocations,
  removeProviderAttachment, savePlatformProvider,
  type PlatformProvider, type PlatformProviderDraft, type PlatformService,
  type PlatformServiceBatchItem, type ProviderFilters,
} from "../infrastructure/platform-providers.repository";
import { PlatformProviderEditor } from "./PlatformProviderEditor";
import { PlatformServiceBatchEditor } from "./PlatformServiceBatchEditor";
import { ProviderFiltersPanel } from "./ProviderFiltersPanel";
import { ProviderDetailsDialog } from "./ProviderDetailsDialog";
import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { formatPhone } from "@/shared/domain/formatters";

const inputClass = "h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary";
function FemaleProviderIcon() {
  return <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="4.5" r="2.2"/><path d="M9.9 9h4.2l3.1 9H6.8l3.1-9Z"/>
    <path d="m9.3 11-3 4m8.4-4 3 4M10.1 18v3m3.8-3v3"/>
  </svg>;
}
const normalSort = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
const emptyFilters = (): ProviderFilters => ({
  search: "", serviceIds: [], equipmentNames: [], states: [], cities: [], statuses: [], page: 1, pageSize: 24,
});

function ServiceChoices({ services, profession, selected, onToggle }: {
  services: PlatformService[]; profession: string; selected: string[]; onToggle: (id: string) => void;
}) {
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const query = equipmentSearch.trim().toLocaleLowerCase("pt-BR");
  const professionKey = profession.trim().toLocaleLowerCase("pt-BR");
  const choices = useMemo(() => services
    .filter(item => Boolean(professionKey) && item.profession_name.trim().toLocaleLowerCase("pt-BR") === professionKey)
    .filter(item => item.is_active || selected.includes(item.id))
    .filter(item => !query || item.name.toLocaleLowerCase("pt-BR").includes(query) ||
      (item.equipment_name || "").toLocaleLowerCase("pt-BR").includes(query))
    .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || normalSort(a.name, b.name)),
    [services, professionKey, selected, query]);
  const standalone = choices.filter(service => !service.equipment_name);
  const equipmentNames = Array.from(new Set(choices
    .map(service => service.equipment_name).filter((name): name is string => Boolean(name)))).sort(normalSort);
  const standaloneExpanded = expanded.__standalone__ ?? (Boolean(query) || standalone.some(item => selected.includes(item.id)));
  const choice = (service: PlatformService) => <label key={service.id}
    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${selected.includes(service.id) ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground"}`}>
    <input type="checkbox" checked={selected.includes(service.id)}
      onChange={() => onToggle(service.id)} className="h-4 w-4 shrink-0 accent-primary"/>
    <span className="min-w-0 flex-1">{service.name}</span>
    {selected.includes(service.id) && <Check size={13} className="shrink-0 text-primary"/>}
  </label>;
  if (!professionKey) return <p className="py-3 text-center text-xs text-muted-foreground">
    Informe a profissão para listar equipamentos e serviços correspondentes.
  </p>;
  return <div className="space-y-3">
    <p className="text-xs font-semibold text-foreground">Profissão: {profession.trim()}</p>
    {choices.length > 0 && <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={15}/>
      <input value={equipmentSearch} onChange={event => setEquipmentSearch(event.target.value)}
        className={inputClass + " pl-9"} aria-label="Buscar equipamento ou serviço"
        placeholder="Buscar equipamento ou serviço"/>
    </div>}
    {equipmentNames.map(equipment => {
      const members = choices.filter(service => service.equipment_name === equipment);
      const isOpen = expanded[equipment] ?? (Boolean(query) || members.some(service => selected.includes(service.id)));
      return <div key={equipment} className="overflow-hidden rounded-lg border border-border">
        <button type="button" aria-expanded={isOpen}
          onClick={() => setExpanded(current => ({...current, [equipment]: !isOpen}))}
          className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-3 text-left text-xs font-bold text-foreground">
          <span className="min-w-0 truncate">{equipment}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {members.filter(service => selected.includes(service.id)).length}/{members.length}
          </span>
          <ChevronDown size={16} className={`shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}/>
        </button>
        {isOpen && <div className="grid gap-2 border-t border-border p-2 sm:grid-cols-2 xl:grid-cols-3">
          {members.map(choice)}
        </div>}
      </div>;
    })}
    {standalone.length > 0 && <div className="overflow-hidden rounded-lg border border-border">
      <button type="button" aria-expanded={standaloneExpanded}
        onClick={() => setExpanded(current => ({...current, __standalone__: !standaloneExpanded}))}
        className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-3 text-left text-xs font-bold text-foreground">
        <span>Serviços diretos (sem equipamento)</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${standaloneExpanded ? "" : "-rotate-90"}`}/>
      </button>
      {standaloneExpanded && <div className="grid gap-2 border-t border-border p-2 sm:grid-cols-2 xl:grid-cols-3">
        {standalone.map(choice)}
      </div>}
    </div>}
    {choices.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">
      Nenhum serviço cadastrado para esta profissão. O prestador pode ser salvo sem serviços.
    </p>}
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
  const [expandedCatalog, setExpandedCatalog] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<PlatformService | null>(null);
  const [providerDeleteTarget, setProviderDeleteTarget] = useState<PlatformProvider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState(false);
  const [deletingService, setDeletingService] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [serviceModal, setServiceModal] = useState<{
    equipmentName: string; professionName: string; mode: "equipment" | "standalone"; selectNew: boolean;
  } | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [editingService, setEditingService] = useState<PlatformService | null>(null);
  const [serviceEditName, setServiceEditName] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters(current => current.search === searchText ? current : { ...current, search: searchText, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  useEffect(() => { setFilters(emptyFilters()); setSearchText(""); setEditorOpen(false); setViewing(null); setPersistedProviderId(null); setDeleteTarget(null); setProviderDeleteTarget(null); setServiceModal(null); setExpandedCatalog({}); }, [activeOrganizationId]);

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
    .filter(item => [item.name, item.equipment_name || "", item.profession_name]
      .some(text => text.toLocaleLowerCase("pt-BR").includes(catalogSearch.trim().toLocaleLowerCase("pt-BR"))))
    .sort((a,b) => normalSort(a.name,b.name)), [services, catalogSearch]);
  const equipmentSuggestions = useMemo(() => Array.from(new Set(services
    .map(item => item.equipment_name).filter((name): name is string => Boolean(name)))).sort(normalSort), [services]);
  const professionSuggestions = useMemo(() => Array.from(new Set([
    ...services.map(item => item.profession_name), ...providers.map(provider => provider.profession || ""),
  ].filter(Boolean))).sort(normalSort), [services, providers]);
  const catalogGroups = useMemo(() => {
    const groups = new Map<string, Map<string, PlatformService[]>>();
    for (const item of catalogFiltered) {
      const profession = item.profession_name;
      const equipments = groups.get(profession) || new Map<string, PlatformService[]>();
      const equipment = item.equipment_name || "";
      equipments.set(equipment, [...(equipments.get(equipment) || []), item]);
      groups.set(profession, equipments);
    }
    return Array.from(groups.entries()).sort(([a],[b]) => normalSort(a,b))
      .map(([profession, equipments]) => ({
        profession,
        equipmentGroups: Array.from(equipments.entries()).sort(([a],[b]) => !a ? 1 : !b ? -1 : normalSort(a,b)),
      }));
  }, [catalogFiltered]);

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
    setPendingFiles([]); setPersistedProviderId(null); setEditorOpen(true);
  };
  const openEdit = (provider: PlatformProvider) => {
    if (!canManage) return;
    setEditing(provider); setDraft(draftFromProvider(provider));
    setSelectedServiceIds(provider.service_ids || []); setPendingFiles([]);
    setPersistedProviderId(provider.id); setEditorOpen(true);
  };
  const openServiceModal = (equipmentName = "", selectNew = false, mode: "equipment" | "standalone" = "equipment", professionName = "") => {
    if (!canManage) return;
    setServiceModal({ equipmentName, selectNew, mode, professionName });
  };
  const addBatch = async (items: PlatformServiceBatchItem[], selectNew: boolean): Promise<boolean> => {
    if (!canManage || !activeOrganizationId || catalogSaving) return false;
    setCatalogSaving(true);
    try {
      const added = await addPlatformServices(activeOrganizationId, items);
      await queryClient.invalidateQueries({ queryKey: ["union-provider-services", activeOrganizationId] });
      if (selectNew) setSelectedServiceIds(current => [...new Set([...current, ...added.map(item => item.id)])]);
      notifyAdmin(added.length + " serviço(s) cadastrado(s) na Union.", "success");
      return true;
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível cadastrar o lote. Nenhum item foi incluído."), "error");
      return false;
    } finally {
      setCatalogSaving(false);
    }
  };
  const confirmDeleteService = async () => {
    if (!canManage || !activeOrganizationId || !deleteTarget || deletingService) return;
    setDeletingService(true);
    try {
      await deletePlatformService(activeOrganizationId, deleteTarget.id);
      setSelectedServiceIds(current => current.filter(id => id !== deleteTarget.id));
      setFilters(current => ({...current, serviceIds: current.serviceIds.filter(id => id !== deleteTarget.id), page: 1}));
      await queryClient.invalidateQueries({ queryKey: ["union-provider-services", activeOrganizationId] });
      setDeleteTarget(null);
      notifyAdmin("Serviço excluído do catálogo.", "success");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível excluir o serviço."), "error");
    } finally {
      setDeletingService(false);
    }
  };
  const confirmDeleteProvider = async () => {
    if (!canManage || !activeOrganizationId || !providerDeleteTarget || deletingProvider) return;
    setDeletingProvider(true);
    try {
      const result = await deletePlatformProvider(activeOrganizationId, providerDeleteTarget.id);
      if (viewing?.id === providerDeleteTarget.id) setViewing(null);
      if (editing?.id === providerDeleteTarget.id) { setEditorOpen(false); setEditing(null); }
      setProviderDeleteTarget(null);
      if (providers.length === 1 && filters.page > 1) {
        setFilters(current => ({...current, page: Math.max(1, current.page - 1)}));
      }
      await refresh();
      if (result.orphanedFiles > 0) {
        notifyAdmin(`Prestador excluído, mas ${result.orphanedFiles} anexo(s) precisam de limpeza no Storage.`, "warning");
      } else {
        notifyAdmin("Prestador excluído com sucesso.", "success");
      }
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível excluir o prestador."), "error");
    } finally {
      setDeletingProvider(false);
    }
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
      const allowedServiceIds = selectedServiceIds.filter(id => services.some(service =>
        service.id === id && service.profession_name.trim().toLocaleLowerCase("pt-BR") === draft.profession.trim().toLocaleLowerCase("pt-BR")));
      const savedId = await savePlatformProvider(persistedProviderId || editing?.id || null, draft, allowedServiceIds);
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
      actions={canManage ? (section === "services"
        ? <AdminButton onClick={() => openServiceModal()}><Plus size={16} /> Novo serviço</AdminButton>
        : <AdminButton onClick={openNew}><Plus size={16} /> Novo prestador</AdminButton>) : undefined} />

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
            className="flex min-h-[236px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/35 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary sm:p-5">
            <div className="flex items-start gap-3">
              <div className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " +
                (provider.person_type === "PJ" ? "bg-muted text-muted-foreground" :
                 provider.gender === "F" ? "bg-pink-500/10 text-pink-600 dark:text-pink-400" :
                 provider.gender === "M" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                 "bg-muted text-muted-foreground")}>
                {provider.person_type === "PJ" ? <Building2 size={21} /> :
                 provider.gender === "F" ? <FemaleProviderIcon /> : <UserRound size={21}/>}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 break-words text-sm font-bold leading-5 text-foreground">{provider.name}</h3>
                <span className={"mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold "+
                  (provider.is_active?"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300":"bg-muted text-muted-foreground")}>
                  {provider.is_active?"Ativo":"Inativo"}
                </span>
              </div>
              {canManage && <div className="flex shrink-0 items-center gap-1">
                <AdminIconButton ariaLabel={"Editar "+provider.name}
                  title="Editar prestador" variant="tertiary"
                  className="h-9 w-9 shrink-0" onClick={event=>{event.stopPropagation();openEdit(provider);}}>
                  <Pencil size={15}/>
                </AdminIconButton>
                <AdminIconButton ariaLabel={"Excluir "+provider.name}
                  title="Excluir prestador" variant="danger"
                  className="h-9 w-9 shrink-0" onClick={event=>{event.stopPropagation();setProviderDeleteTarget(provider);}}>
                  <Trash2 size={15}/>
                </AdminIconButton>
              </div>}
            </div>
            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0"/>
                <span className="line-clamp-2">{provider.city} / {provider.state}{provider.neighborhood?" · "+provider.neighborhood:""}</span>
              </p>
              {(provider.phone||provider.whatsapp)&&<p className="flex items-center gap-2">
                <Phone size={14} className="shrink-0"/><span>{formatPhone(provider.phone||provider.whatsapp||"")}</span>
              </p>}
            </div>
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profissão</p>
              <p className="mt-1 text-sm font-semibold text-primary">
                {provider.profession?.trim() || "Profissão não informada"}
              </p>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
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
        <h2 className="mb-3 text-sm font-bold text-foreground">Serviços cadastrados</h2>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={15}/>
          <input className={inputClass + " pl-9"} value={catalogSearch}
            placeholder="Buscar equipamento ou serviço" onChange={event => setCatalogSearch(event.target.value)}/>
        </div>
        {servicesQuery.isPending ? <LoadingState text="Carregando serviços" /> : servicesQuery.isError ?
          <p className="text-sm text-destructive">{systemErrorMessage(servicesQuery.error)}</p> :
          catalogGroups.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Nenhum serviço encontrado.</p> :
          <div className="space-y-3">
            {catalogGroups.map(([equipment, items]) => {
              const key = equipment || "__standalone__";
              const expanded = expandedCatalog[key] ?? Boolean(catalogSearch.trim());
              return <div key={key} className="overflow-hidden rounded-lg border border-border">
                <button type="button" aria-expanded={expanded}
                  onClick={() => setExpandedCatalog(current => ({...current, [key]: !expanded}))}
                  className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-3 text-left text-xs font-bold text-foreground hover:bg-muted/60">
                  <span className="truncate">{equipment || "Serviços avulsos / Profissões"}</span>
                  <span className="ml-auto text-[10px] font-medium text-muted-foreground">{items.length}</span>
                  <ChevronDown size={16} className={"shrink-0 transition-transform " + (expanded ? "" : "-rotate-90")}/>
                </button>
                {expanded && <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map(service => <div key={service.id}
                    className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border p-2.5">
                    {editingService?.id === service.id ? <>
                      <input className={inputClass} maxLength={120} aria-label={"Editar " + service.name}
                        value={serviceEditName} onChange={event => setServiceEditName(event.target.value)}/>
                      <AdminIconButton ariaLabel={"Salvar " + service.name} variant="success"
                        onClick={() => void saveServiceEdit(service, {name: serviceEditName})}><Check size={15}/></AdminIconButton>
                      <AdminIconButton ariaLabel={"Cancelar edição de " + service.name} variant="secondary"
                        onClick={() => setEditingService(null)}><X size={15}/></AdminIconButton>
                    </> : <>
                      <span title={service.name} className={"min-w-0 flex-1 truncate text-xs font-semibold " +
                        (service.is_active ? "text-foreground" : "text-muted-foreground line-through")}>{service.name}</span>
                      {canManage && <div className="flex shrink-0 items-center gap-1">
                        <AdminIconButton ariaLabel={"Editar " + service.name} variant="tertiary" title="Editar"
                          onClick={() => {setEditingService(service); setServiceEditName(service.name);}}>
                          <Pencil size={14}/>
                        </AdminIconButton>
                        <AdminIconButton ariaLabel={(service.is_active ? "Desativar " : "Ativar ") + service.name}
                          variant={service.is_active ? "warning" : "success"}
                          onClick={() => void saveServiceEdit(service, {is_active: !service.is_active})}/>
                        <AdminIconButton ariaLabel={"Excluir " + service.name} variant="danger"
                          onClick={() => setDeleteTarget(service)}><Trash2 size={14}/></AdminIconButton>
                      </div>}
                    </>}
                  </div>)}
                  {canManage && <button type="button"
                    aria-label={equipment ? "Adicionar serviço em " + equipment : "Adicionar serviço avulso"}
                    title={equipment ? "Novo serviço de " + equipment : "Novo serviço avulso"}
                    onClick={() => openServiceModal(equipment, false, equipment ? "equipment" : "standalone")}
                    className="flex min-h-[42px] min-w-0 items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">
                    <Plus size={16} /><span className="text-xs font-semibold">Adicionar</span>
                  </button>}
                </div>}
              </div>;
            })}
          </div>}
      </div>
    </section>}

    {viewing && activeOrganizationId && <ProviderDetailsDialog
      provider={viewing} organizationId={activeOrganizationId} onClose={() => setViewing(null)}/>}
    {editorOpen && activeOrganizationId && <PlatformProviderEditor
      key={editing?.id || "new"} editing={editing} organizationId={activeOrganizationId}
      draft={draft} setDraft={setDraft}
      servicesContent={<ServiceChoices services={services} profession={draft.profession} selected={selectedServiceIds}
        onToggle={id => setSelectedServiceIds(current => current.includes(id)
          ? current.filter(item => item !== id) : [...current, id])}/>}
      batchContent={<AdminButton variant="secondary" size="sm"
        onClick={() => openServiceModal("", true, "equipment", draft.profession)}><Plus size={15}/> Novo serviço</AdminButton>}
      serviceCount={selectedServiceIds.length}
      pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
      attachments={attachmentsQuery.data || []} attachmentsLoading={Boolean(editing && attachmentsQuery.isPending)}
      saving={saving} onDeleteAttachment={item => void deleteAttachment(item)}
      onClose={() => { if (!saving) setEditorOpen(false); }}
      onSave={() => void save()}
    />}
    {serviceModal && <AdminDialog open title="Novo serviço"
      description={serviceModal.equipmentName
        ? "Adicione um ou vários serviços em " + serviceModal.equipmentName
        : "Cadastre uma profissão, seus equipamentos e serviços, ou serviços diretos."}
      className="w-[min(96vw,920px)] max-w-4xl"
      minimizable={false}
      onClose={() => { if (!catalogSaving) setServiceModal(null); }}
      footer={<div className="flex justify-end">
        <AdminButton variant="secondary" disabled={catalogSaving}
          onClick={() => setServiceModal(null)}>Cancelar</AdminButton>
      </div>}>
      <PlatformServiceBatchEditor
        key={serviceModal.professionName + ":" + serviceModal.mode + ":" + serviceModal.equipmentName}
        equipmentSuggestions={equipmentSuggestions}
        professionSuggestions={professionSuggestions}
        initialProfessionName={serviceModal.professionName}
        initialEquipmentName={serviceModal.equipmentName}
        initialMode={serviceModal.mode}
        closeOnSuccess
        onCreateBatch={async items => {
          const saved = await addBatch(items, serviceModal.selectNew);
          if (saved) setServiceModal(null);
          return saved;
        }}
        loading={catalogSaving}/>
    </AdminDialog>}
    {providerDeleteTarget && <AdminDialog open
      title="Excluir prestador" description="Confirme a exclusão do cadastro"
      onClose={() => { if (!deletingProvider) setProviderDeleteTarget(null); }}
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={deletingProvider}
          onClick={() => setProviderDeleteTarget(null)}>Cancelar</AdminButton>
        <AdminButton variant="primary" loading={deletingProvider}
          onClick={() => void confirmDeleteProvider()}>Confirmar exclusão</AdminButton>
      </div>}>
      <p className="text-sm text-foreground">
        Deseja realmente excluir o prestador <strong>{providerDeleteTarget.name}</strong>?
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Essa ação é permanente e também remove os serviços vinculados e anexos desse cadastro.
      </p>
    </AdminDialog>}
    {deleteTarget && <AdminDialog open title="Excluir serviço" description="Confirme a exclusão do serviço do catálogo"
      onClose={() => {if (!deletingService) setDeleteTarget(null);}}
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={deletingService} onClick={() => setDeleteTarget(null)}>Cancelar</AdminButton>
        <AdminButton variant="danger" loading={deletingService} onClick={() => void confirmDeleteService()}>
          Excluir serviço
        </AdminButton>
      </div>}>
      <p className="text-sm text-foreground">Deseja excluir <strong>{deleteTarget.name}</strong>
        {deleteTarget.equipment_name ? " de " + deleteTarget.equipment_name : ""}?</p>
      <p className="mt-2 text-xs text-muted-foreground">
        A exclusão não poderá ser desfeita. Serviços vinculados a prestadores não podem ser excluídos;
        remova primeiro esses vínculos ou use Desativar.
      </p>
    </AdminDialog>}
  </div>;
}
