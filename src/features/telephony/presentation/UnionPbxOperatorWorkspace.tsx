import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, ContactRound, Headphones, History, ListTree, LoaderCircle, Phone, PhoneMissed, Radio, RefreshCw, Search, Settings2, SlidersHorizontal, UsersRound, Voicemail, X } from "lucide-react";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { pbxRequest } from "../application/pbx-request";
import { callDuration, dispositionLabels, directionLabels, loadCallHistory, localHistoryDate, type CallHistoryRow, type HistoryFilters } from "../application/call-history";
import type { UnionPbxSection } from "./UnionPbxSectionTabs";

type Extension = { number: number; display_name: string; endpoint_name: string };
type Queue = { number: number; name: string };
type WorkspaceMode = "chamadas" | "contatos" | "filas" | "ramais";
type RecentFilter = "todas" | "atendidas" | "perdidas";
type Props = {
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
  dialer, connectionStatus, callState, remoteParty, lineLabel, extensionLabel,
  directory, queues, directoryLoading, onBack, onConnectionSettings,
  onSelectSection, onDialNumber, canManage, canManageInbound, canRecordings,
}: Props) {
  const { activeOrganizationId } = useAuth();
  const [mode, setMode] = useState<WorkspaceMode>("chamadas");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentFilter, setRecentFilter] = useState<RecentFilter>("todas");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<CallHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(null);

  const numberSearch = search.replace(/[^+0-9#]/g, "").slice(0, 32);
  useEffect(() => { setPage(1); setRows([]); setSelectedId(null); setSelectedExtension(null); }, [activeOrganizationId]);
  useEffect(() => { setPage(1); }, [recentFilter, numberSearch, pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    if (!activeOrganizationId) { setRows([]); setTotal(0); return () => controller.abort(); }
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
        if (!controller.signal.aborted) { setRows([]); setTotal(0); setSelectedId(null); setError("Não foi possível carregar as chamadas. Tente atualizar."); }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeOrganizationId, recentFilter, numberSearch, page, pageSize, revision]);

  const selected = rows.find(row => row.id === selectedId) || null;
  const selectedNumber = selectedExtension?.number.toString() || (selected ? callNumber(selected) : "");
  const selectedName = selectedExtension?.display_name || (selected ? (
    directory.find(item => String(item.number) === selectedNumber)?.display_name || selectedNumber || "Número não identificado"
  ) : "");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const nav = [
    { id: "chamadas" as const, label: "Chamadas", Icon: Phone },
    { id: "contatos" as const, label: "Contatos", Icon: ContactRound },
    { id: "filas" as const, label: "Filas", Icon: ListTree },
    { id: "ramais" as const, label: "Ramais", Icon: UsersRound },
  ];
  const settingItems: { label: string; section: UnionPbxSection }[] = [
    ...(canManage ? [
      { label: "Gerenciar ramais", section: "ramais" as const },
      { label: "Configurar filas", section: "filas" as const },
      { label: "URA e horários", section: "fluxos" as const },
      { label: "Troncos SIP", section: "troncos" as const },
    ] : []),
    ...(canManageInbound ? [{ label: "Entrada de chamadas", section: "entrada" as const }] : []),
  ];

  return <div className="min-w-0 space-y-4 text-foreground">
    <PageHeader title="Chamadas" subtitle="PABX Union · Central de atendimento"
      actions={<AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/> Ferramentas</AdminButton>} />
    <div className="grid min-w-0 gap-3 lg:grid-cols-[76px_minmax(0,1fr)]">
      <aside aria-label="Navegação do PABX" className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-2 lg:flex-col lg:items-stretch">
        {nav.map(item => <button key={item.id} type="button" onClick={() => { setMode(item.id); setSettingsOpen(false); setSelectedExtension(null); }}
          aria-current={mode === item.id ? "page" : undefined}
          className={`flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${mode === item.id ? "border-l-[3px] border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
          <item.Icon size={20} aria-hidden="true"/>{item.label}
        </button>)}
        <button type="button" onClick={() => onSelectSection("historico")}
          className="flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] text-muted-foreground hover:bg-muted">
          <History size={20}/> Histórico
        </button>
        {canRecordings && <button type="button" onClick={() => onSelectSection("gravacoes")}
          className="flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] text-muted-foreground hover:bg-muted">
          <Voicemail size={20}/> Gravações
        </button>}
        <div className="relative mt-auto w-full">
          <button type="button" aria-expanded={settingsOpen} aria-controls="pbx-operator-settings"
            onClick={() => setSettingsOpen(value => !value)}
            className="flex min-h-16 w-full min-w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] text-muted-foreground hover:bg-muted">
            <Settings2 size={20}/> Configurações
          </button>
          {settingsOpen && <div id="pbx-operator-settings" className="absolute bottom-full left-0 z-30 mb-2 w-[240px] rounded-xl border border-border bg-card p-2 shadow-lg lg:left-full lg:bottom-0 lg:mb-0 lg:ml-2">
            <div className="flex items-center justify-between px-2 py-1"><span className="text-xs font-semibold">Configurações</span>
              <button type="button" aria-label="Fechar menu" onClick={() => setSettingsOpen(false)}><X size={15}/></button>
            </div>
            <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => { setSettingsOpen(false); onConnectionSettings(); }}>Conexão e dispositivos</button>
            {settingItems.map(item => <button key={item.section} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => { setSettingsOpen(false); onSelectSection(item.section); }}>{item.label}</button>)}
          </div>}
        </div>
      </aside>
      <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-[minmax(270px,0.85fr)_minmax(340px,1.55fr)_minmax(255px,0.9fr)]">
        <section aria-label="Discador" className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3">
            <div><h2 className="text-sm font-bold">Telefone</h2><p className="text-xs text-muted-foreground">{lineLabel}</p></div>
            <span className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${connectionStatus === "registered" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
              <span className={`h-2 w-2 rounded-full ${connectionStatus === "registered" ? "bg-emerald-500" : "bg-muted-foreground"}`}/>
              {connectionStatus === "registered" ? "Online" : connectionStatus === "connecting" ? "Conectando" : connectionStatus === "error" ? "Falha" : "Offline"}
            </span>
          </div>
          {dialer}
          <div className="mt-5 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <span className="min-w-0 truncate"><Headphones className="mr-1.5 inline text-muted-foreground" size={15}/> {extensionLabel}</span>
            <button type="button" onClick={onConnectionSettings} className="shrink-0 font-semibold text-primary underline underline-offset-2">Configurar</button>
          </div>
        </section>
        <section aria-label="Painel de chamadas" className="flex min-h-[570px] min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">{mode === "chamadas" ? "Recentes" : mode === "contatos" ? "Contatos internos" : mode === "filas" ? "Filas" : "Ramais"}</h2>
              <p className="text-xs text-muted-foreground">{mode === "chamadas" ? "Últimos 30 dias" : "Diretório da empresa"}</p>
            </div>
            <AdminButton variant="icon" size="sm" aria-label="Atualizar chamadas" onClick={() => setRevision(value => value + 1)}>
              <RefreshCw size={16}/>
            </AdminButton>
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
                  <th className="border-b border-border p-2 font-medium">Situação</th>
                </tr></thead>
                <tbody>{rows.map(row => {
                  const number = callNumber(row);
                  const extension = directory.find(item => String(item.number) === number);
                  const name = extension?.display_name || number || "Desconhecido";
                  const active = row.id === selectedId && !selectedExtension;
                  return <tr key={row.id} onClick={() => { setSelectedId(row.id); setSelectedExtension(null); }}
                    className={`cursor-pointer hover:bg-muted/50 ${active ? "bg-primary/5" : ""}`}>
                    <td className="border-b border-border/60 p-2"><div className="flex items-center gap-2">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(number)}</span>
                      <div className="min-w-0"><p className="max-w-[155px] truncate font-semibold" title={name}>{name}</p><p className="max-w-[155px] truncate text-[11px] text-muted-foreground">{extension ? number : row.source + " → " + row.destination}</p></div>
                    </div></td>
                    <td className="border-b border-border/60 p-2"><span className="inline-flex items-center gap-1">{row.direction === "inbound" ? <ArrowDownLeft size={14} className="text-emerald-600"/> : <ArrowUpRight size={14} className="text-primary"/>}{directionLabels[row.direction] || row.direction}</span></td>
                    <td className="border-b border-border/60 p-2 whitespace-nowrap">{displayTime(row.started_at)}</td>
                    <td className="border-b border-border/60 p-2 tabular-nums">{callDuration(row.duration_seconds || 0)}</td>
                    <td className="border-b border-border/60 p-2"><span className={`rounded-md px-2 py-1 font-semibold ${row.disposition === "ANSWERED" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>{callStatus(row)}</span></td>
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
                <label htmlFor="pbx-page-size" className="sr-only">Itens por página</label>
                <select id="pbx-page-size" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-foreground">
                  <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                </select>
                <button aria-label="Página anterior" type="button" disabled={loading || page === 1} onClick={() => setPage(p => p - 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronLeft size={16}/></button>
                <span className="tabular-nums">{page} / {pages}</span>
                <button aria-label="Próxima página" type="button" disabled={loading || page >= pages} onClick={() => setPage(p => p + 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronRight size={16}/></button>
              </div>
            </div>
          </> : <div className="mt-4 flex-1 space-y-2">
            {(mode === "filas" ? queues : directory).map(entry => {
              const isQueue = mode === "filas";
              return <button key={entry.number} type="button" onClick={() => {
                if (!isQueue) setSelectedExtension(entry as Extension);
                else setSelectedExtension({ number: entry.number, display_name: (entry as Queue).name, endpoint_name: "" });
                onDialNumber(String(entry.number));
              }} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-3 text-left hover:bg-muted">
                <span className="min-w-0 truncate text-sm font-medium">{entry.number} · {"display_name" in entry ? entry.display_name : entry.name}</span>
                <Phone size={15} className="shrink-0 text-primary"/>
              </button>;
            })}
            {directoryLoading && mode !== "filas" && <p className="py-8 text-center text-sm text-muted-foreground">Carregando ramais...</p>}
            {(mode === "filas" ? queues.length === 0 : directory.length === 0) && !directoryLoading && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum item disponível nesta empresa.</p>}
          </div>}
        </section>
        <aside aria-label="Detalhes da seleção" className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-base font-bold">Detalhes</h2>
            {(selected || selectedExtension) && <button type="button" aria-label="Limpar seleção" onClick={() => { setSelectedId(null); setSelectedExtension(null); }}><X size={16}/></button>}
          </div>
          {selected || selectedExtension ? <>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">{initials(selectedNumber)}</div>
              <div className="min-w-0"><h3 className="break-words text-base font-semibold">{selectedName}</h3>
                <p className="text-sm text-muted-foreground">{selectedNumber}</p></div>
              <AdminButton className="w-full" variant="primary" onClick={() => onDialNumber(selectedNumber)}><Phone size={16}/> Discar número</AdminButton>
              <p className="text-xs text-muted-foreground">O número será preenchido no discador. Confirme para ligar.</p>
            </div>
            {selected && !selectedExtension && <div className="mt-6 space-y-3 border-t border-border pt-5">
              <h4 className="text-sm font-semibold">Última interação</h4>
              {[
                ["Tipo de ligação", directionLabels[selected.direction] || selected.direction],
                ["Data e horário", displayTime(selected.started_at)],
                ["Duração", callDuration(selected.duration_seconds || 0)],
                ["Resultado", callStatus(selected)],
                ["Origem", selected.source],
                ["Destino", selected.destination],
              ].map(([key, value]) => <div key={key} className="flex items-start justify-between gap-3 text-xs"><span className="text-muted-foreground">{key}</span><span className="break-all text-right font-medium">{value}</span></div>)}
              {canRecordings && <AdminButton variant="secondary" className="mt-3 w-full" onClick={() => onSelectSection("gravacoes")}><Voicemail size={16}/> Consultar gravações</AdminButton>}
              <p className="text-xs text-muted-foreground">Reprodução disponível somente quando a gravação existir e estiver autorizada.</p>
            </div>}
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
