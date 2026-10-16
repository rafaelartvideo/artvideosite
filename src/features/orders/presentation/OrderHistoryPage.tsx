import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { FilterX, Plus, SortAsc, SortDesc } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminCard, AdminDialog, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { WorkItemDialog } from "@/features/work-items/presentation/WorkItemDialog";
import {
  loadWorkEmployees, loadWorkItemsForOrder, subscribeWorkItems,
  type WorkItem, type WorkKind,
} from "@/features/work-items/infrastructure/work-items.repository";
import type { useOrderHistory } from "../application/useOrderHistory";

export function OrderHistoryPage({
  open,
  order,
  history,
  canCreate,
  formatDate,
  onClose,
  breadcrumb = "Ordens de Serviço",
}: {
  open: boolean;
  order: any;
  history: Pick<ReturnType<typeof useOrderHistory>, "userFilter" | "setUserFilter" | "authorOptions" | "dateFilter" | "setDateFilter" | "sort" | "setSort" | "clearFilters" | "loading" | "entries" | "modalOpen" | "setModalOpen" | "text" | "setText" | "saving" | "submit">;
  canCreate: boolean;
  formatDate: (value?: string | null, time?: boolean) => string;
  onClose: () => void;
  breadcrumb?: string;
}) {
  const { activeOrganizationId, employee, hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const [workDialogOpen, setWorkDialogOpen] = useState(false);
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItem | null>(null);
  const [newKind, setNewKind] = useState<WorkKind>("task");
  const organizationId = String(order?.organization_id || "");
  const orderId = String(order?.id || "");
  const sameOrganization = Boolean(orderId && organizationId && organizationId === activeOrganizationId);
  const canCreateWorkItem = sameOrganization && Boolean(order?.customer_id) && hasPermission("work_items.create");

  const linkedWorkQuery = useQuery({
    queryKey: ["work-items", "order", organizationId, orderId],
    enabled: open && sameOrganization,
    queryFn: () => loadWorkItemsForOrder(organizationId, orderId),
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const employeeQuery = useQuery({
    queryKey: ["work-item-employees", organizationId],
    enabled: open && workDialogOpen && sameOrganization,
    queryFn: () => loadWorkEmployees(organizationId),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!open || !sameOrganization) return;
    return subscribeWorkItems(organizationId, () => {
      void queryClient.invalidateQueries({ queryKey: ["work-items", "order", organizationId, orderId] });
    });
  }, [open, sameOrganization, organizationId, orderId, queryClient]);

  const linkedItems = linkedWorkQuery.data || [];
  const employees = employeeQuery.data || [];
  const selected = selectedWorkItem ? linkedItems.find(item => item.id === selectedWorkItem.id) || selectedWorkItem : null;
  const myEmployeeIds = employees.filter(person => person.profile_id === user?.id).map(person => person.id);
  if (employee?.id && !myEmployeeIds.includes(employee.id)) myEmployeeIds.push(employee.id);
  const canManage = hasPermission("work_items.manage");
  const canPerform = Boolean(selected && (
    (canManage && hasPermission("work_items.execute_team")) ||
    selected.assigned_employee_ids.some(id => myEmployeeIds.includes(id))
  ));
  const canEditWorkItem = Boolean(selected && hasPermission("work_items.edit") && (
    canManage || selected.created_by === user?.id ||
    selected.assigned_employee_ids.some(id => myEmployeeIds.includes(id))
  ));
  const linkedOrder = sameOrganization && order?.customer_id
    ? { id: orderId, os_number: order.os_number, customer_id: order.customer_id as string }
    : undefined;
  const authorOptions = useMemo(() => {
    const authors = new Map(history.authorOptions.map(person => [person.id, person.name]));
    for (const item of linkedItems) {
      if (item.created_by && !authors.has(item.created_by)) authors.set(item.created_by, "Equipe");
    }
    return Array.from(authors, ([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [history.authorOptions, linkedItems]);
  const entries = useMemo(() => {
    const activityEntries = linkedItems.map(item => ({
      id: "work-" + item.id,
      type: "work" as const,
      authorId: item.created_by,
      author: authorOptions.find(person => person.id === item.created_by)?.name || "Equipe",
      title: item.kind === "commitment" ? "Compromisso" : "Tarefa",
      content: [item.title, item.description].filter(Boolean).join("\n"),
      createdAt: item.created_at,
      workItem: item,
    }));
    return [...history.entries, ...activityEntries.filter(item =>
      (!history.userFilter || (history.userFilter === "system" ? !item.authorId : item.authorId === history.userFilter)) &&
      (!history.dateFilter || item.createdAt.slice(0, 10) === history.dateFilter)
    )].sort((left, right) =>
      (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * (history.sort === "asc" ? 1 : -1)
    );
  }, [history.entries, authorOptions, history.userFilter, history.dateFilter, history.sort, linkedItems]);
  const createActivity = (kind: WorkKind) => {
    setSelectedWorkItem(null);
    setNewKind(kind);
    setWorkDialogOpen(true);
  };
  const openActivity = (item: WorkItem) => {
    setSelectedWorkItem(item);
    setNewKind(item.kind);
    setWorkDialogOpen(true);
  };
  const closeActivity = () => {
    setWorkDialogOpen(false);
    setSelectedWorkItem(null);
  };

  if (!open) return null;
  return <>
    <AdminPage open onClose={onClose} breadcrumb={`${breadcrumb} > ${order.os_number || "OS"} > Histórico`} title="Histórico da OS" subtitle="Linha do tempo de alterações e registros da equipe" maxW="max-w-2xl">
      <div className="space-y-4 p-4 sm:p-5">
        <AdminCard className="bg-muted/35 p-3 shadow-none">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
            <div className="min-w-0 w-full">
              <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Usuário</label>
              <AdminSelect
                value={history.userFilter}
                onValueChange={history.setUserFilter}
                ariaLabel="Usuário"
                className="w-full min-w-0 text-xs font-medium normal-case"
                options={[
                  { value: "", label: "Todos os usuários" },
                  ...authorOptions.map(author => ({ value: author.id, label: author.name })),
                  { value: "system", label: "Sistema" },
                ]}
              />
            </div>

            <label className="min-w-0 w-full text-[10px] font-bold uppercase text-muted-foreground">
              Data
              <input
                type="date"
                value={history.dateFilter}
                onChange={(event) => history.setDateFilter(event.target.value)}
                className={cn(INPUT, "mt-1 w-full min-w-0 text-xs font-medium normal-case")}
              />
            </label>

            <div className="flex min-w-0 items-end">
              <button
                type="button"
                onClick={() => history.setSort(history.sort === "desc" ? "asc" : "desc")}
                aria-label={history.sort === "desc" ? "Ordenar mais antigos primeiro" : "Ordenar mais recentes primeiro"}
                title={history.sort === "desc" ? "Mais recentes primeiro" : "Mais antigos primeiro"}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {history.sort === "desc" ? <SortDesc className="h-[18px] w-[18px]" /> : <SortAsc className="h-[18px] w-[18px]" />}
              </button>
            </div>

            {(history.userFilter || history.dateFilter) && (
              <div className="flex min-w-0 items-end">
                <button
                  type="button"
                  onClick={history.clearFilters}
                  aria-label="Limpar filtros"
                  title="Limpar filtros"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/70 dark:hover:bg-red-950/30"
                >
                  <FilterX className="h-[18px] w-[18px]" />
                </button>
              </div>
            )}
          </div>
        </AdminCard>
        {(history.loading || (sameOrganization && linkedWorkQuery.isLoading))
          ? <LoadingState text="Carregando histórico..." />
          : entries.length === 0
            ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</div>
            : <div className="space-y-3">{entries.map(item => {
              const card = <AdminCard className={cn(
                "min-w-0 p-4 shadow-none",
                item.type === "work" ? "border-primary/20 bg-primary/5" :
                  item.type === "note" ? "border-primary/15" : "bg-muted/35",
              )}>
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-foreground">{item.author}</p>
                    <p className="mt-0.5 break-words text-[10px] font-bold uppercase text-muted-foreground">
                      {item.title}{item.type === "work" ? " · " + ({
                        pending: "Pendente", in_progress: "Em andamento", waiting: "Aguardando",
                        completed: "Concluído", cancelled: "Cancelado",
                      }[item.workItem.status]) : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(item.createdAt, true)}</span>
                </div>
                <p className="mt-3 break-words whitespace-pre-line text-sm leading-relaxed text-foreground">{item.content}</p>
                {item.type === "work" && <>
                  {item.workItem.due_at && <p className="mt-2 text-xs text-muted-foreground">
                    Prazo: {formatDate(item.workItem.due_at, true)}
                  </p>}
                  <p className="mt-2 text-xs font-semibold text-primary">Ver detalhes da atividade</p>
                </>}
              </AdminCard>;
              return item.type === "work"
                ? <button key={item.id} type="button" onClick={() => openActivity(item.workItem)}
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {card}
                  </button>
                : <div key={item.id}>{card}</div>;
            })}</div>}
        {linkedWorkQuery.isError && sameOrganization && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive">
          Não foi possível carregar as atividades vinculadas.
          <button type="button" className="ml-2 font-bold underline" onClick={() => void linkedWorkQuery.refetch()}>Tentar novamente</button>
        </div>}
      </div>
      <AdminStickyToolbar className="gap-2 px-3 py-3 sm:justify-between sm:px-5 sm:py-4">
        <BtnSecondary onClick={onClose} className="min-w-0 flex-1 sm:flex-none">Voltar para a OS</BtnSecondary>
        {(canCreate || canCreateWorkItem) && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BtnPrimary className="h-11 w-11 min-w-0 flex-none !px-0 sm:h-auto sm:w-auto sm:!px-4">
              <Plus className="h-5 w-5 sm:hidden" /><span className="sr-only sm:not-sr-only">Novo</span>
            </BtnPrimary>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {canCreate && <DropdownMenuItem onSelect={() => { history.setText(""); history.setModalOpen(true); }}>
              Registro no histórico
            </DropdownMenuItem>}
            {canCreateWorkItem && <>
              <DropdownMenuItem onSelect={() => createActivity("commitment")}>Compromisso</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => createActivity("task")}>Tarefa</DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>}
      </AdminStickyToolbar>
    </AdminPage>
    {history.modalOpen && canCreate && <AdminDialog open={history.modalOpen} onClose={() => { if (!history.saving) history.setModalOpen(false); }} title="Novo registro" description="Adicione uma observação permanente ao histórico" className="max-w-lg" footer={<div className="flex w-full gap-2 sm:justify-end sm:gap-3"><BtnSecondary onClick={() => history.setModalOpen(false)} className="min-w-0 flex-1 sm:flex-none">Cancelar</BtnSecondary><BtnPrimary onClick={history.submit} disabled={!history.text.trim() || history.saving} className="min-w-0 flex-1 sm:flex-none">{history.saving ? "Registrando..." : "Registrar no histórico"}</BtnPrimary></div>}>
      <textarea value={history.text} onChange={(event) => history.setText(event.target.value)} maxLength={2000} rows={6} placeholder="Escreva o que precisa ficar registrado nesta OS..." className={cn(INPUT, "h-auto min-w-0 resize-y text-sm")} />
      <div className="mt-2 flex justify-between gap-3 text-[10px] text-[#5a6a82]"><span>O registro não poderá ser editado ou excluído.</span><span className="shrink-0">{history.text.length}/2000</span></div>
    </AdminDialog>}
    {sameOrganization && <WorkItemDialog
      key={selected?.id || (workDialogOpen ? "new-" + newKind : "closed")}
      open={workDialogOpen}
      item={selected}
      initialKind={newKind}
      linkedOrder={linkedOrder}
      organizationId={organizationId}
      employees={employees}
      canEdit={selected ? canEditWorkItem : canCreateWorkItem}
      canPerform={canPerform}
      onClose={closeActivity}
      onSaved={saved => {
        queryClient.setQueryData<WorkItem[]>(["work-items", "order", organizationId, orderId], old => {
          const current = old || [];
          return saved.service_order_id === orderId
            ? [saved, ...current.filter(item => item.id !== saved.id)]
            : current.filter(item => item.id !== saved.id);
        });
        void queryClient.invalidateQueries({ queryKey: ["work-items", "order", organizationId, orderId] });
        void queryClient.invalidateQueries({ queryKey: ["work-items", organizationId] });
        closeActivity();
      }}
    />}
  </>;
}
