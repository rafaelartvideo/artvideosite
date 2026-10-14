import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard, Section } from "@/shared/ui/admin/AdminLayout";
import type { TechnicianTask } from "../infrastructure/technician-tasks.repository";

type Row = TechnicianTask[];
type Filter = "all" | "pending" | "in_progress" | "completed";

const statuses: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas" }, { value: "pending", label: "Pendentes" },
  { value: "in_progress", label: "Andamento" }, { value: "completed", label: "Concluídas" },
];

export function TechnicianOrdersTable({
  orders, loading, onOpen,
}: {
  orders: Row[];
  loading: boolean;
  onOpen: (item: TechnicianTask) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo(() => orders.filter(services => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    if (normalized && ![
      String(services[0].os_number),services[0].customer_name,services[0].equipment,
      ...services.map(service => service.title),
    ].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(normalized))) return false;
    if (filter === "all") return true;
    if (filter === "completed") return services.every(service => service.status === "completed");
    return services.some(service => service.status === filter);
  }), [orders, search, filter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setPage(1), [search, filter]);

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
    <Section title={<span className="inline-flex items-center gap-2">Minhas ordens de serviço
      <span className="inline-flex items-center border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{rows.length}</span>
    </span>}>
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={event => setSearch(event.target.value)}
            aria-label="Buscar minhas ordens de serviço" placeholder="Buscar OS, cliente ou serviço"
            className="min-h-10 w-full border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar andamento">
          {statuses.map(option => <button key={option.value} type="button"
            aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}
            className={"border px-2.5 py-2 text-xs font-semibold transition-colors " +
              (filter === option.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
            {option.label}
          </button>)}
        </div>
      </div>
    </Section>
    <AdminCard square className="[&_th]:md:py-2 [&_td]:md:py-2.5">
    {loading ? <LoadingState />
      : !visible.length ? <p className="p-6 text-sm text-muted-foreground">Nenhuma OS encontrada.</p>
      : <>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[880px]">
            <thead><tr>
                <th className="px-4 py-3">OS</th><th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Equipamento</th><th className="px-4 py-3">Serviços atribuídos</th>
                <th className="px-4 py-3">Andamento</th>
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
