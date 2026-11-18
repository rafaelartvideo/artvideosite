import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, ContactRound, Headphones, LoaderCircle, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search, Settings2, X } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { AdminSubsectionTabs } from "@/shared/ui/admin/AdminSubsectionTabs";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { pbxRequest } from "../application/pbx-request";
import { callDuration, dispositionLabels, directionLabels, loadCallHistory, localHistoryDate, type CallHistoryRow, type HistoryFilters } from "../application/call-history";
import { formatPbxNumber } from "../domain/pbx-display";
export { formatPbxNumber } from "../domain/pbx-display";
import { pbxContactPhoneKey, usePbxSavedContactCards, type PbxSavedContactCard } from "../application/pbx-saved-contact-cards";
import { PbxCrmContactPanel } from "./PbxCrmContactPanel";
import { PbxContactActivity } from "./PbxContactActivity";
import { PbxContactDirectory, type PbxDirectoryContact } from "./PbxContactDirectory";
import type { UnionPbxSection } from "./UnionPbxSectionTabs";

type Extension = { number: number; display_name: string; endpoint_name: string };
type Queue = { number: number; name: string };
type WorkspaceMode = "chamadas" | "contatos";
type RecentFilter = "todas" | "atendidas" | "perdidas";
const EMPTY_CALL_ROWS: CallHistoryRow[] = [];
type Props = {
  isActive: boolean;
  dialer: ReactNode;
  connectionStatus: "offline" | "connecting" | "registered" | "error";
  callState: "idle" | "dialing" | "incoming" | "active";
  remoteParty: string;
  callerCard?: PbxSavedContactCard;
  completedCall: { sequence:number; number:string; startedAt:number; at:number };
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
  onReturnCall: (number: string) => void;
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
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const first = words[0] || "";
  if (/[a-zÀ-ÿ]/i.test(first)) {
    return ((first[0] || "") + (words.length > 1 ? words[words.length - 1][0] : first[1] || "")).toUpperCase();
  }
  return value.replace(/\D/g, "").slice(-2) || "PB";
}


