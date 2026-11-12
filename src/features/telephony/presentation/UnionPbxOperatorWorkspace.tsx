import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, ContactRound, LoaderCircle, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Radio, Search, Settings2, Voicemail, X } from "lucide-react";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { pbxRequest } from "../application/pbx-request";
import { callDuration, dispositionLabels, directionLabels, loadCallHistory, localHistoryDate, type CallHistoryRow, type HistoryFilters } from "../application/call-history";
import { formatPbxNumber } from "../domain/pbx-display";
export { formatPbxNumber } from "../domain/pbx-display";
import { pbxContactPhoneKey, usePbxSavedContactCards } from "../application/pbx-saved-contact-cards";
import { PbxContactActivity } from "./PbxContactActivity";
import type { UnionPbxSection } from "./UnionPbxSectionTabs";

type Extension = { number: number; display_name: string; endpoint_name: string };
type Queue = { number: number; name: string };
type WorkspaceMode = "chamadas" | "contatos";
type RecentFilter = "todas" | "atendidas" | "perdidas";
type Props = {
  isActive: boolean;
  dialer: ReactNode;
  connectionStatus: "offline" | "connecting" | "registered" | "error";
  callState: "idle" | "dialing" | "incoming" | "active";
  remoteParty: string;
  lineLabel: string;
  extensionLabel: string;
  directory: Extension[];
  queues: Queue[];
  directoryLoading: boolean;
  onBack: () => void;
  onConnectionSettings: () => void;
  onDeviceSettings: () => void;
  onDirectoryChange: () => void;
  onSelectSection: (section: UnionPbxSection) => void;
  onDialNumber: (number: string) => void;
  canManage: boolean;
  canManageInbound: boolean;
  canRecordings: boolean;
};

function initialHistoryFilters(): HistoryFilters {
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: localHistoryDate(from), to: localHistoryDate(new Date()), direction: "", disposition: "", number: "" };
}
function displayTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function callNumber(row: CallHistoryRow) {
  return row.direction === "inbound" ? row.source : row.destination;
}
function callStatus(row: CallHistoryRow) {
  return dispositionLabels[row.disposition] || row.disposition || "Sem resultado";
}
function initials(value: string) {
  return value.replace(/\D/g, "").slice(-2) || "PB";
}


