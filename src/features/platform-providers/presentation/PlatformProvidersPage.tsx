import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, MapPin, Paperclip, Pencil, Plus, Search, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  addPlatformService, addProviderAttachment, draftFromProvider,
  editPlatformService, emptyProviderDraft, listPlatformProviders, listPlatformServices,
  listProviderAttachments, listProviderLocations, openProviderAttachment,
  removeProviderAttachment, savePlatformProvider,
  type PlatformProvider, type PlatformProviderDraft, type PlatformService,
  type ProviderFilters,
} from "../infrastructure/platform-providers.repository";

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const inputClass = "h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary";
const labelClass = "mb-1.5 block text-xs font-semibold text-foreground";
const normalSort = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
const emptyFilters = (): ProviderFilters => ({
  search: "", serviceId: "", state: "", city: "", status: "all", page: 1, pageSize: 24,
});

function Field({ label, value, onChange, required = false, placeholder = "", type = "text" }: {
  label: string; value: string; onChange: (next: string) => void; required?: boolean;
  placeholder?: string; type?: string;
}) {
  return <label className="min-w-0">
    <span className={labelClass}>{label}{required && <span className="text-destructive"> *</span>}</span>
    <input className={inputClass} type={type} value={value} required={required}
      placeholder={placeholder} onChange={event => onChange(event.target.value)} />
  </label>;
}

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
  const [editing, setEditing] = useState<PlatformProvider | null>(null);
  const [draft, setDraft] = useState<PlatformProviderDraft>(emptyProviderDraft());
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
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
  useEffect(() => { setFilters(emptyFilters()); setSearchText(""); setEditorOpen(false); }, [activeOrganizationId]);

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
  const attachmentsQuery = useQuery({
    queryKey: ["union-provider-attachments", activeOrganizationId, editing?.id],
    queryFn: () => listProviderAttachments(activeOrganizationId!, editing!.id),
    enabled: Boolean(canView && activeOrganizationId && editing?.id && editorOpen),
  });

  const services = servicesQuery.data || [];
  const providers = providersQuery.data?.providers || [];
  const total = providersQuery.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const cities = useMemo(() => Array.from(new Set((locationsQuery.data || [])
    .filter(item => !filters.state || item.state === filters.state).map(item => item.city)))
    .sort(normalSort), [locationsQuery.data, filters.state]);
  const states = useMemo(() => Array.from(new Set((locationsQuery.data || []).map(item => item.state)))
    .sort(normalSort), [locationsQuery.data]);
  const catalogFiltered = useMemo(() => services
    .filter(item => item.name.toLocaleLowerCase("pt-BR").includes(catalogSearch.trim().toLocaleLowerCase("pt-BR")))
    .sort((a,b) => normalSort(a.name,b.name)), [services, catalogSearch]);

  const changeFilter = (patch: Partial<ProviderFilters>) =>
    setFilters(current => ({ ...current, ...patch, page: 1 }));

  const updateDraft = (patch: Partial<PlatformProviderDraft>) =>
    setDraft(current => ({ ...current, ...patch }));
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["union-platform-providers", activeOrganizationId] }),
      queryClient.invalidateQueries({ queryKey: ["union-provider-locations", activeOrganizationId] }),
    ]);
  };
  const openNew = () => {
    setEditing(null); setDraft(emptyProviderDraft()); setSelectedServiceIds([]);
    setPendingFiles([]); setServiceName(""); setEditorOpen(true);
  };
  const openEdit = (provider: PlatformProvider) => {
    if (!canManage) return;
    setEditing(provider); setDraft(draftFromProvider(provider));
    setSelectedServiceIds(provider.service_ids || []); setPendingFiles([]);
    setServiceName(""); setEditorOpen(true);
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
      const savedId = await savePlatformProvider(editing?.id || null, draft, selectedServiceIds);
      let failures = 0;
      for (const file of pendingFiles) {
        try { await addProviderAttachment(activeOrganizationId, savedId, file); }
        catch (error) { failures++; notifyAdmin(systemErrorMessage(error, `Não foi possível anexar ${file.name}.`), "error"); }
      }
      setEditorOpen(false); setEditing(null); setPendingFiles([]);
      await refresh();
      notifyAdmin(failures ? "Prestador salvo, mas alguns anexos não foram enviados." : "Prestador salvo com sucesso.", failures ? "warning" : "success");
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
      subtitle="Diretório próprio da Union World, independente de usuários e cadastros das empresas."
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
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="sm:col-span-2 xl:col-span-1">
            <span className={labelClass}>Buscar prestador</span>
            <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
              <input className={inputClass + " pl-9"} value={searchText}
                placeholder="Nome, cidade ou bairro" onChange={event => setSearchText(event.target.value)} /></div>
          </label>
          <label><span className={labelClass}>Serviço</span>
            <select className={inputClass} value={filters.serviceId} onChange={event => changeFilter({ serviceId: event.target.value })}>
              <option value="">Todos os serviços</option>
              {services.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label><span className={labelClass}>Estado</span>
            <select className={inputClass} value={filters.state}
              onChange={event => changeFilter({ state: event.target.value, city: "" })}>
              <option value="">Todos os estados</option>{states.map(state => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label><span className={labelClass}>Cidade</span>
            <select className={inputClass} value={filters.city} onChange={event => changeFilter({ city: event.target.value })}>
              <option value="">Todas as cidades</option>{cities.map(city => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <label><span className={labelClass}>Situação</span>
            <select className={inputClass} value={filters.status}
              onChange={event => changeFilter({ status: event.target.value as ProviderFilters["status"] })}>
              <option value="all">Todas</option><option value="active">Ativos</option><option value="inactive">Inativos</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{total} prestador{total === 1 ? "" : "es"} encontrado{total === 1 ? "" : "s"}</span>
          {(filters.search || filters.serviceId || filters.state || filters.city || filters.status !== "all") &&
            <button type="button" className="font-semibold text-primary hover:underline"
              onClick={() => { setSearchText(""); setFilters(emptyFilters()); }}>Limpar filtros</button>}
        </div>
      </section>

      {providersQuery.isPending ? <LoadingState text="Carregando prestadores" /> :
        providersQuery.isError ? <p className="rounded-lg border border-destructive/20 p-4 text-sm text-destructive">
          {systemErrorMessage(providersQuery.error, "Não foi possível carregar os prestadores.")}</p> :
        providers.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Wrench size={28} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">Nenhum prestador encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Revise os filtros ou cadastre um novo prestador.</p>
        </div> :
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map(provider => <article key={provider.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wrench size={21} /></div>
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-base font-bold text-foreground">{provider.name}</h3>
                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${provider.is_active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                  {provider.is_active ? "Ativo" : "Inativo"}</span>
              </div>
              {canManage && <button type="button" aria-label={`Editar ${provider.name}`} title="Editar prestador"
                onClick={() => openEdit(provider)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-primary"><Pencil size={15} /></button>}
            </div>
            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              <p className="flex items-center gap-2"><MapPin size={14} className="shrink-0" />{provider.city} / {provider.state}{provider.neighborhood ? ` · ${provider.neighborhood}` : ""}</p>
              {(provider.whatsapp || provider.phone) && <p>{provider.whatsapp || provider.phone}</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {provider.service_names.slice(0, 6).map(service => <span key={service}
                className="rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary">{service}</span>)}
              {provider.service_names.length > 6 && <span className="px-1 py-1 text-xs text-muted-foreground">+{provider.service_names.length - 6}</span>}
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground" style={{ marginTop: "auto", paddingTop: "1rem" }}>
              <span className="flex items-center gap-1"><Paperclip size={14} /> {provider.attachment_count} anexo{provider.attachment_count === 1 ? "" : "s"}</span>
              {provider.whatsapp && <a target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline"
                href={`https://wa.me/${(() => { const digits = provider.whatsapp!.replace(/\\D/g, ""); return digits.length <= 11 ? "55" + digits : digits; })()}`}>WhatsApp</a>}
              {canManage && <button className="font-bold text-primary hover:underline" onClick={() => openEdit(provider)}>Detalhes</button>}
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

    <AdminDialog open={editorOpen} onClose={() => { if (!saving) setEditorOpen(false); }}
      title={editing ? "Editar prestador" : "Novo prestador"} description="Cadastro independente dos usuários do CRM."
      className="max-w-5xl">
      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-1">
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-foreground">Dados do prestador</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2"><Field label="Nome / Nome fantasia" required value={draft.name} onChange={name => updateDraft({name})} /></div>
            <Field label="CPF ou CNPJ (opcional)" value={draft.document} onChange={document => updateDraft({document})} />
            <Field label="Telefone" value={draft.phone} onChange={phone => updateDraft({phone})} />
            <Field label="WhatsApp" value={draft.whatsapp} onChange={whatsapp => updateDraft({whatsapp})} />
            <Field label="E-mail (opcional)" type="email" value={draft.email} onChange={email => updateDraft({email})} />
            <label><span className={labelClass}>Estado <span className="text-destructive">*</span></span>
              <select className={inputClass} value={draft.state} onChange={event => updateDraft({state:event.target.value})}>
                <option value="">Selecionar estado</option>{UF_LIST.map(state => <option key={state} value={state}>{state}</option>)}
              </select></label>
            <Field label="Cidade" required value={draft.city} onChange={city => updateDraft({city})} placeholder="Nome da cidade" />
            <Field label="Bairro" value={draft.neighborhood} onChange={neighborhood => updateDraft({neighborhood})} />
            <Field label="Rua / Endereço" value={draft.street} onChange={street => updateDraft({street})} />
            <Field label="Número" value={draft.street_number} onChange={street_number => updateDraft({street_number})} />
            <Field label="CEP" value={draft.zip_code} onChange={zip_code => updateDraft({zip_code})} />
          </div>
          <label className="block"><span className={labelClass}>Observações</span>
            <textarea rows={3} value={draft.notes} onChange={event => updateDraft({notes:event.target.value})}
              maxLength={3000} className={inputClass + " h-auto min-h-20 py-2"} placeholder="Experiência, atendimento, disponibilidade..." /></label>
          <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <input type="checkbox" checked={draft.is_active} onChange={event => updateDraft({is_active:event.target.checked})} className="h-4 w-4 accent-primary" />
            Prestador ativo
          </label>
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-bold text-foreground">Serviços prestados <span className="text-destructive">*</span></h3>
              <p className="mt-1 text-xs text-muted-foreground">Marque as especialidades. As selecionadas sobem ao início e permanecem em ordem alfabética.</p></div>
            <span className="text-xs font-bold text-primary">{selectedServiceIds.length} selecionados</span>
          </div>
          <ServiceChoices services={services} selected={selectedServiceIds}
            onToggle={id => setSelectedServiceIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current,id])} />
          {canManage && <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3 sm:flex-row">
            <input className={inputClass} maxLength={120} value={serviceName}
              onChange={event => setServiceName(event.target.value)} placeholder="Serviço ainda não cadastrado" />
            <AdminButton variant="secondary" disabled={!serviceName.trim()} loading={catalogSaving}
              onClick={() => void addService(true)}><Plus size={15} /> Criar e marcar</AdminButton>
          </div>}
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-bold text-foreground">Anexos (opcional)</h3>
          <p className="text-xs text-muted-foreground">PDF, foto, TXT, DOC ou DOCX. Até 10 MB por arquivo. Acesso privado à Union.</p>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx"
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:font-semibold file:text-primary"
            onChange={event => {
              const picked = Array.from(event.target.files || []);
              setPendingFiles(current => [...current, ...picked]);
              event.target.value = "";
            }} />
          {pendingFiles.map((file,index) => <div key={index} className="flex items-center gap-2 text-xs">
            <FileText size={14} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button type="button" aria-label={`Remover ${file.name}`} onClick={() => setPendingFiles(files => files.filter((_,i) => i !== index))}><X size={14} /></button>
          </div>)}
          {editing && (attachmentsQuery.data || []).map(attachment => <div key={attachment.id}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
            <Paperclip size={14} className="shrink-0" />
            <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold text-primary hover:underline"
              onClick={() => void openProviderAttachment(attachment).catch(error => notifyAdmin(systemErrorMessage(error), "error"))}>
              {attachment.file_name}</button>
            {canManage && <button aria-label={`Excluir ${attachment.file_name}`} className="p-1 text-destructive"
              onClick={() => void deleteAttachment(attachment)}><X size={15} /></button>}
          </div>)}
        </section>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <AdminButton variant="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>Cancelar</AdminButton>
        <AdminButton loading={saving} disabled={!draft.name.trim() || !draft.city.trim() || !draft.state || !selectedServiceIds.length}
          onClick={() => void save()}>{editing ? "Salvar alterações" : "Cadastrar prestador"}</AdminButton>
      </div>
    </AdminDialog>
  </div>;
}
