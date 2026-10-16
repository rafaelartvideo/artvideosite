import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowRight, CalendarClock, CheckCircle2, ListTodo } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {
  loadWorkEmployees, loadWorkItems, subscribeWorkItems,
  type WorkEmployee, type WorkItem,
} from "../infrastructure/work-items.repository";
import { WorkItemDialog } from "./WorkItemDialog";

const active = (item: WorkItem) => item.status !== "completed" && item.status !== "cancelled";
const rank = (item: WorkItem) => {
  const overdue = item.due_at && new Date(item.due_at).getTime() < Date.now();
  if (overdue) return 5;
  if (item.priority === "urgent") return 4;
  if (item.priority === "high") return 3;
  if (item.due_at && new Date(item.due_at).getTime() < Date.now() + 86400000) return 2;
  return 1;
};
const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Sem prazo";
const priorityText: Record<WorkItem["priority"], string> = {
  low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente",
};

export function useWorkItemsHeader(organizationId?: string | null, userId?: string | null) {
  const { employee, hasPermission, hasModule, activeOrganization } = useAuth();
  const canView = Boolean(organizationId && userId && hasPermission("work_items.view")
    && (activeOrganization?.is_platform_operator || (hasPermission("operation.view") && hasModule("work_items"))));
  const canEdit = hasPermission("work_items.edit");
  const queryClient = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const query = useQuery({
    queryKey: ["work-items", organizationId || ""],
    enabled: canView,
    queryFn: () => loadWorkItems(organizationId!),
    staleTime: 60_000,
  });
  const employeeQuery = useQuery({
    queryKey: ["work-item-employees", organizationId || ""],
    enabled: canView,
    queryFn: () => loadWorkEmployees(organizationId!),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    setPanelOpen(false);
    setSelected(null);
  }, [organizationId]);
  useEffect(() => {
    if (!canView || !organizationId) return;
    // Uma assinatura para o header e todos os modos da lista, com invalidações
    // agrupadas para evitar GET duplicado do gatilho de histórico/checklist.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const stop = subscribeWorkItems(organizationId, () => {
      if (pending !== null) return;
      pending = setTimeout(() => {
        pending = null;
        void queryClient.invalidateQueries({ queryKey: ["work-items", organizationId] });
        void queryClient.invalidateQueries({ queryKey: ["work-item-details", organizationId], refetchType: "active" });
      }, 200);
    });
    return () => {
      if (pending !== null) clearTimeout(pending);
      stop();
    };
  }, [canView, organizationId, queryClient]);

  const employees = employeeQuery.data || [];
  const personalEmployeeIds = employees.filter(person => person.profile_id === userId).map(person => person.id);
  if (employee?.id && !personalEmployeeIds.includes(employee.id)) personalEmployeeIds.push(employee.id);

  const mine = useMemo(() => (query.data || []).filter(item =>
    active(item) && (item.created_by === userId || item.assigned_employee_ids?.some(id => personalEmployeeIds.includes(id)))
  ).sort((a, b) => rank(b) - rank(a)
    || (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity)
    || b.created_at.localeCompare(a.created_at)),
    [query.data, userId, personalEmployeeIds.join(",")]);

  const openDetails = (item: WorkItem) => {
    setPanelOpen(false);
    setSelected(item);
  };
  const closeDetails = () => {
    setSelected(null);
    setPanelOpen(true);
  };
  const onSaved = (saved: WorkItem) => {
    queryClient.setQueryData<WorkItem[]>(["work-items", organizationId || ""], records =>
      [saved, ...(records || []).filter(item => item.id !== saved.id)]);
    void queryClient.invalidateQueries({ queryKey: ["work-items", organizationId || ""] });
    closeDetails();
  };

  return {
    canView, canEdit, mine, count: mine.length,
    loading: query.isPending, error: query.isError,
    panelOpen, setPanelOpen, selected, employees, organizationId: organizationId || "",
    openDetails, closeDetails, onSaved,
  };
}

export type WorkItemsHeaderController = ReturnType<typeof useWorkItemsHeader>;

export function WorkItemsHeaderBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="absolute -right-1 -top-1 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-card bg-primary px-0.5 text-[9px] font-black leading-none text-white">
    {count > 99 ? "99+" : count}
  </span>;
}

export function WorkItemsHeaderDialog({ controller }: { controller: WorkItemsHeaderController }) {
  const navigate = useNavigate();
  const goToModule = () => {
    controller.setPanelOpen(false);
    navigate("/admin/work-items");
  };
  if (!controller.canView) return null;
  return <>
    <AdminDialog open={controller.panelOpen} onClose={() => controller.setPanelOpen(false)}
      title="Minhas atividades" description="Tarefas e compromissos em aberto, sempre à mão."
      className="max-w-xl" footer={<div className="flex w-full justify-end gap-2">
        <BtnSecondary onClick={() => controller.setPanelOpen(false)}>Fechar</BtnSecondary>
        <BtnPrimary onClick={goToModule}>Ver todas <ArrowRight size={15} /></BtnPrimary>
      </div>}>
      <div className="max-h-[60dvh] min-h-32 space-y-2 overflow-y-auto overscroll-contain py-1">
        {controller.loading ? <LoadingState text="Carregando atividades..." />
          : controller.error ? <p role="alert" className="p-4 text-sm text-destructive">Não foi possível carregar suas atividades.</p>
          : controller.mine.length === 0 ?
            <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center">
              <CheckCircle2 size={26} className="text-emerald-600" />
              <p className="text-sm font-semibold">Nenhuma atividade em aberto.</p>
              <p className="text-xs text-muted-foreground">Novas tarefas atribuídas aparecerão aqui.</p>
            </div> : controller.mine.map(item => {
              const overdue = Boolean(item.due_at && new Date(item.due_at).getTime() < Date.now());
              return <button key={item.id} type="button" onClick={() => controller.openDetails(item)}
                className="flex w-full min-w-0 items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/30 hover:bg-muted/40">
                <ListTodo size={17} className="mt-0.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate text-sm font-bold text-foreground">{item.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {item.kind === "commitment" ? "Compromisso" : "Tarefa"} · {priorityText[item.priority]} · {item.status === "in_progress" ? "Em andamento" : item.status === "waiting" ? "Aguardando" : "Pendente"}
                  </span>
                  <span className={overdue ? "flex items-center gap-1 text-[11px] font-semibold text-red-600" : "flex items-center gap-1 text-[11px] text-muted-foreground"}>
                    <CalendarClock size={12} /> {overdue ? "Atrasada · " : ""}{dateText(item.due_at)}
                  </span>
                </span>
                <ArrowRight size={15} className="mt-1 shrink-0 text-muted-foreground" />
              </button>;
            })}
      </div>
    </AdminDialog>
    {controller.selected && <WorkItemDialog
      key={controller.selected.id} open item={controller.selected}
      organizationId={controller.organizationId}
      employees={controller.employees}
      canEdit={controller.canEdit}
      onClose={controller.closeDetails}
      onSaved={controller.onSaved} />}
  </>;
}