/** Apenas apresentação do operador: o WebRTC e o áudio continuam na instância persistente do telefone. */
export function UnionPbxOperatorWorkspace({
  isActive, dialer, connectionStatus, callState, remoteParty, lineLabel, extensionLabel,
  directory, directoryLoading, onBack, onConnectionSettings, onDeviceSettings, onDirectoryChange,
  onSelectSection, onDialNumber, canManage, canManageInbound, canRecordings,
}: Props) {
  const { activeOrganizationId } = useAuth();
  const [mode, setMode] = useState<WorkspaceMode>("chamadas");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentFilter, setRecentFilter] = useState<RecentFilter>("todas");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<CallHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(null);
  const [brokenAvatar, setBrokenAvatar] = useState<Record<string,true>>({});
  const settingsRef = useRef<HTMLDivElement>(null);
  const directoryCallback = useRef(onDirectoryChange);
  directoryCallback.current = onDirectoryChange;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const numberSearch = debouncedSearch.replace(/[^+0-9#]/g, "").slice(0, 32);
  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  useEffect(() => { setPage(1); setRows([]); setSelectedId(null); setSelectedExtension(null); setBrokenAvatar({}); }, [activeOrganizationId]);
  useEffect(() => { setPage(1); }, [recentFilter, numberSearch]);

  useEffect(() => {
    const controller = new AbortController();
    if (!activeOrganizationId || !isActive || mode !== "chamadas") { setLoading(false); return () => controller.abort(); }
    const filters = { ...initialHistoryFilters(), number: numberSearch,
      disposition: recentFilter === "atendidas" ? "ANSWERED" : recentFilter === "perdidas" ? "NO ANSWER" : "" };
    setLoading(true);
    setError("");
    void pbxRequest(signal => loadCallHistory(supabase, activeOrganizationId, filters, page, pageSize, signal),
      "Chamadas recentes", { signal: controller.signal })
      .then(({ data, count, error: queryError }) => {
        if (controller.signal.aborted) return;
        if (queryError) throw queryError;
        const results = (data || []) as CallHistoryRow[];
        setRows(results);
        setTotal(count || 0);
        setSelectedId(previous => results.some(row => row.id === previous) ? previous : (results[0]?.id || null));
      }).catch(() => {
        if (!controller.signal.aborted) { setRows([]); setTotal(0); setSelectedId(null); setError("Não foi possível carregar as chamadas. Verifique sua conexão."); }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeOrganizationId, isActive, mode, recentFilter, numberSearch, page, revision]);


  // Uma assinatura filtrada por empresa e atualização em lote para evitar consultas repetidas.
  useEffect(() => {
    if (!activeOrganizationId || !isActive) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let callsChanged = false, directoryChanged = false;
    const flush = () => {
      timer = undefined;
      if (callsChanged) setRevision(value => value + 1);
      if (directoryChanged) directoryCallback.current();
      callsChanged = false; directoryChanged = false;
    };
    const schedule = (kind: "calls" | "directory") => {
      if (kind === "calls") callsChanged = true;
      else directoryChanged = true;
      if (!timer) timer = setTimeout(flush, 500);
    };
    const filter = `organization_id=eq.${activeOrganizationId}`;
    const channel = supabase.channel(`pbx-operator:${activeOrganizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pbx_call_logs", filter }, () => schedule("calls"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pbx_extensions", filter }, () => schedule("directory"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pbx_queues", filter }, () => schedule("directory"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pbx_call_flows", filter }, () => schedule("directory"))
      .subscribe(status => { if (status === "SUBSCRIBED") schedule("calls"); });
    const resume = () => {
      if (document.visibilityState !== "hidden") { schedule("calls"); schedule("directory"); }
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [activeOrganizationId, isActive]);

  const selected = rows.find(row => row.id === selectedId) || null;
  const selectedNumber = selectedExtension?.number.toString() || (selected ? callNumber(selected) : "");
  const savedCards = usePbxSavedContactCards(activeOrganizationId, isActive,
    [...rows.map(callNumber), ...(selectedNumber ? [selectedNumber] : [])]);
  const contactCard = savedCards[pbxContactPhoneKey(selectedNumber)];
  const selectedName = selectedExtension?.display_name || contactCard?.name || (selected ? (
    directory.find(item => String(item.number) === selectedNumber)?.display_name || formatPbxNumber(selectedNumber) || "Número não identificado"
  ) : "");
  const selectedAvatarKey = pbxContactPhoneKey(selectedNumber);
  const selectedAvatar = contactCard?.avatarUrl && !brokenAvatar[selectedAvatarKey + ":" + contactCard.avatarUrl]
    ? contactCard.avatarUrl : null;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const nav = [
    { id: "chamadas" as const, label: "Chamadas", Icon: Phone },
    { id: "contatos" as const, label: "Contatos", Icon: ContactRound },
  ];
  const settingItems: { label: string; section: UnionPbxSection }[] = [
    { label: "Histórico de chamadas", section: "historico" },
    ...(canRecordings ? [{ label: "Gravações", section: "gravacoes" as const }] : []),
    ...(canManage ? [
      { label: "Gerenciar ramais", section: "ramais" as const },
      { label: "Configurar filas", section: "filas" as const },
      { label: "URA e horários", section: "fluxos" as const },
      { label: "Troncos SIP", section: "troncos" as const },
    ] : []),
    ...(canManageInbound ? [{ label: "Entrada de chamadas", section: "entrada" as const }] : []),
  ];
  return <div className="min-w-0 space-y-4 text-foreground">
    <PageHeader title={<div className="flex items-center gap-3">
      <span>Chamadas</span>
      <div ref={settingsRef} className="relative">
        <button type="button" title="Configurações gerais do módulo" aria-label="Configurações gerais do PABX"
          aria-expanded={settingsOpen} aria-controls="pbx-module-settings"
          onClick={() => setSettingsOpen(value => !value)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <Settings2 size={18}/>
        </button>
        {settingsOpen && <div id="pbx-module-settings" className="absolute left-0 top-full z-40 mt-2 w-[250px] rounded-xl border border-border bg-card p-2 text-sm shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-border px-2 pb-2">
            <span className="text-xs font-semibold">Configurações gerais</span>
            <button type="button" aria-label="Fechar menu" onClick={() => setSettingsOpen(false)}><X size={15}/></button>
          </div>
          {settingItems.map(item => <button key={item.section} type="button"
            className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
            onClick={() => { setSettingsOpen(false); onSelectSection(item.section); }}>{item.label}</button>)}
        </div>}
      </div>
    </div>} subtitle="PABX Union · Central de atendimento"
      actions={<AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/> Ferramentas</AdminButton>} />
    <div className="grid min-w-0 gap-3 lg:grid-cols-[72px_minmax(0,1fr)]">
      <aside aria-label="Navegação do operador" className="flex min-w-0 flex-row items-center gap-2 rounded-xl border border-border bg-card p-2 lg:min-h-[640px] lg:flex-col">
        {nav.map(item => <button key={item.id} type="button" aria-current={mode === item.id ? "page" : undefined}
          title={item.label} onClick={() => { setMode(item.id); setSettingsOpen(false); setSelectedExtension(null); setSelectedId(null); }}
          className={`flex h-14 min-w-[62px] flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:w-full ${mode === item.id ? "border-primary/25 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted"}`}>
          <item.Icon size={20} aria-hidden="true"/>{item.label}
        </button>)}
        <button type="button" title="Dispositivos e testes de áudio" aria-label="Dispositivos e testes de áudio"
          onClick={onDeviceSettings}
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:mb-1 lg:ml-0 lg:mt-auto">
          <Settings2 size={21}/>
        </button>
      </aside>
      <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-[minmax(270px,0.85fr)_minmax(340px,1.55fr)_minmax(255px,0.9fr)]">
        <section aria-label="Discador" className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div><h2 className="text-sm font-bold">Telefone</h2><p className="text-xs text-muted-foreground">{lineLabel}</p></div>
            <button type="button" onClick={onConnectionSettings} title="Gerenciar conexão do ramal"
              aria-label={connectionStatus === "registered" ? "Gerenciar ramal conectado" : "Conectar ramal"}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted ${connectionStatus === "registered" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border text-primary"}`}>
              <span className={`h-2 w-2 rounded-full ${connectionStatus === "registered" ? "bg-emerald-500" : "bg-muted-foreground"}`}/>
              {connectionStatus === "registered" ? "Conectado" : connectionStatus === "connecting" ? "Conectando" : "Conectar"}
              <span className="text-[11px] font-normal">{extensionLabel}</span>
            </button>
          </div>
          {dialer}
        </section>
        <section aria-label="Painel de chamadas" className="flex min-h-[570px] min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">{mode === "chamadas" ? "Recentes" : "Contatos internos"}</h2>
              <p className="text-xs text-muted-foreground">{mode === "chamadas" ? "Últimos 30 dias" : "Diretório da empresa"}</p>
            </div>
          </div>
          {mode === "chamadas" ? <>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar chamadas">
              {([["todas", "Todas"], ["atendidas", "Atendidas"], ["perdidas", "Não atendidas"]] as const).map(([value, label]) =>
                <button type="button" key={value} aria-pressed={recentFilter === value} onClick={() => setRecentFilter(value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${recentFilter === value ? "border-primary/20 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{label}</button>)}
            </div>
            <label className="relative mt-3 block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input type="tel" value={search} onChange={event => setSearch(event.target.value)}
                placeholder="Buscar por número" aria-label="Buscar chamadas por número"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"/>
            </label>
            <div className="mt-3 min-w-0 flex-1 overflow-x-auto">
              <table className="w-full min-w-[460px] border-separate border-spacing-0 text-left text-xs">
                <thead><tr className="text-muted-foreground">
                  <th className="border-b border-border p-2 font-medium">Contato / número</th>
                  <th className="border-b border-border p-2 font-medium">Tipo</th>
                  <th className="border-b border-border p-2 font-medium">Horário</th>
                  <th className="border-b border-border p-2 font-medium">Duração</th>
                  <th className="border-b border-border p-2 font-medium">Estado</th>
                  <th className="border-b border-border p-2 font-medium">Ações</th>
                </tr></thead>
                <tbody>{rows.map(row => {
                  const number = callNumber(row);
                  const extension = directory.find(item => String(item.number) === number);
                  const saved = savedCards[pbxContactPhoneKey(number)];
                  const name = extension?.display_name || saved?.name || formatPbxNumber(number) || "Desconhecido";
                  const avatarKey = pbxContactPhoneKey(number);
                  const avatar = saved?.avatarUrl && !brokenAvatar[avatarKey + ":" + saved.avatarUrl] ? saved.avatarUrl : null;
                  const active = row.id === selectedId && !selectedExtension;
                  return <tr key={row.id} onClick={() => { setSelectedId(row.id); setSelectedExtension(null); }}
                    className={`cursor-pointer hover:bg-muted/50 ${active ? "bg-primary/5" : ""}`}>
                    <td className="border-b border-border/60 p-2"><div className="flex items-center gap-2">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {avatar
                          ? <img src={avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover"
                              onError={() => setBrokenAvatar(old => ({...old, [avatarKey + ":" + avatar]: true}))}/>
                          : initials(number)}
                      </span>
                      <div className="min-w-0"><p className="max-w-[155px] truncate font-semibold" title={name}>{name}</p><p className="max-w-[155px] truncate text-[11px] text-muted-foreground">{extension ? formatPbxNumber(number) : formatPbxNumber(row.source) + " → " + formatPbxNumber(row.destination)}</p></div>
                    </div></td>
                    <td className="border-b border-border/60 p-2"><span className="inline-flex items-center gap-1">{row.direction === "inbound" ? <ArrowDownLeft size={14} className="text-emerald-600"/> : <ArrowUpRight size={14} className="text-primary"/>}{directionLabels[row.direction] || row.direction}</span></td>
                    <td className="border-b border-border/60 p-2 whitespace-nowrap">{displayTime(row.started_at)}</td>
                    <td className="border-b border-border/60 p-2 tabular-nums">{callDuration(row.duration_seconds || 0)}</td>
                    <td className="border-b border-border/60 p-2">
                      <span role="img" aria-label={callStatus(row)} title={callStatus(row)}
                        className={row.disposition === "ANSWERED" ? "inline-flex text-emerald-600 dark:text-emerald-400" : "inline-flex text-red-600 dark:text-red-400"}>
                        {row.disposition !== "ANSWERED" ? <PhoneMissed size={19}/> : row.direction === "outbound" ? <PhoneOutgoing size={19}/> : <PhoneIncoming size={19}/>}
                      </span>
                    </td>
                    <td className="border-b border-border/60 p-2">
                      {row.disposition !== "ANSWERED"
                        ? <button type="button" title="Retornar chamada" aria-label={`Retornar chamada para ${formatPbxNumber(number)}`}
                            disabled={callState !== "idle"} onClick={event => {event.stopPropagation();onDialNumber(number);}}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-primary hover:bg-primary/10 disabled:opacity-40">
                            <Phone size={16}/>
                          </button>
                        : <button type="button" title="Ver detalhes" aria-label="Ver detalhes da chamada"
                            onClick={event => {event.stopPropagation();setSelectedId(row.id);setSelectedExtension(null);}}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-primary">
                            <ContactRound size={16}/>
                          </button>}
                    </td>
                  </tr>;
                })}</tbody>
              </table>
              {!loading && !error && rows.length === 0 && <p className="px-3 py-12 text-center text-sm text-muted-foreground">Nenhuma chamada encontrada para esse filtro.</p>}
              {loading && <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle size={17} className="animate-spin"/> Carregando chamadas...</p>}
              {error && <p role="alert" className="py-6 text-center text-sm text-destructive">{error}</p>}
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>Mostrando {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} de {total}</span>
              <div className="flex items-center gap-2">
                <button aria-label="Página anterior" type="button" disabled={loading || page === 1} onClick={() => setPage(p => p - 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronLeft size={16}/></button>
                <span className="tabular-nums">{page} / {pages}</span>
                <button aria-label="Próxima página" type="button" disabled={loading || page >= pages} onClick={() => setPage(p => p + 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronRight size={16}/></button>
              </div>
            </div>

          </> : <div className="mt-4 flex-1 space-y-2">
            {directory.map(entry => <button key={entry.number} type="button" onClick={() => {
              setSelectedExtension(entry); setSelectedId(null);
            }} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-3 text-left hover:bg-muted">
              <span className="min-w-0 truncate text-sm font-medium">{entry.number} · {entry.display_name}</span>
              <Phone size={15} className="shrink-0 text-primary"/>
            </button>)}
            {directoryLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando contatos...</p>}
            {directory.length === 0 && !directoryLoading && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum contato interno disponível.</p>}
          </div>}
        </section>
        <aside aria-label="Detalhes da seleção" className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-base font-bold">Detalhes</h2>
            {(selected || selectedExtension) && <button type="button" aria-label="Limpar seleção" onClick={() => { setSelectedId(null); setSelectedExtension(null); }}><X size={16}/></button>}
          </div>
          {selected || selectedExtension ? <>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-2xl font-bold text-primary">
                {selectedAvatar
                  ? <img src={selectedAvatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"
                      onError={() => setBrokenAvatar(old => ({...old,[selectedAvatarKey + ":" + selectedAvatar]:true}))}/>
                  : initials(selectedName || selectedNumber)}
              </div>
              <div className="min-w-0"><h3 className="break-words text-base font-semibold">{selectedName}</h3>
                <p className="text-sm text-muted-foreground">{formatPbxNumber(selectedNumber)}</p></div>
              <AdminButton className="w-full" variant="primary" onClick={() => onDialNumber(selectedNumber)}><Phone size={16}/> Discar número</AdminButton>
              <p className="text-xs text-muted-foreground">O número será preenchido no discador. Confirme para ligar.</p>
            </div>
            {selected && !selectedExtension && <div className="mt-6 space-y-3 border-t border-border pt-5">
              <h4 className="text-sm font-semibold">Última interação</h4>
              {[
                ["Tipo de ligação", directionLabels[selected.direction] || selected.direction],
                ["Data e horário", displayTime(selected.started_at)],
                ["Duração", callDuration(selected.duration_seconds || 0)],
                ["Estado", callStatus(selected)],
                ["Origem", formatPbxNumber(selected.source)],
                ["Destino", formatPbxNumber(selected.destination)],
              ].map(([key, value]) => <div key={key} className="flex items-start justify-between gap-3 text-xs"><span className="text-muted-foreground">{key}</span><span className="break-all text-right font-medium">{value}</span></div>)}
              {canRecordings && <AdminButton variant="secondary" className="mt-3 w-full" onClick={() => onSelectSection("gravacoes")}><Voicemail size={16}/> Consultar gravações</AdminButton>}
              <p className="text-xs text-muted-foreground">Reprodução disponível somente quando a gravação existir e estiver autorizada.</p>
            </div>}
            <PbxContactActivity organizationId={activeOrganizationId} number={selectedNumber}
              active={isActive} revision={revision} callBusy={callState !== "idle"} onDialNumber={onDialNumber}/>
          </> : <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ContactRound size={32}/><p>Selecione uma chamada ou ramal para ver os detalhes.</p>
          </div>}
          <div className="mt-5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div className="flex items-center gap-2 font-semibold"><Radio size={15} className="text-primary"/> Estado do operador</div>
            <p className="mt-1 text-muted-foreground">{callState === "incoming" ? "Recebendo chamada" : callState === "dialing" ? "Chamando " + remoteParty : callState === "active" ? "Em ligação com " + remoteParty : "Pronto para atender"}</p>
          </div>
        </aside>
      </div>
    </div>
  </div>;
}
