import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, CalendarDays, Check, Search } from "lucide-react";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/primitives/popover";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import type { TechnicianTask } from "../infrastructure/technician-tasks.repository";

type Row = TechnicianTask[];
type Filter = "all" | "pending" | "in_progress" | "completed";
type Sort = "" | "asc" | "desc";

const statuses: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas" }, { value: "pending", label: "Pendentes" },
  { value: "in_progress", label: "Andamento" }, { value: "completed", label: "Concluídas" },
];

// Os horários vindos da RPC são timestamps; filtrar pela data local evita
// diferenças de um dia em agendamentos próximos à meia-noite.
const scheduledDateKey = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const osNumberCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function TechnicianOrdersTable({
  orders, loading, onOpen,
}: {
  orders: Row[];
  loading: boolean;
  onOpen: (item: TechnicianTask) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("");
  const [dateOpen, setDateOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo(() => {
    const matching = orders.filter(services => {
      const normalized = search.trim().toLocaleLowerCase("pt-BR");
      if (normalized && ![
        String(services[0].os_number), services[0].customer_name, services[0].equipment,
        ...services.map(service => service.title),
      ].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(normalized))) return false;
      if (filter === "completed" && !services.every(service => service.status === "completed")) return false;
      if (filter !== "all" && filter !== "completed" && !services.some(service => service.status === filter)) return false;
      if (dateFrom || dateTo) {
        // É a data do agendamento da OS, não a data de início do serviço.
        const scheduled = scheduledDateKey(services[0].scheduled_at);
        if (!scheduled || (dateFrom && scheduled < dateFrom) || (dateTo && scheduled > dateTo)) return false;
      }
      return true;
    });
    if (sort) matching.sort((a, b) =>
      osNumberCollator.compare(String(a[0].os_number), String(b[0].os_number)) * (sort === "asc" ? 1 : -1));
    return matching;
  }, [orders, search, filter, sort, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setPage(1), [search, filter, sort, dateFrom, dateTo]);

  const sortLabel = sort === "asc" ? "OS crescente" : sort === "desc" ? "OS decrescente" : "Ordenação padrão";
  const SortIcon = sort === "asc" ? ArrowUpNarrowWide : sort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;
  const invalidPeriod = Boolean(draftFrom && draftTo && draftFrom > draftTo);
  const hasDateFilter = Boolean(dateFrom || dateTo);
  const dateFilterLabel = hasDateFilter ? `Agendamento: ${dateFrom || "início"} até ${dateTo || "hoje"}` : "Filtrar por data do agendamento";
  const onDateOpenChange = (open: boolean) => {
    if (open) { setDraftFrom(dateFrom); setDraftTo(dateTo); }
    setDateOpen(open);
  };
  const applyDates = () => {
    if (invalidPeriod) return;
    setDateFrom(draftFrom);
    setDateTo(draftTo);
    setDateOpen(false);
  };

  const progressBadges = (services: Row) => {
    const pending = services.filter(service => service.status === "pending").length;
    const underway = services.filter(service => service.status === "in_progress").length;
    const finished = services.filter(service => service.status === "completed").length;
    return <div className="flex flex-wrap items-center gap-1.5">
      {pending > 0 && <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">{pending} pendente{pending > 1 ? "s" : ""}</span>}
      {underway > 0 && <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-300">{underway} em andamento</span>}
      {!pending && !underway && finished > 0 && <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{finished} concluído{finished > 1 ? "s" : ""}</span>}
    </div>;
  };

  return <div className="min-w-0 space-y-4">
    <AdminSearchPanel title="Minhas ordens de serviço">
      <div className="space-y-3">
        <div className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="technician-order-search" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Buscar OS, cliente ou serviço
            </label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input id="technician-order-search" value={search} onChange={event => setSearch(event.target.value)}
                aria-label="Buscar minhas ordens de serviço" placeholder="Buscar OS, cliente ou serviço"
                className={INPUT + " h-[42px] pl-9 text-sm"} />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" title={sortLabel} aria-label={`Ordenação atual: ${sortLabel}`}
                className={"inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 " +
                  (sort ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground")}>
                <SortIcon size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[195px]">
              {([["", "Ordenação padrão", ArrowUpDown], ["asc", "OS crescente", ArrowUpNarrowWide], ["desc", "OS decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) =>
                <DropdownMenuItem key={value || "default"} onSelect={() => setSort(value)}
                  className={sort === value ? "bg-primary/10 font-bold text-primary" : ""}>
                  <Icon size={15} /><span>{label}</span>{sort === value && <Check size={15} className="ml-auto text-primary" />}
                </DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover open={dateOpen} onOpenChange={onDateOpenChange}>
            <PopoverTrigger asChild>
              <button type="button" aria-label={dateFilterLabel} title={dateFilterLabel}
                className={"inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 " +
                  (hasDateFilter ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground")}>
                <CalendarDays size={17} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" collisionPadding={8} className="w-[min(20rem,calc(100vw-2rem))] space-y-3 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">Data do agendamento</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-[11px] font-semibold text-muted-foreground">De
                  <input type="date" aria-label="Data inicial do agendamento"
                    value={draftFrom} onChange={event => setDraftFrom(event.target.value)}
                    className={INPUT + " mt-1 h-[42px] min-w-0 px-2 py-1 text-xs"} />
                </label>
                <label className="min-w-0 text-[11px] font-semibold text-muted-foreground">Até
                  <input type="date" aria-label="Data final do agendamento"
                    value={draftTo} onChange={event => setDraftTo(event.target.value)}
                    className={INPUT + " mt-1 h-[42px] min-w-0 px-2 py-1 text-xs"} />
                </label>
              </div>
              {invalidPeriod && <p role="alert" className="text-xs text-destructive">A data final não pode ser anterior à inicial.</p>}
              <div className="flex justify-end gap-2">
                <AdminButton variant="secondary" size="sm" onClick={() => {
                  setDateFrom(""); setDateTo(""); setDraftFrom(""); setDraftTo(""); setDateOpen(false);
                }}>Limpar</AdminButton>
                <AdminButton size="sm" disabled={invalidPeriod} onClick={applyDates}>Filtrar</AdminButton>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar andamento">
            {statuses.map(option => <button key={option.value} type="button"
              aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}
              className={"rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 " +
                (filter === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
              {option.label}
            </button>)}
          </div>
          <span className="text-xs font-semibold text-muted-foreground" role="status">
            {rows.length} OS
          </span>
        </div>
      </div>
    </AdminSearchPanel>
    <AdminCard square className="[&_th]:md:py-2 [&_td]:md:py-2.5">
    {loading ? <LoadingState />
      : !visible.length ? <p className="p-6 text-sm text-muted-foreground">Nenhuma OS encontrada.</p>
      : <>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[880px] text-left">
            <thead><tr>
                <th scope="col" className="px-4 py-3 text-left">OS</th><th scope="col" className="px-4 py-3 text-left">Cliente</th>
                <th scope="col" className="px-4 py-3 text-left">Equipamento</th><th scope="col" className="px-4 py-3 text-left">Serviços atribuídos</th>
                <th scope="col" className="px-4 py-3 text-left">Andamento</th>
              </tr></thead>
            <tbody>
              {visible.map(services => <tr key={services[0].service_order_id} tabIndex={0}
                role="button" aria-label={"Abrir OS " + services[0].os_number}
                onClick={() => onOpen(services[0])}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(services[0]); } }}
                className="cursor-pointer transition-colors hover:bg-muted/45 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                <td className="px-4 py-3 font-bold text-foreground">{services[0].os_number}</td>
                <td className="px-4 py-3 text-foreground">{services[0].customer_name || "—"}</td>
                <td className="px-4 py-3 text-foreground">{services[0].equipment || "—"}</td>
                <td className="max-w-xs px-4 py-3 text-muted-foreground">{services.map(service => service.title).join(" · ")}</td>
                <td className="px-4 py-3">{progressBadges(services)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border md:hidden">
          {visible.map(services => <button key={services[0].service_order_id} type="button"
            onClick={() => onOpen(services[0])}
            className="grid w-full grid-cols-2 gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/45 active:bg-muted/65">
            <div><p className="text-[10px] font-bold uppercase text-muted-foreground">OS</p><p className="text-sm font-bold">{services[0].os_number}</p></div>
            <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Cliente</p><p className="break-words text-sm">{services[0].customer_name || "—"}</p></div>
            <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Equipamento</p><p className="break-words text-sm">{services[0].equipment || "—"}</p></div>
            <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Serviços atribuídos</p><p className="break-words text-sm">{services.map(service => service.title).join(", ")}</p></div>
            <div className="col-span-2"><p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Andamento</p>{progressBadges(services)}</div>
          </button>)}
        </div>
      </>}
    <PaginationBar page={currentPage} pageSize={pageSize} totalItems={rows.length}
      onPageChange={setPage} onPageSizeChange={next => { setPageSize(next); setPage(1); }} />
    </AdminCard>
  </div>;
}
