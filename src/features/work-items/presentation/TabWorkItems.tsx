import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  ArrowDownWideNarrow, ArrowRight, BellRing, CalendarDays, Check, CheckCheck, ChevronLeft,
  ChevronRight, Circle, ClipboardCheck, Clock3, Eraser, Flag, LayoutDashboard,
  LayoutGrid, List, Plus, Search, Sparkles, TrendingUp, Users, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/shared/domain/formatters";
import { AdminCard, AdminButton, BtnPrimary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { EmptyState, LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  loadWorkEmployees, loadWorkItems, updateWorkStatus,
  type WorkEmployee, type WorkItem, type WorkKind, type WorkPriority, type WorkStatus,
} from "../infrastructure/work-items.repository";
import { WorkItemDialog } from "./WorkItemDialog";

type View = "overview" | "list" | "board" | "calendar";
type Scope = "all" | "mine" | "today" | "overdue";
const STATUSES: { value: WorkStatus; label: string; dot: string; tint: string }[] = [
  { value: "pending", label: "Pendentes", dot: "bg-slate-400", tint: "bg-slate-500/5 dark:bg-slate-500/10" },
  { value: "in_progress", label: "Em andamento", dot: "bg-blue-500", tint: "bg-blue-500/5 dark:bg-blue-500/10" },
  { value: "waiting", label: "Aguardando", dot: "bg-amber-500", tint: "bg-amber-500/5 dark:bg-amber-500/10" },
  { value: "completed", label: "Concluídas", dot: "bg-emerald-500", tint: "bg-emerald-500/5 dark:bg-emerald-500/10" },
  { value: "cancelled", label: "Canceladas", dot: "bg-zinc-400", tint: "bg-zinc-500/5 dark:bg-zinc-500/10" },
];
const PRIORITY: Record<WorkPriority, { label: string; color: string }> = {
  low: { label: "Baixa", color: "text-slate-500 bg-slate-500/10" },
  normal: { label: "Normal", color: "text-blue-600 bg-blue-500/10 dark:text-blue-300" },
  high: { label: "Alta", color: "text-amber-700 bg-amber-500/10 dark:text-amber-300" },
  urgent: { label: "Urgente", color: "text-red-600 bg-red-500/10 dark:text-red-300" },
};
const status = (value: WorkStatus) => STATUSES.find(candidate => candidate.value === value) || STATUSES[0];
const todayISO = () => new Date().toLocaleDateString("en-CA");
const dayKey = (value: Date | string | null) => value
  ? new Date(value).toLocaleDateString("en-CA") : "";
const pastDue = (item: WorkItem) => item.due_at && new Date(item.due_at).getTime() < Date.now()
  && item.status !== "completed" && item.status !== "cancelled";
const dueLabel = (value: string | null) => value
  ? new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
  : "Sem prazo";
const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join("");
const progress = (item: WorkItem): number | null => {
  const checks = item.checklist || [];
  return checks.length ? Math.round(100 * checks.filter(check => check.done).length / checks.length)
    : item.status === "completed" ? 100 : null;
};
const viewOptions: { value: View; label: string; icon: typeof List }[] = [
  { value: "overview", label: "Painel", icon: LayoutDashboard },
  { value: "list", label: "Lista", icon: List },
  { value: "board", label: "Quadro", icon: LayoutGrid },
  { value: "calendar", label: "Calendário", icon: CalendarDays },
];

function AvatarStack({ ids, employees }: { ids: string[]; employees: WorkEmployee[] }) {
  const people = ids.map(id => employees.find(employee => employee.id === id)).filter(Boolean) as WorkEmployee[];
  if (!people.length) return <span className="text-xs text-muted-foreground">Sem responsável</span>;
  return <div className="flex items-center -space-x-2">
    {people.slice(0, 3).map((person, index) => <span key={person.id}
      title={person.full_name} aria-label={person.full_name}
      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-[9px] font-black text-primary"
      style={{ zIndex: 3 - index }}>{initials(person.full_name)}</span>)}
    {people.length > 3 && <span className="z-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-bold">+{people.length - 3}</span>}
  </div>;
}
function PriorityTag({ value }: { value: WorkPriority }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold", PRIORITY[value].color)}>
    <Flag size={11} />{PRIORITY[value].label}
  </span>;
}
function DueTag({ item }: { item: WorkItem }) {
  return <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium",
    pastDue(item) ? "text-red-600 dark:text-red-300" : "text-muted-foreground")}>
    <Clock3 size={12} />{dueLabel(item.due_at)}
  </span>;
}
function TaskCard({ item, employees, onOpen, onComplete, canComplete, compact = false }: {
  item: WorkItem; employees: WorkEmployee[]; onOpen: (item: WorkItem) => void;
  onComplete: (item: WorkItem) => void; canComplete: boolean; compact?: boolean;
}) {
  const s = status(item.status);
  return <div role="button" tabIndex={0} draggable={canComplete}
    onDragStart={event => event.dataTransfer.setData("text/plain", item.id)}
    onClick={() => onOpen(item)}
    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(item); } }}
    className={cn("group relative min-w-0 cursor-grab rounded-xl border border-border bg-card p-3.5 shadow-sm transition-all duration-200",
      "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:cursor-grabbing motion-reduce:transform-none",
      compact ? "space-y-3" : "space-y-3.5")}>
    <div className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r-full", s.dot)} />
    <div className="flex items-start gap-2">
      <button type="button" disabled={!canComplete}
        aria-label={!canComplete ? "Atividade somente leitura" : item.status === "completed" ? "Atividade concluída" : "Concluir atividade"}
        title={!canComplete ? "Sem permissão para concluir" : item.status === "completed" ? "Concluída" : "Concluir"}
        onClick={event => { event.stopPropagation(); onComplete(item); }}
        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
        {item.status === "completed" ? <CheckCheck size={20} className="text-emerald-500" /> : <Circle size={20} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("line-clamp-2 text-sm font-bold leading-snug text-foreground",
          item.status === "completed" && "text-muted-foreground line-through")}>{item.title}</p>
        {item.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      <PriorityTag value={item.priority} />
      {item.kind === "commitment" && <span className="rounded-md bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-600 dark:text-violet-300">Compromisso</span>}
      {item.category && <span className="max-w-28 truncate rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">{item.category}</span>}
    </div>
    <div className="flex items-center justify-between gap-2">
      <DueTag item={item} />
      <AvatarStack ids={item.assigned_employee_ids || []} employees={employees} />
    </div>
    {!compact && progress(item) !== null && <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-medium text-muted-foreground"><span>Checklist</span><span>{progress(item)}%</span></div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full bg-primary transition-all duration-500", item.status === "completed" && "bg-emerald-500")}
          style={{ width: progress(item) + "%" }} />
      </div>
    </div>}
  </div>;
}

