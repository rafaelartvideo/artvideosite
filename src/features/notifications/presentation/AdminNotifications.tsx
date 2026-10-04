import type { ElementType } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Landmark,
  MapPinned,
  Package,
  Pencil,
  Settings,
  ShoppingCart,
  Tag,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import type { AdminNotification } from "../infrastructure/notifications.repository";

const moduleVisuals: Record<string, { label: string; icon: ElementType }> = {
  orders: { label: "Ordens de Serviço", icon: ClipboardList },
  customers: { label: "Cadastros", icon: Users },
  quotes: { label: "Orçamentos", icon: FileText },
  agenda: { label: "Agenda", icon: CalendarDays },
  inventory: { label: "Estoque", icon: Package },
  pdv: { label: "PDV", icon: ShoppingCart },
  finance: { label: "Financeiro", icon: Landmark },
  fieldTracking: { label: "Mapa de Campo", icon: MapPinned },
  equipment: { label: "Equipamentos", icon: Wrench },
  checklists: { label: "Checklists", icon: ClipboardCheck },
  generalServices: { label: "Serviços Gerais", icon: Wrench },
  serviceTypes: { label: "Tipos de Atendimento", icon: ClipboardList },
  situations: { label: "Situações da OS", icon: ClipboardList },
  orderStatuses: { label: "Status da OS", icon: ClipboardList },
  roles: { label: "Funções e Permissões", icon: Users },
  documents: { label: "Documentos", icon: FileText },
  terms: { label: "Termos/Garantia", icon: FileText },
  settings: { label: "Dados da empresa", icon: Settings },
  services: { label: "Serviços do Site", icon: Wrench },
  brands: { label: "Marcas", icon: Tag },
  categories: { label: "Categorias", icon: Tag },
  siteSettings: { label: "Site", icon: Settings },
  contact: { label: "Contato", icon: Users },
  partnerCompanies: { label: "Empresas Parceiras", icon: Users },
};

function notificationVisual(notification: AdminNotification) {
  return moduleVisuals[notification.module_key] || { label: "Sistema", icon: Bell };
}

function eventIcon(notification: AdminNotification) {
  if (notification.event_type === "created") return CheckCircle2;
  if (notification.event_type === "deleted") return Trash2;
  return Pencil;
}

function eventTone(notification: AdminNotification) {
  if (notification.event_type === "created") return "bg-emerald-50 text-emerald-600 border-emerald-100";
  if (notification.event_type === "deleted") return "bg-red-50 text-red-600 border-red-100";
  return "bg-blue-50 text-blue-600 border-blue-100";
}

