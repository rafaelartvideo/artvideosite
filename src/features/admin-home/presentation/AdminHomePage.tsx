import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Bell,
  Building2,
  CalendarDays,
  CheckCheck,
  Clock3,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Landmark,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  Package,
  Pin,
  ShoppingCart,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { cn } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminCardContent } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  acknowledgeHomeAnnouncement,
  loadHomeAnnouncements,
  subscribeToAdminHomeRefresh,
  type HomeAnnouncement,
  type HomeAnnouncementPriority,
} from "@/features/home/infrastructure/home.repository";
import { loadAdminNotifications } from "@/features/notifications/infrastructure/notifications.repository";
import { adminNotificationsKey } from "@/features/notifications/application/useAdminNotifications";
import { prefetchAdminModule } from "@/features/admin-shell/application/admin-prefetch";
import { notificationTime } from "@/features/notifications/presentation/AdminNotifications";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  loadWorkItems,
  subscribeWorkItems,
  type WorkItem,
} from "@/features/work-items/infrastructure/work-items.repository";

type QuickShortcut = {
  key: string;
  tab: AdminTab;
  label: string;
  description: string;
  icon: LucideIcon;
};

const QUICK_SHORTCUTS: QuickShortcut[] = [
  { key: "F1", tab: "dashboard", label: "Dashboard", description: "Indicadores e desempenho da operação.", icon: LayoutDashboard },
  { key: "F2", tab: "orders", label: "Ordens de Serviço", description: "Acesse e acompanhe as ordens de serviço.", icon: ClipboardList },
  { key: "F3", tab: "customers", label: "Cadastros", description: "Clientes, contatos e demais cadastros.", icon: Users },
  { key: "F4", tab: "agenda", label: "Agenda", description: "Compromissos, visitas e retornos.", icon: CalendarDays },
  { key: "F5", tab: "inventory", label: "Estoque", description: "Produtos, saldos e movimentações.", icon: Package },
  { key: "F6", tab: "pdv", label: "PDV", description: "Venda rápida e operação de caixa.", icon: ShoppingCart },
  { key: "F7", tab: "finance", label: "Financeiro", description: "Contas, recebimentos e pagamentos.", icon: Landmark },
  { key: "F8", tab: "quotes", label: "Orçamentos", description: "Solicitações e propostas comerciais.", icon: FileText },
  { key: "F9", tab: "fieldTracking", label: "Mapa de Campo", description: "Acompanhe equipes e dispositivos em campo.", icon: MapPinned },
  { key: "F10", tab: "partnerCompanies", label: "Empresas Parceiras", description: "Gerencie as empresas conectadas à plataforma.", icon: Building2 },
  { key: "F11", tab: "announcements", label: "Avisos", description: "Publique comunicados para as empresas.", icon: Megaphone },
  { key: "F12", tab: "tools", label: "Ferramentas", description: "Abra ferramentas e integrações do sistema.", icon: Wrench },
];

const PRIORITY_UI: Record<HomeAnnouncementPriority, {
  label: string;
  className: string;
  dot: string;
}> = {
  info: { label: "Informativo", className: "border-blue-200 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/20", dot: "bg-blue-500" },
  attention: { label: "Atenção", className: "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20", dot: "bg-amber-500" },
  important: { label: "Importante", className: "border-orange-200 bg-orange-50/70 dark:border-orange-900/60 dark:bg-orange-950/20", dot: "bg-orange-500" },
  critical: { label: "Crítico", className: "border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20", dot: "bg-red-500" },
};

type WorkSummary = { open: number; progress: number; overdue: number; completed: number };

function summarizeWorkItems(items: WorkItem[], now: number): WorkSummary {
  const summary: WorkSummary = { open: 0, progress: 0, overdue: 0, completed: 0 };
  // Both tasks and commitments share the same four exclusive classifications.
  // A deadline already passed takes precedence over pending/in-progress; a
  // completed item is always completed, and a cancelled one is not counted.
  for (const item of items) {
    if (item.status === "cancelled") continue;
    if (item.status === "completed") {
      summary.completed++;
    } else if (item.due_at && new Date(item.due_at).getTime() < now) {
      summary.overdue++;
    } else if (item.status === "in_progress") {
      summary.progress++;
    } else if (item.status === "pending" || item.status === "waiting") {
      summary.open++;
    }
  }
  return summary;
}