function MonthCalendar({ items, selectedDate, setSelectedDate, onOpen }: {
  items: WorkItem[]; selectedDate: Date; setSelectedDate: (date: Date) => void; onOpen: (item: WorkItem) => void;
}) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => new Date(year, month, index - offset + 1));
  const monthTitle = first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const [highlightDay, setHighlightDay] = useState(() => todayISO());
  const grouped = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const item of items) {
      if (!item.due_at) continue;
      const key = dayKey(item.due_at);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [items]);
  const highlightedItems = grouped.get(highlightDay) || [];
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-base font-black capitalize text-foreground">{monthTitle}</h3>
      <div className="flex gap-1">
        <AdminButton size="sm" variant="secondary" onClick={() => setSelectedDate(new Date(year, month - 1, 1))} aria-label="Mês anterior"><ChevronLeft size={17} /></AdminButton>
        <AdminButton size="sm" variant="secondary" onClick={() => setSelectedDate(new Date())}>Hoje</AdminButton>
        <AdminButton size="sm" variant="secondary" onClick={() => setSelectedDate(new Date(year, month + 1, 1))} aria-label="Próximo mês"><ChevronRight size={17} /></AdminButton>
      </div>
    </div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 bg-muted/65 text-center text-[10px] font-bold uppercase text-muted-foreground">
        {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(day => <div key={day} className="py-3">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, index) => {
          const key = dayKey(day);
          const matches = grouped.get(key) || [];
          const isToday = key === todayISO();
          return <button type="button" key={index} onClick={() => setHighlightDay(key)}
            className={cn("relative flex min-h-16 flex-col items-center gap-1 border-b border-r border-border/70 px-1 py-2 text-xs transition-colors hover:bg-primary/5 sm:min-h-24 sm:items-start sm:px-2",
              day.getMonth() !== month && "bg-muted/35 text-muted-foreground/45",
              key === highlightDay && "bg-primary/10 ring-inset ring-1 ring-primary/35")}>
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full",
              isToday && "bg-primary font-bold text-white")}>{day.getDate()}</span>
            {matches.length > 0 && <div className="flex flex-wrap gap-1">
              {matches.slice(0, 3).map(item => <span key={item.id}
                className={cn("h-1.5 w-1.5 rounded-full", status(item.status).dot)} />)}
              {matches.length > 3 && <span className="text-[9px] font-bold">+{matches.length - 3}</span>}
            </div>}
            {matches[0] && <span className="hidden max-w-full truncate text-[10px] font-medium text-muted-foreground sm:block">{matches[0].title}</span>}
          </button>;
        })}
      </div>
    </div>
    <div className="space-y-2">
      <h4 className="text-sm font-bold">Atividades de {new Date(highlightDay + "T12:00:00").toLocaleDateString("pt-BR")}</h4>
      {!highlightedItems.length ? <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Sem atividades com prazo neste dia.</p> :
        highlightedItems.map(item => <button key={item.id} type="button" onClick={() => onOpen(item)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/30">
          <span className="truncate text-sm font-semibold">{item.title}</span><DueTag item={item} />
        </button>)}
    </div>
  </div>;
}

