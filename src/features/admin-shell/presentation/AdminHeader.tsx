import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { AutoFitLogo } from "@/shared/ui/media/AutoFitLogo";
import { useCompanySettingsQuery } from "@/features/settings/presentation/useCompanySettingsQuery";
import { changeAdminPassword } from "@/features/auth/infrastructure/auth.repository";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { cn } from "@/shared/domain/formatters";
import type { OrganizationAccess } from "@/lib/organization.types";
import type { AdminPageState } from "../domain/admin.types";
import { useAdminTheme } from "./AdminLayout";
import { useAdminNotifications } from "@/features/notifications/application/useAdminNotifications";
import {
  AdminNotificationPanel,
  LiveNotificationToast,
  NotificationBadge,
} from "@/features/notifications/presentation/AdminNotifications";
import type { AdminNotification } from "@/features/notifications/infrastructure/notifications.repository";

type AdminHeaderProps = {
  page: AdminPageState;
  sidebarOpen: boolean;
  activeOrganizationId?: string | null;
  activeOrganizationName?: string | null;
  organizations: OrganizationAccess[];
  userId?: string | null;
  userName: string;
  username: string;
  roleName: string;
  onOrganizationChange: (organizationId: string) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  onToggleSidebar: () => void;
};

type HeaderMenu = "help" | "notifications" | "settings" | "profile" | null;

function normalizeBreadcrumb(breadcrumb: string, title: string) {
  const parts = String(breadcrumb || "")
    .split(">")
    .map(part => part.trim())
    .filter(Boolean);
  const normalizedTitle = String(title || "").trim().toLocaleLowerCase("pt-BR");

  while (parts.length > 0) {
    const lastPart = parts[parts.length - 1].toLocaleLowerCase("pt-BR");
    const redundant = lastPart === normalizedTitle
      || normalizedTitle.startsWith(`${lastPart} `)
      || lastPart.startsWith(`${normalizedTitle} `);
    if (!redundant) break;
    parts.pop();
  }

  return parts.join(" > ");
}