/** Apenas apresentação do operador: o WebRTC e o áudio continuam na instância persistente do telefone. */
export function UnionPbxOperatorWorkspace({
  isActive, dialer, connectionStatus, callState, remoteParty, callerCard, completedCall, lineLabel, extensionLabel,
  directory, directoryLoading, onBack, onConnectionSettings, onDeviceSettings, onDirectoryChange,
  onSelectSection, onReturnCall, canManage, canManageInbound, canRecordings,
}: Props) {
  const { activeOrganizationId, user } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<WorkspaceMode>("chamadas");
  const [contactsVisited, setContactsVisited] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentFilter, setRecentFilter] = useState<RecentFilter>("todas");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(null);
  const [selectedExternal, setSelectedExternal] = useState<PbxDirectoryContact | null>(null);
  const [contactRevision, setContactRevision] = useState(0);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState("");

  const [brokenAvatar, setBrokenAvatar] = useState<Record<string,true>>({});
  const settingsRef = useRef<HTMLDivElement>(null);
  const completedHandledRef = useRef(0);
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

  useEffect(() => { setPage(1); setSelectedId(null); setSelectedExtension(null); setSelectedExternal(null); setDetailsOpen(false); completedHandledRef.current=completedCall.sequence; setBrokenAvatar({}); }, [activeOrganizationId, user?.id]);

  // Cache central do CRM: a navegação entre seções reaproveita o recorte mais recente.
  const historyToday = localHistoryDate(new Date());
  const historyQueryKey = ["pbx", "recent-calls", activeOrganizationId, user?.id || "", historyToday] as const;
  const recentHistoryQuery = useQuery({
    queryKey: historyQueryKey,
    enabled: Boolean(activeOrganizationId && isActive),
    staleTime: 5 * 60_000,
    queryFn: async ({signal}) => {
      const {data,count,error} = await pbxRequest(requestSignal =>
        loadCallHistory(supabase, activeOrganizationId!, initialHistoryFilters(), 1, 100, requestSignal),
        "Chamadas recentes", {signal});
      if(error) throw error;
      return {rows:(data || []) as CallHistoryRow[], total:count || 0};
    },
  });
  const loadedRows = recentHistoryQuery.data?.rows || EMPTY_CALL_ROWS;
  const total = recentHistoryQuery.data?.total || 0;
  const loading = recentHistoryQuery.isPending && !recentHistoryQuery.data;
  const error = recentHistoryQuery.isError && !recentHistoryQuery.data ? "Não foi possível consultar as chamadas." : "";
  useEffect(() => {
    setSelectedId(previous => previous && loadedRows.some(row => row.id === previous) ? previous : null);
  },[loadedRows]);
  useEffect(() => {
    if (revision > 0 && activeOrganizationId) void queryClient.invalidateQueries({queryKey:historyQueryKey});
  },[revision, activeOrganizationId, user?.id, historyToday, queryClient]);

  const rows = loadedRows.filter(row=>{
    const number=numberSearch.replace(/\D/g,"");
    const resultFilter=recentFilter==="todas"|| (recentFilter==="atendidas"
      ?row.disposition==="ANSWERED":row.disposition!=="ANSWERED");
    return resultFilter && (!number||
      (row.source+row.destination).replace(/\D/g,"").includes(number));
  });
  const visibleRows=rows.slice((page-1)*pageSize,page*pageSize);
  const filteredTotal=rows.length;

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
      .subscribe();
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      // Foco/restabelecimento de assinatura não significa que há chamadas novas.
      // Consulte somente se o recorte salvo já passou da validade do cache.
      const lastUpdated = queryClient.getQueryState(historyQueryKey)?.dataUpdatedAt || 0;
      if (Date.now() - lastUpdated >= 5 * 60_000) schedule("calls");
      schedule("directory");
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [activeOrganizationId, isActive, user?.id, historyToday, queryClient]);

  // Seleciona apenas a ligação que realmente acabou, nunca o primeiro item do histórico.
  useEffect(() => {
    if (!isActive || !completedCall.sequence || completedHandledRef.current >= completedCall.sequence) return;
    if (Date.now() - completedCall.at > 120_000) {
      completedHandledRef.current = completedCall.sequence;
      return;
    }
    const phone = completedCall.number.replace(/\D/g,"").replace(/^55(?=\d{10,11}$)/,"");
    if (!phone) return;
    const matching = loadedRows.find(row => {
      const recordPhone = callNumber(row).replace(/\D/g,"").replace(/^55(?=\d{10,11}$)/,"");
      if (phone !== recordPhone) return false;
      const started = new Date(row.started_at).getTime();
      const ended = new Date(row.ended_at).getTime();
      return Number.isFinite(started) && Number.isFinite(ended)
        && started >= completedCall.startedAt - 30_000
        && ended >= completedCall.startedAt
        && Math.abs(ended - completedCall.at) <= 90_000;
    });
    if (!matching) return;
    completedHandledRef.current = completedCall.sequence;
    setSelectedExternal(null);
    setSelectedExtension(null);
    setMode("chamadas");
    setRecentFilter("todas");
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
    setSelectedId(matching.id);
  }, [isActive, completedCall, loadedRows]);

  useEffect(() => {
    if (!isActive || !completedCall.sequence) return;
    setRevision(value => value + 1);
    // O CDR pode chegar após o evento SIP de encerramento; uma segunda leitura limitada resolve o atraso.
    const timer = setTimeout(() => setRevision(value => value + 1), 1800);
    return () => clearTimeout(timer);
  }, [isActive, completedCall.sequence]);

  const selected = loadedRows.find(row => row.id === selectedId) || null;
  const inCallNumber = callState !== "idle" && remoteParty && remoteParty !== "Chamada" ? remoteParty : "";
  // Show the current caller even before its CDR exists in the recent-call history.
  const selectedNumber = selectedExternal?.number || selectedExtension?.number.toString() || (selected ? callNumber(selected) : "");
  const currentCallerCard = selectedNumber && selectedNumber === inCallNumber ? callerCard : undefined;
  const hasDetails = Boolean(selected || selectedExtension || selectedExternal);
  const savedCards = usePbxSavedContactCards(activeOrganizationId, isActive,
    [...visibleRows.map(callNumber), ...(selectedNumber ? [selectedNumber] : [])],contactRevision);
  const contactCard = savedCards[pbxContactPhoneKey(selectedNumber)];
  // A seleção no modal prevalece sobre a chamada ativa: não misturar nomes de contatos distintos.
  const selectedName = currentCallerCard?.name
    || selectedExtension?.display_name
    || (selectedExternal?.source === "crm" ? selectedExternal.name : null)
    || (contactCard?.source === "crm" ? contactCard.name : null)
    || selectedExternal?.name || contactCard?.name
    || directory.find(item => String(item.number) === selectedNumber)?.display_name
    || (selectedNumber ? formatPbxNumber(selectedNumber) : "");
  const selectedAvatarKey = pbxContactPhoneKey(selectedNumber);
  const avatarUrl = currentCallerCard?.avatarUrl || contactCard?.avatarUrl || null;
  const selectedAvatar = avatarUrl && !brokenAvatar[selectedAvatarKey + ":" + avatarUrl]
    ? avatarUrl : null;
  const identitySource = currentCallerCard?.source || (selectedExternal?.source === "crm" ? "crm" : null) || contactCard?.source || selectedExternal?.source || null;
  const pages = Math.max(1, Math.ceil(filteredTotal / pageSize));


  const openContactEditor=(number="",name="")=>{
    setDetailsOpen(false);
    setContactPhone(number);setContactName(name && name!==formatPbxNumber(number) ? name : "");
    setContactNotes("");setContactError("");setContactDialogOpen(true);
  };
  const saveContact=async()=>{
    if(!activeOrganizationId || !pbxContactPhoneKey(contactPhone)||contactName.trim().length<2)return;
    setContactSaving(true);setContactError("");
    try{
      const {data,error:saveError}=await supabase.functions.invoke<{success?:boolean;error?:string}>("union-pbx-contact-cards",{
        body:{action:"save",organization_id:activeOrganizationId,phone:contactPhone,
          name:contactName.trim(),notes:contactNotes.trim()},
      });
      if(saveError||!data?.success)throw Error(data?.error||"Não foi possível salvar este contato.");
      setContactDialogOpen(false);
      setContactRevision(value=>value+1);
      setSelectedExternal({number:pbxContactPhoneKey(contactPhone),name:contactName.trim(),source:"pbx"});
      setSelectedId(null);setSelectedExtension(null);
    }catch(reason){setContactError(reason instanceof Error?reason.message:"Não foi possível salvar o contato.");}
    finally{setContactSaving(false);}
  };

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

  return <div className="min-w-0 space-y-3 text-foreground">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-[185px] flex-1">
        <AdminSubsectionTabs<WorkspaceMode>
      ariaLabel="Subseções da central de chamadas"
      value={mode}
      items={nav}
      onChange={next=>{
        setMode(next);
        if(next==="contatos")setContactsVisited(true);
        setSettingsOpen(false);setDetailsOpen(false);setSelectedExternal(null);setSelectedExtension(null);setSelectedId(null);
      }}
    />
      </div>
      <div role="group" aria-label="Ações do PABX" className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <AdminButton variant="secondary" size="sm" aria-label="Dispositivos e testes de áudio"
          title="Dispositivos e testes de áudio" onClick={onDeviceSettings}>
          <Headphones size={16}/> Áudio
        </AdminButton>
        <div ref={settingsRef} className="relative">
          <AdminButton variant="secondary" size="sm" title="Configurações gerais do módulo"
            aria-label="Configurações gerais do PABX" aria-expanded={settingsOpen} aria-controls="pbx-module-settings"
            onClick={()=>setSettingsOpen(value=>!value)}>
            <Settings2 size={16}/> Configurações
          </AdminButton>
          {settingsOpen && <div id="pbx-module-settings"
            className="absolute right-0 top-full z-40 mt-2 w-[min(270px,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-2 text-sm shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-border px-2 pb-2">
              <span className="text-xs font-semibold">Configurações gerais</span>
              <button type="button" aria-label="Fechar menu" onClick={()=>setSettingsOpen(false)}><X size={15}/></button>
            </div>
            {settingItems.map(item=><button key={item.section} type="button"
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
              onClick={()=>{setSettingsOpen(false);onSelectSection(item.section);}}>{item.label}</button>)}
          </div>}
        </div>
        <AdminButton variant="secondary" size="sm" onClick={onBack}><ArrowLeft size={16}/> Voltar</AdminButton>
      </div>
    </div>
    <div className="grid min-w-0 items-stretch gap-2 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]">
        <section aria-label="Discador" className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">

          <div className="mb-4 flex min-w-0 items-center justify-between gap-2 border-b border-border pb-3">
            <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Telefone</h2><p className="truncate text-xs text-muted-foreground" title={lineLabel}>{lineLabel}</p></div>
            <button type="button" onClick={onConnectionSettings} disabled={connectionStatus==="connecting"}
              aria-label={connectionStatus==="registered"?"Desconectar ramal":"Conectar ramal"} title={extensionLabel}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors disabled:cursor-progress ${connectionStatus==="registered"?"border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400":connectionStatus==="connecting"?"border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300":"border-border bg-background text-muted-foreground hover:text-primary"}`}>
              {connectionStatus==="connecting"
                ? <LoaderCircle size={15} className="animate-spin text-amber-500"/>
                : <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${connectionStatus==="registered"?"bg-emerald-500":connectionStatus==="error"?"bg-red-500":"bg-red-500"}`}/>}
              {connectionStatus==="registered"?"Conectado":connectionStatus==="connecting"?"Conectando...":"Conectar"}
              <span className="max-w-[95px] truncate font-normal">{extensionLabel === "Ramal não conectado" ? "" : extensionLabel.replace("Ramal ","")}</span>
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
            <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Filtrar chamadas">
                {([["todas","Todas"],["atendidas","Atendidas"],["perdidas","Não atendidas"]] as const).map(([value,label])=>
                  <button type="button" key={value} aria-pressed={recentFilter===value} onClick={()=>{setPage(1);setRecentFilter(value);}}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${recentFilter===value?"border-primary/20 bg-primary/10 text-primary":"border-border text-muted-foreground hover:bg-muted"}`}>
                    {value==="atendidas"&&<PhoneIncoming size={15} className="text-emerald-600"/>}
                    {value==="perdidas"&&<PhoneMissed size={15} className="text-red-600"/>}
                    {label}
                  </button>)}
              </div>
              <label className="relative min-w-[170px] flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input type="tel" value={search} onChange={event => {setPage(1);setSearch(event.target.value);}}
                  placeholder="Buscar por número" aria-label="Buscar chamadas por número"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"/>
              </label>
            </div>
            <div className="mt-3 min-w-0 flex-1">
              <table className="hidden w-full table-fixed lg:table border-separate border-spacing-0 text-left text-xs">
                <thead><tr className="text-muted-foreground">
                  <th className="w-[29%] border-b border-border px-1.5 py-2 font-medium">Contato / número</th>
                  <th className="w-[11%] border-b border-border px-1.5 py-2 font-medium">Tipo</th>
                  <th className="w-[25%] border-b border-border px-1.5 py-2 font-medium">Horário</th>
                  <th className="w-[13%] border-b border-border px-1.5 py-2 font-medium">Duração</th>
                  <th className="w-[12%] border-b border-border px-1.5 py-2 font-medium">Estado</th>
                  <th className="w-[10%] border-b border-border px-1.5 py-2 font-medium">Ações</th>
                </tr></thead>
                <tbody>{visibleRows.map(row => {
                  const number = callNumber(row);
                  const extension = directory.find(item => String(item.number) === number);
                  const saved = savedCards[pbxContactPhoneKey(number)];
                  const name = extension?.display_name || saved?.name || formatPbxNumber(number) || "Desconhecido";
                  const avatarKey = pbxContactPhoneKey(number);
                  const avatar = saved?.avatarUrl && !brokenAvatar[avatarKey + ":" + saved.avatarUrl] ? saved.avatarUrl : null;
                  const active = row.id === selectedId && !selectedExtension && !selectedExternal;
                  return <tr key={row.id} onClick={() => { setSelectedId(row.id); setSelectedExtension(null); setSelectedExternal(null); setDetailsOpen(true); }}
                    className={`cursor-pointer hover:bg-muted/50 ${active ? "bg-primary/5" : ""}`}>
                    <td className="border-b border-border/60 px-1.5 py-2"><div className="flex items-center gap-2">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {avatar
                          ? <img src={avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover"
                              onError={() => setBrokenAvatar(old => ({...old, [avatarKey + ":" + avatar]: true}))}/>
                          : initials(name)}
                      </span>
                      <div className="min-w-0"><p className="max-w-[205px] truncate font-semibold" title={name}>{name}</p><p className="max-w-[205px] truncate text-[11px] text-muted-foreground">{extension ? formatPbxNumber(number) : formatPbxNumber(row.source) + " → " + formatPbxNumber(row.destination)}</p></div>
                    </div></td>
                    <td className="border-b border-border/60 px-1.5 py-2"><span className="inline-flex items-center gap-1">{row.direction === "inbound" ? <ArrowDownLeft size={14} className="text-emerald-600"/> : <ArrowUpRight size={14} className="text-primary"/>}{directionLabels[row.direction] || row.direction}</span></td>
                    <td className="whitespace-nowrap border-b border-border/60 px-1.5 py-2" title={new Date(row.started_at).toLocaleString("pt-BR")}>{displayTime(row.started_at)}</td>
                    <td className="whitespace-nowrap border-b border-border/60 px-1.5 py-2 tabular-nums">{callDuration(row.duration_seconds || 0)}</td>
                    <td className="border-b border-border/60 px-1.5 py-2">
                      <span role="img" aria-label={callStatus(row)} title={callStatus(row)}
                        className={row.disposition === "ANSWERED" ? "inline-flex text-emerald-600 dark:text-emerald-400" : "inline-flex text-red-600 dark:text-red-400"}>
                        {row.disposition !== "ANSWERED" ? <PhoneMissed size={19}/> : row.direction === "outbound" ? <PhoneOutgoing size={19}/> : <PhoneIncoming size={19}/>}
                      </span>
                    </td>
                    <td className="border-b border-border/60 px-1.5 py-2">
                      {row.disposition !== "ANSWERED"
                        ? <button type="button" title="Retornar chamada" aria-label={`Retornar chamada para ${formatPbxNumber(number)}`}
                            disabled={callState !== "idle"} onClick={event => {event.stopPropagation();onReturnCall(number);}}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-primary hover:bg-primary/10 disabled:opacity-40">
                            <Phone size={16}/>
                          </button>
                        : <button type="button" title="Ver detalhes" aria-label="Ver detalhes da chamada"
                            onClick={event => {event.stopPropagation();setSelectedId(row.id);setSelectedExtension(null);setSelectedExternal(null);setDetailsOpen(true);}}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-primary">
                            <ContactRound size={16}/>
                          </button>}
                    </td>
                  </tr>;
                })}</tbody>
              </table>
              <div className="space-y-2 lg:hidden" aria-label="Chamadas recentes em cartões">
                {visibleRows.map(row => {
                  const number = callNumber(row);
                  const extension = directory.find(item => String(item.number) === number);
                  const saved = savedCards[pbxContactPhoneKey(number)];
                  const name = extension?.display_name || saved?.name || formatPbxNumber(number) || "Desconhecido";
                  return <div key={row.id} className="rounded-lg border border-border p-3">
                    <button type="button" className="w-full min-w-0 text-left"
                      onClick={() => {setSelectedId(row.id);setSelectedExtension(null);setSelectedExternal(null);setDetailsOpen(true);}}>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
                        {row.disposition === "ANSWERED" ? <PhoneIncoming size={16} className="shrink-0 text-emerald-600"/> : <PhoneMissed size={16} className="shrink-0 text-red-600"/>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{formatPbxNumber(row.source)} → {formatPbxNumber(row.destination)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{directionLabels[row.direction] || row.direction} · {displayTime(row.started_at)} · {callDuration(row.duration_seconds || 0)}</p>
                    </button>
                    <button type="button" disabled={callState !== "idle"} onClick={() => onReturnCall(number)}
                      className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-semibold text-primary disabled:opacity-40">
                      <Phone size={14}/> Ligar
                    </button>
                  </div>;
                })}
              </div>
              {!loading && !error && visibleRows.length === 0 && <p className="px-3 py-12 text-center text-sm text-muted-foreground">Nenhuma chamada encontrada para esse filtro.</p>}
              {loading && <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm font-medium text-primary"><LoaderCircle size={20} className="animate-spin"/> Carregando chamadas...</p>}
              {error && <p role="alert" className="py-6 text-center text-sm text-destructive">{error}</p>}
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>Mostrando {filteredTotal ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize,filteredTotal)} de {filteredTotal}{total>100?" (últimas 100)":""}</span>
              <div className="flex items-center gap-2">
                <button aria-label="Página anterior" type="button" disabled={loading || page === 1} onClick={() => setPage(p => p - 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronLeft size={16}/></button>
                <span className="tabular-nums">{page} / {pages}</span>
                <button aria-label="Próxima página" type="button" disabled={loading || page >= pages} onClick={() => setPage(p => p + 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronRight size={16}/></button>
              </div>
            </div>

          </> : null}
          <div className={mode==="contatos" ? "contents" : "hidden"}>
            <PbxContactDirectory organizationId={activeOrganizationId} active={isActive && contactsVisited}
              revision={contactRevision} extensions={directory} onNew={()=>openContactEditor()}
              onSelect={item=>{setSelectedExternal(item);setSelectedExtension(null);setSelectedId(null);setDetailsOpen(true);}}/>
          </div>
        </section>
      </div>
    <AdminDialog open={detailsOpen && isActive} onClose={() => setDetailsOpen(false)}
      title="Detalhes do contato" className="w-[min(640px,calc(100vw-1.5rem))] max-w-[640px]" minimizable={false}>
      <div className="min-w-0 space-y-3 p-1">
          {hasDetails ? <>
            <div className="flex flex-col items-stretch gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {selectedAvatar
                    ? <img src={selectedAvatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"
                        onError={() => setBrokenAvatar(old => ({...old,[selectedAvatarKey + ":" + selectedAvatar]:true}))}/>
                    : initials(selectedName || selectedNumber)}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <h3 className="break-words text-sm font-semibold leading-5">{selectedName}</h3>
                  <p className="mt-0.5 break-all text-xs text-muted-foreground">{formatPbxNumber(selectedNumber)}</p>
                </div>
              </div>
              <div className="flex w-full min-w-0 items-center gap-2">
                <AdminButton className="min-w-0 flex-1" variant="primary" disabled={callState !== "idle" || !selectedNumber}
                  onClick={() => onReturnCall(selectedNumber)}><Phone size={16}/> Ligar</AdminButton>
                {pbxContactPhoneKey(selectedNumber) && identitySource !== "crm" &&
                  <AdminButton variant="secondary" className="min-w-0 flex-1" onClick={() => openContactEditor(selectedNumber,selectedName)}>
                    <ContactRound size={16}/>
                    {identitySource === "pbx" || identitySource === "whatsapp"
                      ? "Editar" : "Salvar contato"}
                  </AdminButton>}
              </div>

            </div>
            <PbxCrmContactPanel organizationId={activeOrganizationId} phone={selectedNumber}
              active={isActive && detailsOpen && Boolean(selectedNumber)} source={identitySource}/>
            <PbxContactActivity organizationId={activeOrganizationId} number={selectedNumber}
              active={isActive && detailsOpen} revision={revision} callBusy={callState !== "idle"} onDialNumber={onReturnCall}/>
          </> : <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ContactRound size={32}/><p>Selecione uma chamada ou ramal para ver os detalhes.</p>
          </div>}

      </div>
    </AdminDialog>
    <AdminDialog open={contactDialogOpen} onClose={()=>{if(!contactSaving)setContactDialogOpen(false);}}
      title="Contato telefônico" description="Salvo somente na agenda PABX. WhatsApp não é obrigatório."
      className="w-[min(500px,calc(100vw-1.5rem))]" minimizable={false}>
      <form className="space-y-4 p-1" onSubmit={event=>{event.preventDefault();void saveContact();}}>
        <label className="block text-sm font-semibold">Nome
          <input autoComplete="off" value={contactName} onChange={event=>setContactName(event.target.value)}
            maxLength={160} required className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"/>
        </label>
        <label className="block text-sm font-semibold">Telefone com DDD
          <input autoComplete="off" type="tel" value={contactPhone} onChange={event=>setContactPhone(event.target.value)}
            maxLength={32} required placeholder="(11) 99999-9999"
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"/>
        </label>
        <label className="block text-sm font-semibold">Observações (opcional)
          <textarea value={contactNotes} onChange={event=>setContactNotes(event.target.value)}
            maxLength={500} rows={2} className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"/>
        </label>
        {contactError&&<p role="alert" className="text-xs text-destructive">{contactError}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <AdminButton variant="secondary" type="button" disabled={contactSaving} onClick={()=>setContactDialogOpen(false)}>Cancelar</AdminButton>
          <AdminButton variant="primary" type="submit" disabled={contactSaving||contactName.trim().length<2||!pbxContactPhoneKey(contactPhone)}>
            {contactSaving?<LoaderCircle size={15} className="animate-spin"/>:<ContactRound size={15}/>} Salvar contato
          </AdminButton>
        </div>
      </form>
    </AdminDialog>
  </div>;
}