const WORK_STATUS_CARDS = [
  { key: "open", label: "Em aberto", icon: ClipboardCheck, tone: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  { key: "progress", label: "Em andamento", icon: TrendingUp, tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  { key: "overdue", label: "Atrasadas", icon: Clock3, tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" },
  { key: "completed", label: "Concluídas", icon: CheckCheck, tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
] as const;

function WorkHomeCounters({
  title, summary, pending, error, onOpen,
}: {
  title: string;
  summary: WorkSummary;
  pending: boolean;
  error: boolean;
  onOpen: () => void;
}) {
  return <div className="min-w-0 space-y-2">
    <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {WORK_STATUS_CARDS.map(card => {
        const Icon = card.icon;
        return <button
          key={card.key}
          type="button"
          onClick={onOpen}
          title={`${title}: ${card.label}. Abrir Compromissos e Tarefas`}
          aria-label={`${title}, ${card.label}: ${error || pending ? "carregando" : summary[card.key]}. Abrir módulo`}
          className={cn(
            "flex h-[82px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-all hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            card.tone,
          )}
        >
          <span className="flex min-w-0 items-center justify-center gap-1 text-[10px] font-bold leading-tight">
            <Icon size={13} className="shrink-0" aria-hidden />
            {card.label}
          </span>
          <strong className="text-2xl font-black tabular-nums leading-none">{pending || error ? "—" : summary[card.key]}</strong>
        </button>;
      })}
    </div>
  </div>;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, [contenteditable='true']");
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatHomeDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

function AnnouncementCard({
  announcement,
  acknowledging,
  onAcknowledge,
}: {
  announcement: HomeAnnouncement;
  acknowledging: boolean;
  onAcknowledge: (announcement: HomeAnnouncement) => void;
}) {
  const tone = PRIORITY_UI[announcement.priority] || PRIORITY_UI.info;
  const acknowledged = Boolean(announcement.acknowledged_at);

  return <div className={cn("rounded-xl border p-4", tone.className)}>
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
            {tone.label}
          </span>
          {announcement.is_pinned && <span
            role="img"
            aria-label="Aviso fixado"
            title="Aviso fixado"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-foreground"
          ><Pin size={11} className="shrink-0" /></span>}
          {announcement.requires_acknowledgment && <span className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-black uppercase",
            acknowledged ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-card text-primary",
          )}>{acknowledged ? "Confirmado" : "Confirmação necessária"}</span>}
        </div>
        <h3 className="mt-2 text-sm font-black text-foreground">{announcement.title}</h3>
        <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">{announcement.message}</p>
      </div>
      <Megaphone size={18} className="shrink-0 text-primary" />
    </div>
    {(announcement.link_url || (announcement.requires_acknowledgment && !acknowledged)) && <div className="mt-4 flex flex-wrap items-center gap-2">
      {announcement.requires_acknowledgment && !acknowledged && <AdminButton size="sm" loading={acknowledging} onClick={() => onAcknowledge(announcement)}>Li e estou ciente</AdminButton>}
      {announcement.link_url && <AdminButton size="sm" variant="secondary" onClick={() => window.open(announcement.link_url!, "_blank", "noopener,noreferrer")}>Abrir informação</AdminButton>}
    </div>}
  </div>;
}

export function AdminHomePage({
  onNavigate,
  canAccessTab,
  isPlatformOperatorOrganization,
}: {
  onNavigate: (tab: AdminTab) => void;
  canAccessTab: (tab: AdminTab) => boolean;
  isPlatformOperatorOrganization: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, activeOrganizationId, organizations } = useAuth();

  const activeOrganization = organizations.find(item => item.organization_id === activeOrganizationId) || null;
  const shortcuts = useMemo(
    () => QUICK_SHORTCUTS
      .filter(item => canAccessTab(item.tab))
      .map(item => ({
        ...item,
        label: isPlatformOperatorOrganization && item.tab === "orders"
          ? "Monitoramento de OS"
          : isPlatformOperatorOrganization && item.tab === "customers"
            ? "Usuários"
            : item.label,
      })),
    [canAccessTab, isPlatformOperatorOrganization],
  );

  const announcementsQuery = useQuery({
    queryKey: ["admin-home", "announcements", activeOrganizationId],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => loadHomeAnnouncements(activeOrganizationId!),
    // Eventos Realtime atualizam os avisos imediatamente. Esta consulta é
    // apenas contingência caso uma mudança não seja recebida.
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const activityQuery = useQuery({
    queryKey: adminNotificationsKey(activeOrganizationId || null, user?.id || null),
    enabled: Boolean(activeOrganizationId && user?.id),
    queryFn: () => loadAdminNotifications(activeOrganizationId!, 50),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const canViewWorkItems = canAccessTab("workItems");
  const workItemsQuery = useQuery({
    // Share the module's cache so task/commitment edits update Home immediately.
    queryKey: ["work-items", activeOrganizationId || ""],
    enabled: Boolean(activeOrganizationId && canViewWorkItems),
    queryFn: () => loadWorkItems(activeOrganizationId!),
    staleTime: 60_000,
  });
  const [summaryNow, setSummaryNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeOrganizationId || !canViewWorkItems) return;
    const interval = window.setInterval(() => setSummaryNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [activeOrganizationId, canViewWorkItems]);
  useEffect(() => {
    if (!activeOrganizationId || !canViewWorkItems) return;
    return subscribeWorkItems(activeOrganizationId, () => {
      void queryClient.invalidateQueries({ queryKey: ["work-items", activeOrganizationId] });
    });
  }, [activeOrganizationId, canViewWorkItems, queryClient]);
  const workSummary = useMemo(
    () => summarizeWorkItems(workItemsQuery.data || [], summaryNow),
    [workItemsQuery.data, summaryNow],
  );

  useEffect(() => {
    if (!activeOrganizationId) return;
    return subscribeToAdminHomeRefresh(kind => {
      if (kind === "all" || kind === "announcements") {
        void queryClient.invalidateQueries({ queryKey: ["admin-home", "announcements", activeOrganizationId] });
      }
      if (kind === "all" || kind === "notifications") {
        void queryClient.invalidateQueries({ queryKey: adminNotificationsKey(activeOrganizationId, user?.id || null) });
      }
    });
  }, [activeOrganizationId, user?.id, queryClient]);

  const acknowledgeMutation = useMutation({
    mutationFn: (announcement: HomeAnnouncement) => acknowledgeHomeAnnouncement(announcement.id, activeOrganizationId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-home", "announcements", activeOrganizationId] });
      notifyAdmin("Leitura confirmada.");
    },
    onError: error => notifyAdmin(systemErrorMessage(error, "Não foi possível confirmar a leitura."), "error"),
  });

  useEffect(() => {
    const byKey = new Map(shortcuts.map(item => [item.key, item]));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const shortcut = byKey.get(event.key);
      if (!shortcut) return;
      event.preventDefault();
      onNavigate(shortcut.tab);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, onNavigate]);

  const announcements = announcementsQuery.data || [];
  const pendingAcknowledgments = announcements.filter(item => item.requires_acknowledgment && !item.acknowledged_at).length;
  const activity = (activityQuery.data?.items || []).slice(0, 6);
  const unreadCount = activityQuery.data?.unreadCount || 0;
  const userName = profile?.full_name || user?.email?.split("@")[0] || "usuário";

  return <div className="min-w-0 space-y-5 pb-3">
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">Home</p>
          <h1 className="mt-1 truncate text-2xl font-black text-foreground">{greeting()}, {userName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{activeOrganization?.organization_name || "Empresa ativa"} · <span className="capitalize">{formatHomeDate()}</span></p>
        </div>
        <div className={cn(
          "grid min-w-0 gap-4",
          canViewWorkItems && "xl:grid-cols-[minmax(120px,150px)_minmax(0,1fr)]",
        )}>
          <div className="flex min-h-[82px] flex-col items-center justify-center rounded-xl border border-border bg-muted/50 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Avisos pendentes</p>
            <strong className="mt-1 block text-2xl font-black tabular-nums text-foreground">{pendingAcknowledgments}</strong>
          </div>
          {canViewWorkItems && <WorkHomeCounters
            title="Tarefas/Compromissos"
            summary={workSummary}
            pending={workItemsQuery.isPending}
            error={workItemsQuery.isError}
            onOpen={() => onNavigate("workItems")}
          />}
        </div>
      </div>
    </section>

    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-foreground">Quadro de avisos</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Comunicados, manutenções e informações da Union World.</p>
        </div>
        {isPlatformOperatorOrganization && canAccessTab("announcements") && <AdminButton size="sm" variant="secondary" onClick={() => onNavigate("announcements")}>Gerenciar avisos</AdminButton>}
      </div>

      {announcementsQuery.isPending ? <LoadingState text="Carregando avisos..." /> : announcementsQuery.isError ? (
        <AdminCard><AdminCardContent><p className="text-sm text-red-600">{systemErrorMessage(announcementsQuery.error, "Não foi possível carregar os avisos.")}</p></AdminCardContent></AdminCard>
      ) : announcements.length === 0 ? (
        <AdminCard><AdminCardContent className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Megaphone size={18} /></span>
          <div><p className="text-sm font-black text-foreground">Nenhum aviso ativo</p><p className="mt-0.5 text-xs text-muted-foreground">Quando a Union publicar um comunicado, ele aparecerá aqui.</p></div>
        </AdminCardContent></AdminCard>
      ) : <div className="grid gap-3 xl:grid-cols-2">
        {announcements.map(announcement => <AnnouncementCard
          key={announcement.id}
          announcement={announcement}
          acknowledging={acknowledgeMutation.isPending && acknowledgeMutation.variables?.id === announcement.id}
          onAcknowledge={item => acknowledgeMutation.mutate(item)}
        />)}
      </div>}
    </section>

    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-black text-foreground">Ações rápidas</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Clique no módulo ou use a tecla indicada. Os atalhos funcionam enquanto você estiver na Home.</p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map(item => {
          const Icon = item.icon;
          return <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.tab)}
            onMouseEnter={() => prefetchAdminModule(item.tab)}
            onFocus={() => prefetchAdminModule(item.tab)}
            className="group relative min-w-0 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/35 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-white"><Icon size={18} /></span>
              <kbd className="rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-black text-foreground">{item.key}</kbd>
            </div>
            <h3 className="mt-3 truncate text-sm font-black text-foreground">{item.label}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
          </button>;
        })}
      </div>
    </section>

    <section className="grid min-w-0 gap-4 xl:grid-cols-2">
      <AdminCard>
        <AdminCardContent>
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-primary" />
            <div><h2 className="text-sm font-black text-foreground">Minhas pendências</h2><p className="mt-0.5 text-xs text-muted-foreground">O que precisa da sua atenção agora.</p></div>
          </div>
          <div className="mt-4 space-y-2">
            {pendingAcknowledgments > 0 && <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-amber-600"><Megaphone size={16} /></span>
              <div className="min-w-0"><strong className="block text-xs text-foreground">{pendingAcknowledgments} {pendingAcknowledgments === 1 ? "aviso aguarda" : "avisos aguardam"} confirmação</strong><span className="mt-0.5 block text-[10px] text-muted-foreground">Confirme a leitura no quadro de avisos acima.</span></div>
            </div>}
            {unreadCount > 0 && <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-3 dark:border-blue-900/60 dark:bg-blue-950/20">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-primary"><Bell size={16} /></span>
              <div className="min-w-0"><strong className="block text-xs text-foreground">{unreadCount} {unreadCount === 1 ? "notificação não lida" : "notificações não lidas"}</strong><span className="mt-0.5 block text-[10px] text-muted-foreground">Veja os eventos recentes no sino de notificações.</span></div>
            </div>}
            {pendingAcknowledgments === 0 && unreadCount === 0 && <div className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-center">
              <p className="text-sm font-black text-foreground">Tudo em dia</p>
              <p className="mt-1 text-xs text-muted-foreground">Nenhuma pendência pessoal identificada agora.</p>
            </div>}
          </div>
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardContent>
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-primary" />
            <div><h2 className="text-sm font-black text-foreground">Atividade recente</h2><p className="mt-0.5 text-xs text-muted-foreground">Últimas movimentações da empresa ativa.</p></div>
          </div>
          <div className="mt-4 divide-y divide-border">
            {activityQuery.isPending ? <LoadingState text="Carregando atividade..." /> : activity.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma atividade recente.</p>
            ) : activity.map(item => <button
              key={item.id}
              type="button"
              onClick={() => item.route && navigate(item.route)}
              disabled={!item.route}
              className="flex w-full items-start gap-3 py-3 text-left first:pt-0 last:pb-0 disabled:cursor-default"
            >
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.read_at ? "bg-border" : "bg-primary")} />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs text-foreground">{item.title}</strong>
                <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">{item.message}</span>
              </span>
              <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">{notificationTime(item.created_at)}</span>
            </button>)}
          </div>
        </AdminCardContent>
      </AdminCard>
    </section>
  </div>;
}
