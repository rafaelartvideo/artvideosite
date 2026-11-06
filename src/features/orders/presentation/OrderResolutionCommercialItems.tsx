import { useQuery } from "@tanstack/react-query";
import { Section, AdminSectionEmpty } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { listOrderCommercialItems } from "../infrastructure/order-commercial-items.repository";
import { listOrderServiceTasks } from "../infrastructure/order-service-tasks.repository";

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

/** Visão apenas de leitura, com os mesmos cards do orçamento, na tela Solucionar OS. */
export function OrderResolutionCommercialItems({ organizationId, orderId }: { organizationId: string; orderId: string }) {
  const enabled = Boolean(organizationId && orderId);
  const itemsQuery = useQuery({
    queryKey: ["orders", "resolution-commercial-items", organizationId, orderId],
    enabled,
    queryFn: async () => (await listOrderCommercialItems(orderId)).filter(item => item.organization_id === organizationId),
    staleTime: 30_000,
  });
  const tasksQuery = useQuery({
    queryKey: ["orders", "resolution-service-tasks", organizationId, orderId],
    enabled,
    queryFn: () => listOrderServiceTasks(orderId),
    staleTime: 30_000,
  });
  const items = itemsQuery.data || [];
  const tasks = new Map((tasksQuery.data || []).map(task => [task.item_id, task]));
  return <Section title={<span className="inline-flex items-center gap-2">Produtos e serviços
    <span className="inline-flex min-w-6 items-center justify-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{items.length}</span>
  </span>} flush>
    {itemsQuery.isLoading
      ? <LoadingState text="Carregando produtos e serviços da OS..." />
      : itemsQuery.error
        ? <p role="alert" className="p-4 text-sm text-destructive">Não foi possível carregar os itens: {systemErrorMessage(itemsQuery.error)}</p>
        : items.length === 0
          ? <AdminSectionEmpty>Nenhum produto ou serviço vinculado a esta OS.</AdminSectionEmpty>
          : <div className="grid min-w-0 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 xl:grid-cols-2">
            {items.map(item => {
              const task = tasks.get(item.id);
              const status = task?.status || "pending";
              const progress = status === "completed" ? 100 : status === "in_progress" ? 55 : 0;
              const label = status === "completed" ? "Finalizado" : status === "in_progress" ? "Em execução"
                : status === "cancelled" ? "Cancelado" : "Aguardando início";
              return <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                <header className="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {item.item_type === "product" ? "Produto" : item.item_type === "custom_service" ? "Serviço Avulso" : "Serviço"}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {item.item_type === "product" ? "Registrado na OS" : label}
                  </span>
                </header>
                <div className="min-w-0 flex-1 space-y-3 p-3.5 sm:p-4">
                  <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
                    <strong className="min-w-0 break-words text-sm font-bold text-foreground">{item.title_snapshot}</strong>
                    <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
                    <strong className="whitespace-nowrap text-sm font-black text-emerald-700 dark:text-emerald-300">{money(item.subtotal)}</strong>
                  </div>
                  <div className="grid min-w-0 grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                    <div className="min-w-0"><span className="block text-[10px] font-semibold uppercase text-muted-foreground">Quantidade</span>
                      <strong className="mt-1 block text-xs tabular-nums text-foreground">{item.quantity}</strong></div>
                    <div className="min-w-0"><span className="block text-[10px] font-semibold uppercase text-muted-foreground">Preço unitário</span>
                      <strong className="mt-1 block text-xs tabular-nums text-foreground">{money(item.unit_price)}</strong></div>
                    <div className="min-w-0"><span className="block text-[10px] font-semibold uppercase text-muted-foreground">Custo adicional</span>
                      <strong className="mt-1 block text-xs tabular-nums text-foreground">{money(item.additional_cost)}</strong></div>
                  </div>
                  {item.description_snapshot && <div className="border-t border-border/60 pt-3">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Descrição</span>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">{item.description_snapshot}</p>
                  </div>}
                </div>
                <footer className="border-t border-border bg-muted/20 px-3.5 py-3 sm:px-4">
                  {item.item_type === "product"
                    ? <p className="text-[11px] font-semibold text-muted-foreground">Produto registrado na OS</p>
                    : <div className="space-y-2">
                        <div className="flex justify-between gap-2 text-[11px] font-semibold text-muted-foreground"><span>Progresso</span><span>{label}</span></div>
                        <div role="progressbar" aria-label={"Progresso de " + item.title_snapshot}
                          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
                          className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: progress + "%" }}/>
                        </div>
                      </div>}
                </footer>
              </article>;
            })}
          </div>}
  </Section>;
}