export function notificationTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} d`;

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-red-500 px-0.5 text-[8px] font-black leading-none text-white">
    {count > 99 ? "99+" : count}
  </span>;
}

function NotificationRow({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: AdminNotification;
  onOpen: (notification: AdminNotification) => void;
  onDismiss: (notification: AdminNotification) => void;
}) {
  const visual = notificationVisual(notification);
  const ModuleIcon = visual.icon;
  const EventIcon = eventIcon(notification);
  const unread = !notification.read_at;

  return <div className={cn(
    "group relative flex w-full gap-2 border-b border-[#0d1b2e]/7 px-3.5 py-3.5 transition-colors last:border-b-0 hover:bg-[#f7f9fc]",
    unread && "bg-[#f4f8ff]",
  )}>
    {unread && <span className="absolute bottom-0 left-0 top-0 w-0.5 bg-primary" />}
    <button type="button" onClick={() => onOpen(notification)} className="flex min-w-0 flex-1 gap-3 text-left">
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#0d1b2e]/8 bg-white text-[#53657b]">
          <ModuleIcon size={18} strokeWidth={1.9} />
        </div>
        <span className={cn(
          "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border",
          eventTone(notification),
        )}>
          <EventIcon size={10} strokeWidth={2.4} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn(
            "min-w-0 flex-1 text-[13px] leading-5 text-[#17283d]",
            unread ? "font-black" : "font-bold",
          )}>
            {notification.title}
          </p>
          {unread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#718096]">
          {notification.message}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#96a2b2]">
          <span className="truncate">{visual.label}</span>
          <span aria-hidden="true">•</span>
          <span className="shrink-0 normal-case tracking-normal">{notificationTime(notification.created_at)}</span>
        </div>
      </div>
    </button>

    <button
      type="button"
      onClick={() => onDismiss(notification)}
      aria-label="Remover notificação"
      title="Remover notificação"
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#9aa6b5] transition-colors hover:bg-red-50 hover:text-red-600"
    >
      <Trash2 size={14} />
    </button>
  </div>;
}

export function AdminNotificationPanel({
  notifications,
  unreadCount,
  loading,
  onOpen,
  onMarkAllRead,
  onDismiss,
  onDismissAll,
}: {
  notifications: AdminNotification[];
  unreadCount: number;
  loading: boolean;
  onOpen: (notification: AdminNotification) => void;
  onMarkAllRead: () => void;
  onDismiss: (notification: AdminNotification) => void;
  onDismissAll: () => void;
}) {
  return <div className="flex max-h-[430px] flex-col">
    <div className="flex items-center justify-between border-b border-[#0d1b2e]/8 px-3.5 py-2.5">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#0d1b2e]">Notificações</p>
        <p className="mt-0.5 text-[10px] text-[#8a98aa]">
          {unreadCount > 0 ? `${unreadCount} não ${unreadCount === 1 ? "lida" : "lidas"}` : "Tudo em dia"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {unreadCount > 0 && <button
          type="button"
          onClick={onMarkAllRead}
          className="rounded-md px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/5"
        >
          Marcar lidas
        </button>}
        {notifications.length > 0 && <button
          type="button"
          onClick={onDismissAll}
          aria-label="Limpar todas as notificações"
          title="Limpar todas"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[#8a98aa] transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={14} />
        </button>}
      </div>
    </div>

    <div className="min-h-0 overflow-y-auto overscroll-contain">
      {loading ? (
        <div className="px-4 py-8 text-center text-xs text-[#7b899d]">Carregando notificações...</div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-9 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3f6fa] text-[#8b99aa]">
            <Bell size={19} />
          </div>
          <p className="mt-3 text-sm font-bold text-[#0d1b2e]">Nenhuma notificação</p>
          <p className="mt-1 max-w-[240px] text-xs leading-5 text-[#7b899d]">
            Criações e alterações dos módulos aparecerão aqui.
          </p>
        </div>
      ) : (
        notifications.map(notification => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onOpen={onOpen}
            onDismiss={onDismiss}
          />
        ))
      )}
    </div>
  </div>;
}

export function LiveNotificationToast({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: AdminNotification | null;
  onOpen: (notification: AdminNotification) => void;
  onDismiss: () => void;
}) {
  if (!notification) return null;

  const visual = notificationVisual(notification);
  const ModuleIcon = visual.icon;
  const EventIcon = eventIcon(notification);

  return <div
    className="fixed right-4 top-20 z-[300] w-[min(390px,calc(100vw-32px))] overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200"
    role="status"
    aria-live="polite"
  >
    <div className="h-1 w-full bg-primary" />
    <div className="flex gap-3 p-4">
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className="flex min-w-0 flex-1 gap-3 text-left"
      >
        <div className="relative shrink-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f7fb] text-[#43566d]">
            <ModuleIcon size={19} />
          </div>
          <span className={cn(
            "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border",
            eventTone(notification),
          )}>
            <EventIcon size={10} strokeWidth={2.4} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-primary">{visual.label}</p>
          <p className="mt-0.5 text-sm font-black leading-5 text-[#0d1b2e]">{notification.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#718096]">{notification.message}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-[#9aa6b5]">{notificationTime(notification.created_at)}</p>
        </div>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar notificação"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#98a4b3] transition-colors hover:bg-[#f3f5f8] hover:text-[#34445a]"
      >
        <X size={14} />
      </button>
    </div>
  </div>;
}
