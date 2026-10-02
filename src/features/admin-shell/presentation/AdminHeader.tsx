import { useState } from "react";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  LogOut,
  Menu,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { AutoFitLogo } from "@/shared/ui/media/AutoFitLogo";
import { getCompanySettings } from "@/features/settings/infrastructure/company-settings.repository";
import { cn } from "@/shared/domain/formatters";
import type { AdminPageState } from "../domain/admin.types";

type AdminHeaderProps = {
  page: AdminPageState;
  sidebarOpen: boolean;
  activeOrganizationId?: string | null;
  activeOrganizationName?: string | null;
  userName: string;
  roleName: string;
  canOpenSettings?: boolean;
  onOpenSettings?: () => void;
  onSignOut: () => void | Promise<void>;
  onToggleSidebar: () => void;
};

type HeaderMenu = "help" | "notifications" | "profile" | null;

function normalizeBreadcrumb(breadcrumb: string, title: string) {
  const parts = String(breadcrumb || "")
    .split(">")
    .map(part => part.trim())
    .filter(Boolean);
  const normalizedTitle = String(title || "").trim().toLocaleLowerCase("pt-BR");

  while (
    parts.length > 0
    && parts[parts.length - 1].toLocaleLowerCase("pt-BR") === normalizedTitle
  ) {
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
  disabled = false,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={cn(
      "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
      active
        ? "border-primary/20 bg-primary/8 text-primary"
        : "border-transparent text-[#7b899d] hover:border-[#0d1b2e]/8 hover:bg-[#f5f7fa] hover:text-primary",
      disabled && "cursor-not-allowed opacity-40",
    )}
  >
    {children}
  </button>;
}

function HeaderDropdown({
  title,
  children,
  align = "left",
}: {
  title: string;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return <div className={cn(
    "absolute top-[calc(100%+8px)] z-[80] w-[290px] overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-[0_18px_45px_rgba(13,27,46,0.16)]",
    align === "right" ? "right-0" : "left-0",
  )}>
    <div className="border-b border-[#0d1b2e]/8 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-[#0d1b2e]">{title}</p>
    </div>
    {children}
  </div>;
}

export function AdminHeader({
  page,
  sidebarOpen,
  activeOrganizationId,
  activeOrganizationName,
  userName,
  roleName,
  canOpenSettings = false,
  onOpenSettings,
  onSignOut,
  onToggleSidebar,
}: AdminHeaderProps) {
  const [openMenu, setOpenMenu] = useState<HeaderMenu>(null);
  const parentBreadcrumb = page ? normalizeBreadcrumb(page.breadcrumb, page.title) : "";
  const brandingQuery = useQuery({
    queryKey: ["company-settings", activeOrganizationId || "none"],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => getCompanySettings(activeOrganizationId),
  });
  const companyLogoMediaId = brandingQuery.data?.company_menu_logo_media_id
    || brandingQuery.data?.company_logo_media_id
    || null;
  const { url: companyLogoUrl } = useMediaUrl(companyLogoMediaId);
  const userFirstName = firstName(userName);
  const userInitial = userFirstName.slice(0, 1).toUpperCase();

  const toggleMenu = (menu: Exclude<HeaderMenu, null>) => {
    setOpenMenu(current => current === menu ? null : menu);
  };

  return (
    <>
      {openMenu && <button type="button" aria-label="Fechar menu do cabeçalho" className="fixed inset-0 z-[59] cursor-default bg-transparent" onClick={() => setOpenMenu(null)} />}

      <header className="relative z-[60] shrink-0 border-b border-[#0d1b2e]/8 bg-white shadow-sm">
        <div className="hidden h-20 min-w-0 items-center justify-between gap-5 px-5 md:flex lg:px-7">
          <div className="flex min-w-0 items-center gap-1">
            <div className="relative">
              <HeaderAction label="Ajuda" active={openMenu === "help"} onClick={() => toggleMenu("help")}>
                <CircleHelp size={18} strokeWidth={2} />
              </HeaderAction>
              {openMenu === "help" && <HeaderDropdown title="Ajuda">
                <div className="space-y-1 px-4 py-4">
                  <p className="text-sm font-bold text-[#0d1b2e]">Ajuda da Union World</p>
                  <p className="text-xs leading-5 text-[#66768c]">A central de ajuda e os atalhos de suporte ficarão disponíveis por aqui.</p>
                </div>
              </HeaderDropdown>}
            </div>

            <div className="relative">
              <HeaderAction label="Notificações" active={openMenu === "notifications"} onClick={() => toggleMenu("notifications")}>
                <Bell size={18} strokeWidth={2} />
              </HeaderAction>
              {openMenu === "notifications" && <HeaderDropdown title="Notificações">
                <div className="px-4 py-6 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f7fa] text-[#8a98aa]"><Bell size={17} /></div>
                  <p className="mt-3 text-sm font-bold text-[#0d1b2e]">Nenhuma notificação</p>
                  <p className="mt-1 text-xs leading-5 text-[#7b899d]">Novos avisos do sistema aparecerão aqui.</p>
                </div>
              </HeaderDropdown>}
            </div>

            <HeaderAction
              label={canOpenSettings ? "Configurações" : "Configurações indisponíveis"}
              disabled={!canOpenSettings}
              onClick={() => {
                if (!canOpenSettings) return;
                setOpenMenu(null);
                onOpenSettings?.();
              }}
            >
              <Settings size={18} strokeWidth={2} />
            </HeaderAction>
          </div>

          <div className="flex flex-1 justify-center" aria-hidden="true" />

          <div className="relative flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => toggleMenu("profile")}
              aria-expanded={openMenu === "profile"}
              className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#f5f7fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <div className="hidden min-w-0 text-right lg:block">
                <p className="truncate text-sm text-[#5a6a82]">{greeting()}, <strong className="font-black text-[#0d1b2e]">{userFirstName}</strong></p>
                <p className="mt-0.5 max-w-[220px] truncate text-[11px] font-semibold text-[#8a98aa]">{activeOrganizationName || roleName}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-[#eef5ff] text-sm font-black text-primary">
                {userInitial || <UserRound size={17} />}
              </div>
              <ChevronDown size={15} className={cn("text-[#8a98aa] transition-transform", openMenu === "profile" && "rotate-180")} />
            </button>

            {openMenu === "profile" && <HeaderDropdown title="Minha conta" align="right">
              <div className="border-b border-[#0d1b2e]/8 px-4 py-4">
                <p className="truncate text-sm font-black text-[#0d1b2e]">{userName}</p>
                <p className="mt-1 truncate text-xs text-[#68788d]">{roleName}</p>
                {activeOrganizationName && <p className="mt-2 truncate text-[11px] font-semibold text-primary">{activeOrganizationName}</p>}
              </div>
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => { setOpenMenu(null); void onSignOut(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut size={16} /> Sair
                </button>
              </div>
            </HeaderDropdown>}
          </div>
        </div>

        <div className="relative flex h-16 items-center gap-2 px-3 pt-[env(safe-area-inset-top)] md:hidden">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            title={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            className="relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
          >
            {sidebarOpen ? <X size={19} strokeWidth={2.4} /> : <Menu size={20} strokeWidth={2.4} />}
          </button>

          <div className="pointer-events-none absolute inset-x-14 inset-y-0 flex items-center justify-center">
            {companyLogoUrl ? (
              <AutoFitLogo
                src={companyLogoUrl}
                alt={activeOrganizationName || "Logo da empresa"}
                className="h-9 w-full max-w-[145px] object-contain"
              />
            ) : (
              <span className="max-w-[140px] truncate text-sm font-black text-[#0d1b2e]">
                {activeOrganizationName || "Empresa"}
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <HeaderAction label="Notificações" active={openMenu === "notifications"} onClick={() => toggleMenu("notifications")}>
              <Bell size={17} />
            </HeaderAction>
            <button
              type="button"
              onClick={() => toggleMenu("profile")}
              aria-label="Abrir minha conta"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/15 bg-[#eef5ff] text-xs font-black text-primary"
            >
              {userInitial}
            </button>
          </div>

          {openMenu === "notifications" && <div className="absolute right-3 top-[calc(100%+8px)] z-[80] w-[min(310px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-xl">
            <div className="border-b border-[#0d1b2e]/8 px-4 py-3 text-xs font-black uppercase tracking-[0.1em]">Notificações</div>
            <div className="px-4 py-6 text-center"><p className="text-sm font-bold text-[#0d1b2e]">Nenhuma notificação</p><p className="mt-1 text-xs text-[#7b899d]">Novos avisos aparecerão aqui.</p></div>
          </div>}

          {openMenu === "profile" && <div className="absolute right-3 top-[calc(100%+8px)] z-[80] w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-xl">
            <div className="border-b border-[#0d1b2e]/8 px-4 py-4">
              <p className="text-sm text-[#5a6a82]">{greeting()}, <strong className="text-[#0d1b2e]">{userFirstName}</strong></p>
              <p className="mt-1 truncate text-xs text-[#7b899d]">{activeOrganizationName || roleName}</p>
            </div>
            <div className="p-2">
              {canOpenSettings && <button type="button" onClick={() => { setOpenMenu(null); onOpenSettings?.(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><Settings size={16} /> Configurações</button>}
              <button type="button" onClick={() => { setOpenMenu(null); void onSignOut(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50"><LogOut size={16} /> Sair</button>
            </div>
          </div>}
        </div>
      </header>

      {page && (
        <header className="relative z-30 hidden min-w-0 shrink-0 border-b border-[#0d1b2e]/8 bg-white px-6 py-3 md:block">
          <div className="min-w-0">
            <div className="mb-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-[#5a6a82]">
              {parentBreadcrumb && <>
                <button
                  type="button"
                  onClick={page.onBack}
                  className="min-w-0 truncate font-semibold transition-colors hover:text-primary"
                  title={parentBreadcrumb}
                >
                  {parentBreadcrumb}
                </button>
                <span aria-hidden="true" className="shrink-0">&gt;</span>
              </>}
              <span className="max-w-[220px] truncate" title={page.title}>{page.title}</span>
            </div>

            <h2 className={page.titleVariant === "order-number"
              ? "break-words text-2xl font-black leading-tight text-primary"
              : "break-words text-[15px] font-black text-[#0d1b2e]"
            }>{page.title}</h2>
            {page.subtitle && <p className="mt-0.5 max-w-4xl break-words text-[14px] text-[#5a6a82]">{page.subtitle}</p>}
          </div>
        </header>
      )}
    </>
  );
}
