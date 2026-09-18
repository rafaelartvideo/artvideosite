import { ArrowLeft, Building2, ExternalLink, Globe, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { AdminTab } from "../domain/admin.types";
import { cn } from "@/shared/domain/formatters";
import { isAdminModuleEnabled, mainItems, operationItems, siteItems, utilityItems } from "../navigation-config";
import { parentAdminTab } from "../admin-routes";
import { SidebarItem } from "./AdminNavigation";
import { useAdminSidebarLayout } from "./AdminLayout";
import logoSolo from "@/imports/LogoSoloSemFundo.png";
import type { OrganizationAccess } from "@/lib/organization.types";
import { PLATFORM_ORGANIZATION_ID } from "@/lib/organization.constants";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { getCompanySettings } from "@/features/settings/infrastructure/company-settings.repository";

type AdminSidebarProps = {
  activeTab: AdminTab;
  userName: string;
  roleName: string;
  organizations: OrganizationAccess[];
  activeOrganizationId: string | null;
  hasPermission: (permission: string) => boolean;
  hasModule: (moduleKey: string) => boolean;
  onNavigate: (tab: AdminTab) => void;
  onOrganizationChange: (organizationId: string) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  onBackToSite: () => void;
};

export function AdminSidebar({
  activeTab,
  userName,
  roleName,
  organizations,
  activeOrganizationId,
  hasPermission,
  hasModule,
  onNavigate,
  onOrganizationChange: _onOrganizationChange,
  onSignOut,
  onBackToSite,
}: AdminSidebarProps) {
  const { collapsed, canCollapse, toggleCollapsed } = useAdminSidebarLayout();
  const isPlatformOrganization = activeOrganizationId === PLATFORM_ORGANIZATION_ID;
  const activeOrganization = organizations.find(organization => organization.organization_id === activeOrganizationId) ?? null;
  const brandingQuery = useQuery({
    queryKey: ["company-settings", activeOrganizationId || "none"],
    enabled: Boolean(activeOrganizationId && !isPlatformOrganization),
    queryFn: () => getCompanySettings(activeOrganizationId),
  });
  const { url: menuLogoUrl } = useMediaUrl(brandingQuery.data?.company_menu_logo_media_id ?? null);

  const canAccessTab = (tab: AdminTab) => {
    if (tab === "partnerCompanies" && !isPlatformOrganization) return false;
    const permission = tab === "partnerCompanies" ? "organizations.view" : `${tab}.view`;
    return hasPermission(permission) && isAdminModuleEnabled(tab, hasModule);
  };

  const selectedTab = parentAdminTab(activeTab) || activeTab;
  const canAccessSite = hasPermission("site.view") && siteItems.some(item =>
    hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule),
  );
  const canAccessOperation = operationItems.some(item =>
    hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn(
        "relative flex h-20 shrink-0 items-center border-b border-white/8 transition-all",
        collapsed ? "flex-col justify-center gap-1 px-2" : "justify-center px-10",
      )}>
        <div className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-2.5")}>
          {isPlatformOrganization ? <>
            <img src={logoSolo} alt="" aria-hidden="true" className={cn("shrink-0 object-contain transition-all", collapsed ? "h-7 w-7" : "h-8 w-8")} />
            {!collapsed && (
              <div className="min-w-0">
                <span className="block text-[8px] font-bold uppercase tracking-[0.3em] text-[#00b4ff]">Eletrônica</span>
                <span className="block text-base font-black leading-none text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
              </div>
            )}
          </> : menuLogoUrl ? (
            <img
              src={menuLogoUrl}
              alt={activeOrganization?.organization_name || "Logo da empresa"}
              className={cn("shrink-0 object-contain transition-all", collapsed ? "h-9 w-9" : "max-h-11 max-w-[150px]")}
            />
          ) : <>
            <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-[#0057e7]/25 text-[#00b4ff]", collapsed ? "h-9 w-9" : "h-8 w-8")}>
              <Building2 size={collapsed ? 18 : 16} />
            </div>
            {!collapsed && <span className="max-w-[145px] truncate text-sm font-black text-white">{activeOrganization?.organization_name || "Empresa"}</span>}
          </>}
        </div>

        {canCollapse && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir menu" : "Recuar menu"}
            aria-label={collapsed ? "Expandir menu lateral" : "Recuar menu lateral"}
            className={cn(
              "flex items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00b4ff]",
              collapsed ? "h-6 w-8" : "absolute right-2 h-8 w-8",
            )}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      <div className={cn(
        "shrink-0 border-b border-white/8 transition-all",
        collapsed ? "flex flex-col items-center gap-2 px-2 py-3" : "flex items-center justify-between gap-2 px-4 py-4",
      )}>
        {collapsed ? (
          <div
            title={`${userName} — ${roleName}`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0057e7]/30"
            aria-label={`${userName}, ${roleName}`}
          >
            <Users size={15} className="text-[#00b4ff]" />
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#0057e7]/30">
              <Users size={14} className="text-[#00b4ff]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{userName}</p>
              <span className="rounded bg-[#00b4ff]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#00b4ff]">{roleName}</span>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => void onSignOut()}
          title="Sair"
          aria-label="Sair"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/8 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00b4ff]",
            collapsed ? "h-9 w-9" : "p-1.5",
          )}
        >
          <LogOut size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <nav className={cn("space-y-0.5 py-4", collapsed ? "px-3" : "px-3")}>
          {mainItems.filter((item) => canAccessTab(item.id as AdminTab)).map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              active={selectedTab === item.id}
              collapsed={collapsed}
              onClick={() => onNavigate(item.id as AdminTab)}
            />
          ))}

          {canAccessSite && (
            <SidebarItem
              item={{ id: "site", label: "Site", icon: Globe }}
              active={selectedTab === "site"}
              collapsed={collapsed}
              onClick={() => onNavigate("site")}
            />
          )}

          {canAccessOperation && (
            <SidebarItem
              item={{ id: "operation", label: "Operação", icon: Settings }}
              active={selectedTab === "operation"}
              collapsed={collapsed}
              onClick={() => onNavigate("operation")}
            />
          )}

          <div className={cn("space-y-0.5", collapsed ? "pt-2" : "pt-3")}>
            {utilityItems.filter((item) => canAccessTab(item.id as AdminTab)).map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                active={selectedTab === item.id}
                collapsed={collapsed}
                onClick={() => onNavigate(item.id as AdminTab)}
              />
            ))}
          </div>

          {isPlatformOrganization && (
            <section className={cn("border-t border-white/8", collapsed ? "mt-3 pt-3" : "mt-4 pt-4")} aria-label="Sites externos">
              {!collapsed && <h2 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/40">SITES EXTERNOS</h2>}
              {[
                { label: "SAC DIGITAL", href: "https://monitor.sac.digital/login" },
                { label: "UNIQ", href: "https://web.uniq.app/login" },
              ].map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={collapsed ? link.label : undefined}
                  aria-label={`${link.label} (abre em nova aba)`}
                  className={cn(
                    "flex w-full items-center rounded-lg text-sm font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00b4ff]",
                    collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5 text-left",
                  )}
                >
                  <ExternalLink size={collapsed ? 18 : 17} className="shrink-0" />
                  {!collapsed && <span>{link.label}</span>}
                </a>
              ))}
            </section>
          )}
        </nav>
      </div>

      {isPlatformOrganization && (
        <div className={cn("shrink-0 border-t border-white/5", collapsed ? "px-3 py-3" : "px-3 pb-3 pt-2")}>
          <button
            type="button"
            onClick={onBackToSite}
            title={collapsed ? "Ver site público" : undefined}
            aria-label={collapsed ? "Ver site público" : undefined}
            className={cn(
              "flex w-full items-center rounded-lg text-white/40 transition-all hover:bg-white/5 hover:text-white/70",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5 text-sm",
            )}
          >
            <ArrowLeft size={collapsed ? 18 : 16} className="shrink-0" />
            {!collapsed && <span>Ver site público</span>}
          </button>
        </div>
      )}
    </div>
  );
}