export function TabWorkItems() {
  const { activeOrganizationId, hasPermission, user, employee } = useAuth();
  const organizationId = activeOrganizationId || "";
  const canCreate = hasPermission("work_items.create");
  const canEdit = hasPermission("work_items.edit");
  const canManage = hasPermission("work_items.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedItemId = searchParams.get("item");
  const [view, setView] = useState<View>("overview");
  const [scope, setScope] = useState<Scope>("all");
  const [kind, setKind] = useState<WorkKind | "all">("all");
  const [filterStatus, setFilterStatus] = useState<WorkStatus | "all">("all");
  const [queryText, setQueryText] = useState("");
  const [sort, setSort] = useState<"due" | "newest" | "priority">("due");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [newKind, setNewKind] = useState<WorkKind>("task");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [moving, setMoving] = useState("");
  const [dragOverColumn, setDragOverColumn] = useState<WorkStatus | null>(null);
  const [recentlySavedId, setRecentlySavedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    setSelected(null);
    setDialogOpen(false);
    setPage(1);
    setRecentlySavedId(null);
  }, [organizationId]);

  const itemQuery = useQuery({
    queryKey: ["work-items", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => loadWorkItems(organizationId),
    staleTime: 60_000,
  });
  const employeeQuery = useQuery({
    queryKey: ["work-item-employees", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => loadWorkEmployees(organizationId),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (itemQuery.error) notifyAdmin(itemQuery.error instanceof Error ? itemQuery.error.message : "Erro ao carregar atividades.", "error");
  }, [itemQuery.error]);

  useEffect(() => {
    if (!linkedItemId || !itemQuery.data) return;
    const item = itemQuery.data.find(entry => entry.id === linkedItemId);
    if (item) { setSelected(item); setDialogOpen(true); }
  }, [linkedItemId, itemQuery.data]);

  const closeDialog = () => {
    setDialogOpen(false);
    if (linkedItemId) {
      setSearchParams(current => {
        const next = new URLSearchParams(current);
        next.delete("item");
        return next;
      }, { replace: true });
    }
  };

  const all = itemQuery.data || [];
  const employees = employeeQuery.data || [];
  const myEmployeeIds = employees.filter(person => person.profile_id === user?.id).map(person => person.id);
  if (employee?.id && !myEmployeeIds.includes(employee.id)) myEmployeeIds.push(employee.id);
  const overview = {
    total: all.filter(item => item.status !== "cancelled").length,
    pending: all.filter(item => item.status === "pending").length,
    inProgress: all.filter(item => item.status === "in_progress").length,
    overdue: all.filter(item => pastDue(item)).length,
    completed: all.filter(item => item.status === "completed").length,
    today: all.filter(item => dayKey(item.due_at) === todayISO() && item.status !== "completed").length,
  };
  const filtered = useMemo(() => {
    const search = queryText.trim().toLocaleLowerCase("pt-BR");
    const priorities = { urgent: 4, high: 3, normal: 2, low: 1 };
    return all.filter(item => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (scope === "mine" && !item.assigned_employee_ids?.some(id => myEmployeeIds.includes(id)) && item.created_by !== user?.id) return false;
      if (scope === "today" && dayKey(item.due_at) !== todayISO()) return false;
      if (scope === "overdue" && !pastDue(item)) return false;
      if (search && ![item.title, item.description, item.category, item.customer?.full_name, item.customer?.trade_name].some(value => (value || "").toLocaleLowerCase("pt-BR").includes(search))) return false;
      return true;
    }).sort((a, b) => sort === "priority" ? priorities[b.priority] - priorities[a.priority]
      : sort === "newest" ? b.created_at.localeCompare(a.created_at)
      : (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity));
  }, [all, queryText, kind, filterStatus, scope, sort, user?.id, myEmployeeIds.join(",")]);
  const listPage = filtered.slice((page - 1) * pageSize, page * pageSize);
  const openTask = (item: WorkItem) => { setSelected(item); setDialogOpen(true); };
  const newTask = (nextKind: WorkKind = "task") => { setNewKind(nextKind); setSelected(null); setDialogOpen(true); };
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["work-items", organizationId] });
  const moveTo = async (item: WorkItem, next: WorkStatus) => {
    if (!canEdit || moving || item.status === next) return;
    if (next === "completed" && item.kind === "commitment") { openTask(item); notifyAdmin("Informe o resultado do compromisso para concluí-lo.", "warning"); return; }
    setMoving(item.id);
    try {
      const saved = await updateWorkStatus(organizationId, item, next, null);
      queryClient.setQueryData<WorkItem[]>(["work-items", organizationId], old => (old || []).map(row => row.id === item.id ? saved : row));
      notifyAdmin("Andamento atualizado.", "success");
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Não foi possível atualizar.", "error");
    } finally { setMoving(""); }
  };
  const reset = () => { setQueryText(""); setScope("all"); setKind("all"); setFilterStatus("all"); setSort("due"); setPage(1); };
  const hasFilters = Boolean(queryText || scope !== "all" || kind !== "all" || filterStatus !== "all" || sort !== "due");
  // As prioridades não dependem da ordenação/filtros da tabela.
  // Uma atividade recém-criada aparece imediatamente, mesmo sem prazo.
  const upcoming = all.filter(item => item.status !== "completed" && item.status !== "cancelled")
    .sort((a, b) => {
      if (a.id === recentlySavedId) return -1;
      if (b.id === recentlySavedId) return 1;
      const score = (item: WorkItem) => {
        if (pastDue(item)) return 5;
        if (item.priority === "urgent") return 4;
        if (item.priority === "high") return 3;
        if (item.due_at && new Date(item.due_at).getTime() <= Date.now() + 86400000) return 2;
        return 1;
      };
      const diff = score(b) - score(a);
      if (diff) return diff;
      return b.created_at.localeCompare(a.created_at);
    }).slice(0, 6);
  const completionRatio = overview.total ? Math.round(overview.completed / overview.total * 100) : 0;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Compromissos e Tarefas" subtitle="Organize o trabalho, acompanhe promessas e cumpra prazos."
      actions={canCreate ? <BtnPrimary onClick={() => newTask()}>Novo</BtnPrimary> : undefined} />

    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-5 shadow-sm sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-20"
        style={{ backgroundImage: "radial-gradient(circle at 88% 12%, rgba(16,50,220,.15), transparent 34%), radial-gradient(circle at 8% 100%, rgba(59,130,246,.10), transparent 36%)" }} />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-lg space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            <Sparkles size={15} /> Seu espaço de trabalho
          </div>
          <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
            Cada combinado, sob controle.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">Tarefas, retornos e compromissos com clareza sobre quem faz, quando e o que foi cumprido.</p>
          {overview.overdue > 0 && <button type="button" onClick={() => { setScope("overdue"); setView("list"); setPage(1); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-500/15 dark:text-red-300">
            <BellRing size={14} /> {overview.overdue} prazo(s) vencido(s) <ArrowRight size={13} />
          </button>}
        </div>
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center self-center sm:mr-4">
          <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(var(--primary, #1032dc) " + completionRatio + "%, rgba(128,128,128,.13) 0)" }} />
          <div className="absolute inset-[9px] rounded-full bg-card" />
          <div className="relative text-center">
            <p className="text-2xl font-black tabular-nums text-foreground">{completionRatio}%</p>
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Concluído</p>
          </div>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {[
        { label: "Em aberto", count: overview.pending + overview.inProgress + all.filter(item => item.status === "waiting").length, icon: ClipboardCheck, tint: "text-primary", bg: "bg-primary/10" },
        { label: "Em andamento", count: overview.inProgress, icon: TrendingUp, tint: "text-blue-600 dark:text-blue-300", bg: "bg-blue-500/10" },
        { label: "Atrasadas", count: overview.overdue, icon: Clock3, tint: "text-red-600 dark:text-red-300", bg: "bg-red-500/10" },
        { label: "Concluídas", count: overview.completed, icon: CheckCheck, tint: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-500/10" },
      ].map(metric => { const Icon = metric.icon; return <div key={metric.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", metric.bg, metric.tint)}><Icon size={20} /></div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground">{metric.label}</p>
          <p className="text-2xl font-black tabular-nums leading-tight text-foreground">{metric.count}</p>
        </div>
      </div>; })}
    </div>

    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border pb-2">
      {viewOptions.map(option => { const Icon = option.icon; return <button type="button" key={option.value}
        onClick={() => setView(option.value)}
        className={cn("flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-all duration-200",
          view === option.value ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
        <Icon size={16} /> {option.label}
      </button>; })}
    </div>

    <AdminSearchPanel title="Buscar atividades" headerActions={hasFilters ? <button type="button" onClick={reset}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"><Eraser size={13} /> Limpar filtros</button> : undefined}>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-5">
        <div className="relative col-span-2 md:col-span-2">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(INPUT, "h-10 pl-9 text-sm")} placeholder="Buscar por título, cliente, descrição..." value={queryText}
            onChange={event => { setQueryText(event.target.value); setPage(1); }} />
        </div>
        <select className={cn(INPUT, "h-10 text-xs")} value={scope} aria-label="Filtrar atividades"
          onChange={event => { setScope(event.target.value as Scope); setPage(1); }}>
          <option value="all">Todas</option><option value="mine">Minhas tarefas</option>
          <option value="today">Para hoje</option><option value="overdue">Atrasadas</option>
        </select>
        <select className={cn(INPUT, "h-10 text-xs")} value={kind} aria-label="Filtrar tipo"
          onChange={event => { setKind(event.target.value as WorkKind | "all"); setPage(1); }}>
          <option value="all">Todos os tipos</option><option value="task">Tarefas</option><option value="commitment">Compromissos</option>
        </select>
        <select className={cn(INPUT, "col-span-2 h-10 text-xs md:col-span-2 xl:col-span-1")} value={filterStatus} aria-label="Filtrar andamento"
          onChange={event => { setFilterStatus(event.target.value as WorkStatus | "all"); setPage(1); }}>
          <option value="all">Todos os status</option>
          {STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
    </AdminSearchPanel>

    {itemQuery.isPending && <LoadingState text="Carregando atividades..." />}
    {!itemQuery.isPending && !itemQuery.isError && <>
      {view === "overview" && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
        <AdminCard>
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="font-black">Prioridades para acompanhar</h3>
            <button type="button" onClick={() => setView("list")} className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">Ver todas <ArrowRight size={13} /></button>
          </div>
          <div className="space-y-2.5 p-3 sm:p-4">
            {upcoming.length ? upcoming.map(item => <TaskCard key={item.id} compact item={item} employees={employees} canComplete={canEdit}
              onOpen={openTask} onComplete={entry => void moveTo(entry, entry.status === "completed" ? "pending" : "completed")} />) :
              <EmptyState icon={Check} title="Tudo em dia" message="Não há atividades pendentes nesta seleção." />}
          </div>
        </AdminCard>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-black"><LayoutGrid size={16} className="text-primary" /> Fluxo de trabalho</h3>
            <div className="space-y-3">
              {STATUSES.filter(stage => stage.value !== "cancelled").map(stage => {
                const count = filtered.filter(item => item.status === stage.value).length;
                return <button type="button" key={stage.value}
                  onClick={() => { setFilterStatus(stage.value); setView("board"); }}
                  className="block w-full space-y-1.5 text-left">
                  <div className="flex justify-between text-xs"><span className="flex items-center gap-2 font-medium"><span className={cn("h-2.5 w-2.5 rounded-full", stage.dot)} />{stage.label}</span><strong>{count}</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all duration-500", stage.dot)}
                    style={{ width: (filtered.length ? 100 * count / filtered.length : 0) + "%" }} /></div>
                </button>;
              })}
            </div>
          </div>
          <div className="rounded-xl border border-primary/15 bg-primary/[.04] p-4 dark:bg-primary/10">
            <div className="flex items-center gap-2 text-sm font-black text-primary"><Sparkles size={17} /> Criar rapidamente</div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Registre uma promessa ao cliente ou distribua a próxima tarefa em poucos segundos.</p>
            {canCreate && <div className="mt-3 flex gap-2">
              <AdminButton variant="secondary" size="sm" onClick={() => newTask("task")}>Nova tarefa</AdminButton>
              <AdminButton size="sm" onClick={() => newTask("commitment")}>Novo compromisso</AdminButton>
            </div>}
          </div>
        </div>
      </div>}

      {view === "list" && <AdminCard className="[&_th]:py-3">
        {!filtered.length ? <EmptyState icon={ClipboardCheck} title="Nenhuma atividade encontrada" message="Ajuste os filtros ou crie uma atividade." /> : <>
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <p className="text-xs font-bold text-muted-foreground">{filtered.length} atividade(s)</p>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ArrowDownWideNarrow size={14} /> Ordenar
              <select aria-label="Ordenação" value={sort} onChange={event => setSort(event.target.value as typeof sort)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground">
                <option value="due">Prazo</option><option value="priority">Prioridade</option><option value="newest">Mais recentes</option>
              </select>
            </label>
          </div>
          <div className="divide-y divide-border md:hidden">
            {listPage.map(item => <div key={item.id} className="p-3">
              <TaskCard compact item={item} employees={employees} canComplete={canEdit} onOpen={openTask}
                onComplete={entry => void moveTo(entry, entry.status === "completed" ? "pending" : "completed")} />
            </div>)}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[770px]">
              <thead><tr><th className="text-left">Atividade</th><th className="text-left">Andamento</th><th className="text-left">Prioridade</th><th className="text-left">Prazo</th><th className="text-left">Responsáveis</th></tr></thead>
              <tbody>{listPage.map(item => <tr key={item.id} role="button" tabIndex={0} onClick={() => openTask(item)}
                onKeyDown={event => { if (event.key === "Enter") openTask(item); }}>
                <td className="max-w-[330px]">
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={!canEdit} aria-label={!canEdit ? "Atividade somente leitura" : "Alternar conclusão"}
                      onClick={event => { event.stopPropagation(); void moveTo(item, item.status === "completed" ? "pending" : "completed"); }}
                      className="shrink-0 text-primary disabled:cursor-not-allowed disabled:opacity-40">
                      {item.status === "completed" ? <CheckCheck size={19} className="text-emerald-500" /> : <Circle size={19} />}
                    </button>
                    <div className="min-w-0"><p className={cn("truncate text-sm font-bold", item.status === "completed" && "line-through text-muted-foreground")}>{item.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{item.kind === "commitment" ? "Compromisso" : "Tarefa"}{item.customer?.full_name ? " · " + item.customer.full_name : ""}</p>
                    </div>
                  </div>
                </td>
                <td><span className="inline-flex items-center gap-2 whitespace-nowrap text-xs"><span className={cn("h-2 w-2 rounded-full", status(item.status).dot)} />{status(item.status).label}</span></td>
                <td><PriorityTag value={item.priority} /></td>
                <td><DueTag item={item} /></td>
                <td><AvatarStack employees={employees} ids={item.assigned_employee_ids || []} /></td>
              </tr>)}</tbody>
            </table>
          </div>
          <PaginationBar page={Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))} pageSize={pageSize}
            totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
        </>}
      </AdminCard>}

      {view === "board" && <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max items-start gap-3">
          {STATUSES.map(stage => {
            const entries = filtered.filter(item => item.status === stage.value);
            return <div key={stage.value} className={cn("w-[270px] shrink-0 rounded-xl border border-border p-2.5 transition-all duration-200 sm:w-[300px]",
                stage.tint, dragOverColumn === stage.value && "border-primary/60 bg-primary/[.08] ring-2 ring-primary/20")}
              onDragOver={event => { event.preventDefault(); if (canEdit) setDragOverColumn(stage.value); }}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={event => {
                event.preventDefault();
                setDragOverColumn(null);
                const id = event.dataTransfer.getData("text/plain");
                const item = all.find(entry => entry.id === id);
                if (item) void moveTo(item, stage.value);
              }}>
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", stage.dot)} />
                  <h3 className="text-xs font-black">{stage.label}</h3>
                  <span className="rounded-md bg-card px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{entries.length}</span>
                </div>
                {canCreate && <button type="button" title="Criar atividade" aria-label="Criar atividade" onClick={() => newTask()}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-card hover:text-primary"><Plus size={17} /></button>}
              </div>
              <div className="min-h-40 space-y-2.5">
                {entries.map(item => <TaskCard key={item.id} item={item} employees={employees} canComplete={canEdit} onOpen={openTask}
                  onComplete={entry => void moveTo(entry, entry.status === "completed" ? "pending" : "completed")} />)}
                {!entries.length && <div className="rounded-xl border border-dashed border-border/70 bg-card/30 p-5 text-center text-xs text-muted-foreground">Arraste uma tarefa para cá</div>}
              </div>
            </div>;
          })}
        </div>
      </div>}

      {view === "calendar" && <AdminCard><div className="p-4 sm:p-5">
        <MonthCalendar items={filtered} selectedDate={month} setSelectedDate={setMonth} onOpen={openTask} />
      </div></AdminCard>}
    </>}

    <WorkItemDialog key={selected?.id || (dialogOpen ? "new" : "closed")} open={dialogOpen}
      item={selected} initialKind={newKind} organizationId={organizationId} employees={employees}
      canEdit={selected ? canEdit : canCreate}
      onClose={closeDialog}
      onSaved={saved => {
        setRecentlySavedId(saved.id);
        queryClient.setQueryData<WorkItem[]>(["work-items", organizationId], old => {
          const records = old || [];
          return [saved, ...records.filter(entry => entry.id !== saved.id)];
        });
        closeDialog(); refresh();
      }} />
  </div>;
}