function firstName(name: string) {
  return String(name || "Usuário").trim().split(/\s+/)[0] || "Usuário";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function HeaderAction({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={cn(
      "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      active
        ? "border-primary/15 bg-primary/8 text-primary"
        : "border-transparent text-[#7b899d] hover:text-primary",
    )}
  >
    {children}
  </button>;
}

function ThemeToggle({
  theme,
  onChange,
  compact = false,
}: {
  theme: "light" | "dark";
  onChange: (theme: "light" | "dark") => void;
  compact?: boolean;
}) {
  const dark = theme === "dark";
  const circleSize = compact ? "h-6 w-6" : "h-7 w-7";
  return <button
    type="button"
    role="switch"
    aria-checked={dark}
    aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
    title={dark ? "Tema escuro" : "Tema claro"}
    onClick={() => onChange(dark ? "light" : "dark")}
    className={cn(
      "relative inline-flex shrink-0 items-center rounded-full border border-border bg-muted/80 shadow-inner transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      compact ? "h-8 w-[62px]" : "h-9 w-[68px]",
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-1 rounded-full border border-border/70 bg-card shadow-sm transition-all duration-200 ease-out",
        circleSize,
        dark ? "right-1" : "left-1",
      )}
    />
    <span
      aria-hidden="true"
      className={cn(
        "absolute left-1 top-1 z-10 flex items-center justify-center transition-colors",
        circleSize,
        !dark ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Sun size={compact ? 14 : 15} strokeWidth={2.1} />
    </span>
    <span
      aria-hidden="true"
      className={cn(
        "absolute right-1 top-1 z-10 flex items-center justify-center transition-colors",
        circleSize,
        dark ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Moon size={compact ? 14 : 15} strokeWidth={2.1} />
    </span>
  </button>;
}

function HeaderDropdown({
  title,
  children,
  align = "left",
  width = "w-[260px]",
}: {
  title: string;
  children: React.ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  return <div className={cn(
    "absolute top-[calc(100%+7px)] z-[80] overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-white",
    width,
    align === "right" ? "right-0" : "left-0",
  )}>
    <div className="border-b border-[#0d1b2e]/8 px-3.5 py-2.5">
      <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#0d1b2e]">{title}</p>
    </div>
    {children}
  </div>;
}

function PasswordInput({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return <label className="block">
    <span className="mb-1.5 block text-xs font-bold text-[#34445a]">{label}</span>
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="h-11 w-full rounded-lg border border-[#0d1b2e]/15 bg-white px-3 pr-11 text-sm text-[#0d1b2e] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-[#7b899d] hover:text-primary"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  </label>;
}

export function AdminHeader({
  page,
  sidebarOpen,
  activeOrganizationId,
  activeOrganizationName,
  organizations,
  userId,
  userName,
  username,
  roleName,
  onOrganizationChange,
  onSignOut,
  onToggleSidebar,
}: AdminHeaderProps) {
  const { theme, setTheme } = useAdminTheme();
  const navigate = useNavigate();
  const notifications = useAdminNotifications(activeOrganizationId, userId);
  const [openMenu, setOpenMenu] = useState<HeaderMenu>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [switchingOrganization, setSwitchingOrganization] = useState(false);

  const parentBreadcrumb = page ? normalizeBreadcrumb(page.breadcrumb, page.title) : "";
  const brandingQuery = useCompanySettingsQuery(activeOrganizationId);
  const companyLogoMediaId = brandingQuery.data?.company_menu_logo_media_id
    || brandingQuery.data?.company_logo_media_id
    || null;
  const { url: companyLogoUrl } = useMediaUrl(companyLogoMediaId);
  const userFirstName = firstName(userName);
  const userInitial = userFirstName.slice(0, 1).toUpperCase();
  const switchableOrganizations = organizations.filter(organization => organization.is_direct_member);

  const toggleMenu = (menu: Exclude<HeaderMenu, null>) => {
    setOpenMenu(current => current === menu ? null : menu);
  };

  const openNotification = async (notification: AdminNotification) => {
    try {
      await notifications.markRead(notification);
    } catch (error) {
      console.error("Não foi possível marcar a notificação como lida:", error);
    } finally {
      notifications.dismissLiveNotification();
      setOpenMenu(null);
      if (notification.route) navigate(notification.route);
    }
  };

  const closePasswordModal = () => {
    if (passwordSaving) return;
    setPasswordOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const submitPassword = async () => {
    setPasswordError("");
    setPasswordSuccess("");
    if (!currentPassword) {
      setPasswordError("Informe sua senha atual.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("A confirmação da nova senha não confere.");
      return;
    }
    if (!username) {
      setPasswordError("Não foi possível identificar seu usuário.");
      return;
    }

    setPasswordSaving(true);
    const result = await changeAdminPassword(username, currentPassword, newPassword);
    setPasswordSaving(false);

    if (result === "changed") {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Senha alterada com sucesso.");
      return;
    }
    if (result === "invalid_credentials") {
      setPasswordError("A senha atual informada está incorreta.");
      return;
    }
    if (result === "weak_password") {
      setPasswordError("A nova senha não atende aos requisitos de segurança.");
      return;
    }
    if (result === "inactive_user") {
      setPasswordError("Este usuário está inativo.");
      return;
    }
    setPasswordError("Não foi possível alterar a senha. Tente novamente.");
  };

  const changeOrganization = async (organizationId: string) => {
    if (!organizationId || organizationId === activeOrganizationId || switchingOrganization) return;
    setSwitchingOrganization(true);
    try {
      await onOrganizationChange(organizationId);
      setOpenMenu(null);
    } finally {
      setSwitchingOrganization(false);
    }
  };

  const settingsMenu = <div className="p-2">
    <button
      type="button"
      onClick={() => {
        setOpenMenu(null);
        setPasswordError("");
        setPasswordSuccess("");
        setPasswordOpen(true);
      }}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-semibold text-[#24354b] transition-colors hover:bg-[#f5f7fa]"
    >
      <KeyRound size={16} className="text-[#718096]" />
      Alterar senha
    </button>
  </div>;

  const profileMenu = <div>
    <div className="border-b border-[#0d1b2e]/8 px-3.5 py-3">
      <p className="truncate text-sm font-bold text-[#0d1b2e]">{userName}</p>
      <p className="mt-0.5 truncate text-[11px] text-[#7b899d]">{roleName}</p>
    </div>
    {switchableOrganizations.length > 0 && <div className="border-b border-[#0d1b2e]/8 px-3.5 py-3">
      <label htmlFor="header-active-organization" className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#8a98aa]">Empresa ativa</label>
      <div className="relative">
        <select
          id="header-active-organization"
          value={activeOrganizationId || ""}
          disabled={switchingOrganization}
          onChange={event => void changeOrganization(event.target.value)}
          className="h-9 w-full appearance-none rounded-md border border-[#0d1b2e]/12 bg-white pl-2.5 pr-8 text-xs font-bold text-[#0d1b2e] outline-none focus:border-primary"
        >
          {switchableOrganizations.map(organization => (
            <option key={organization.organization_id} value={organization.organization_id}>
              {organization.organization_name}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8a98aa]" />
      </div>
    </div>}
    <div className="p-2">
      <button
        type="button"
        onClick={() => { setOpenMenu(null); void onSignOut(); }}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
      >
        <LogOut size={15} /> Sair
      </button>
    </div>
  </div>;

  const notificationPanel = <AdminNotificationPanel
    notifications={notifications.notifications}
    unreadCount={notifications.unreadCount}
    loading={notifications.isLoading}
    onOpen={notification => void openNotification(notification)}
    onMarkAllRead={() => void notifications.markAllRead()}
  />;

  return (
    <>
      {openMenu && <button type="button" aria-label="Fechar menu do cabeçalho" className="fixed inset-0 z-[59] cursor-default bg-transparent" onClick={() => setOpenMenu(null)} />}

      <LiveNotificationToast
        notification={notifications.liveNotification}
        onOpen={notification => void openNotification(notification)}
        onDismiss={notifications.dismissLiveNotification}
      />

      <header className="relative z-[60] shrink-0 border-b border-[#0d1b2e]/10 bg-white">
        <div className="hidden h-16 min-w-0 items-center justify-between gap-4 px-4 md:flex lg:px-6">
          <div className="flex min-w-0 items-center gap-0.5">
            <div className="relative">
              <HeaderAction label="Ajuda" active={openMenu === "help"} onClick={() => toggleMenu("help")}>
                <CircleHelp size={17} strokeWidth={2} />
              </HeaderAction>
              {openMenu === "help" && <HeaderDropdown title="Ajuda">
                <div className="px-3.5 py-3">
                  <p className="text-sm font-semibold text-[#0d1b2e]">Central de ajuda</p>
                  <p className="mt-1 text-xs leading-5 text-[#718096]">Tutoriais e suporte da Union World ficarão disponíveis aqui.</p>
                </div>
              </HeaderDropdown>}
            </div>

            <div className="relative">
              <HeaderAction label="Notificações" active={openMenu === "notifications"} onClick={() => toggleMenu("notifications")}>
                <Bell size={17} strokeWidth={2} />
                <NotificationBadge count={notifications.unreadCount} />
              </HeaderAction>
              {openMenu === "notifications" && <div className="absolute left-0 top-[calc(100%+7px)] z-[80] w-[390px] overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-xl">
                {notificationPanel}
              </div>}
            </div>

            <div className="relative">
              <HeaderAction label="Configurações" active={openMenu === "settings"} onClick={() => toggleMenu("settings")}>
                <Settings size={17} strokeWidth={2} />
              </HeaderAction>
              {openMenu === "settings" && <HeaderDropdown title="Configurações" width="w-[245px]">
                {settingsMenu}
              </HeaderDropdown>}
            </div>

            <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>

          <div className="flex flex-1" />

          <div className="relative flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => toggleMenu("profile")}
              aria-expanded={openMenu === "profile"}
              className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <div className="hidden min-w-0 text-right lg:block">
                <p className="truncate text-[13px] leading-4 text-[#5f6f84]">{greeting()}, <strong className="font-bold text-[#0d1b2e]">{userFirstName}</strong></p>
                <p className="mt-0.5 max-w-[190px] truncate text-[10px] font-semibold text-[#8a98aa]">{activeOrganizationName || roleName}</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-[#eef5ff] text-xs font-black text-primary">
                {userInitial}
              </div>
              <ChevronDown size={13} className={cn("text-[#8a98aa] transition-transform", openMenu === "profile" && "rotate-180")} />
            </button>
            {openMenu === "profile" && <HeaderDropdown title="Minha conta" align="right" width="w-[270px]">{profileMenu}</HeaderDropdown>}
          </div>
        </div>

        <div className="relative flex h-16 items-center gap-1 px-3 pt-[env(safe-area-inset-top)] md:hidden">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={19} />}
          </button>

          <div className="pointer-events-none absolute inset-x-14 inset-y-0 flex items-center justify-center">
            {companyLogoUrl ? (
              <AutoFitLogo src={companyLogoUrl} alt={activeOrganizationName || "Logo da empresa"} className="h-8 w-full max-w-[130px] object-contain" />
            ) : (
              <span className="max-w-[130px] truncate text-xs font-black text-[#0d1b2e]">{activeOrganizationName || "Empresa"}</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <HeaderAction label="Notificações" active={openMenu === "notifications"} onClick={() => toggleMenu("notifications")}>
              <Bell size={16} />
              <NotificationBadge count={notifications.unreadCount} />
            </HeaderAction>
            <HeaderAction label="Configurações" active={openMenu === "settings"} onClick={() => toggleMenu("settings")}><Settings size={16} /></HeaderAction>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <ThemeToggle theme={theme} onChange={setTheme} compact />
            <button type="button" onClick={() => toggleMenu("profile")} aria-label="Minha conta" className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/15 bg-[#eef5ff] text-[11px] font-black text-primary">{userInitial}</button>
          </div>

          {openMenu === "notifications" && <div className="absolute right-3 top-[calc(100%+6px)] z-[80] w-[min(390px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-xl">
            {notificationPanel}
          </div>}
          {openMenu === "settings" && <div className="absolute right-3 top-[calc(100%+6px)] z-[80] w-[min(260px,calc(100vw-24px))] rounded-lg border border-[#0d1b2e]/10 bg-white">{settingsMenu}</div>}
          {openMenu === "profile" && <div className="absolute right-3 top-[calc(100%+6px)] z-[80] w-[min(280px,calc(100vw-24px))] rounded-lg border border-[#0d1b2e]/10 bg-white">{profileMenu}</div>}
        </div>
      </header>

      {page && (
        <header className="relative z-30 hidden min-w-0 shrink-0 border-b border-border bg-card px-6 py-3 md:block">
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-[#5a6a82]">
            {parentBreadcrumb && <>
              <button
                type="button"
                onClick={page.onBack}
                className="min-w-0 max-w-[340px] truncate font-normal transition-colors hover:text-primary"
                title={parentBreadcrumb}
              >
                {parentBreadcrumb}
              </button>
              <span aria-hidden="true" className="shrink-0">&gt;</span>
            </>}
            <span
              className="min-w-0 truncate font-normal text-[#0d1b2e] underline decoration-current underline-offset-4"
              title={page.title}
            >
              {page.title}
            </span>
          </div>
        </header>
      )}

      <AdminDialog
        open={passwordOpen}
        onClose={closePasswordModal}
        title="Alterar senha"
        description="Confirme sua senha atual e informe a nova senha."
        className="max-w-md"
        footer={<div className="flex justify-end gap-2">
          <BtnSecondary onClick={closePasswordModal} disabled={passwordSaving}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={() => void submitPassword()} loading={passwordSaving} loadingText="Alterando...">Alterar senha</BtnPrimary>
        </div>}
      >
        <div className="space-y-4">
          {passwordError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">{passwordError}</div>}
          {passwordSuccess && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700">{passwordSuccess}</div>}
          <PasswordInput label="Senha atual" value={currentPassword} onChange={setCurrentPassword} visible={showCurrentPassword} onToggle={() => setShowCurrentPassword(value => !value)} autoComplete="current-password" />
          <PasswordInput label="Nova senha" value={newPassword} onChange={setNewPassword} visible={showNewPassword} onToggle={() => setShowNewPassword(value => !value)} autoComplete="new-password" />
          <PasswordInput label="Confirmar nova senha" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmPassword} onToggle={() => setShowConfirmPassword(value => !value)} autoComplete="new-password" />
          <p className="text-[11px] leading-5 text-[#7b899d]">A nova senha deve ter pelo menos 8 caracteres.</p>
        </div>
      </AdminDialog>
    </>
  );
}
