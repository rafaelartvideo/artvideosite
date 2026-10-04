import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Landmark,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  Package,
  ShoppingCart,
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
import { notificationTime } from "@/features/notifications/presentation/AdminNotifications";
import { systemErrorMessage } from "@/shared/domain/error-message";

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
          {announcement.is_pinned && <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[9px] font-black uppercase text-foreground">Fixado</span>}
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
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
  });

  const activityQuery = useQuery({
    queryKey: adminNotificationsKey(activeOrganizationId || null, user?.id || null),
    enabled: Boolean(activeOrganizationId && user?.id),
    queryFn: () => loadAdminNotifications(activeOrganizationId!, 50),
    staleTime: 5 * 60_000,
  });

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
      <div className="flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">Home</p>
          <h1 className="mt-1 truncate text-2xl font-black text-foreground">{greeting()}, {userName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{activeOrganization?.organization_name || "Empresa ativa"} · <span className="capitalize">{formatHomeDate()}</span></p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.11em] text-muted-foreground">Avisos pendentes</p>
            <strong className="mt-1 block text-xl font-black text-foreground">{pendingAcknowledgments}</strong>
          </div>
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.11em] text-muted-foreground">Não lidas</p>
            <strong className="mt-1 block text-xl font-black text-foreground">{unreadCount}</strong>
          </div>
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
