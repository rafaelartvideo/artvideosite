import { ArrowLeft, Globe, LogOut, Settings, Users } from "lucide-react";
import type { AdminTab } from "../domain/admin.types";
import { cn } from "@/shared/domain/formatters";
import { mainItems, utilityItems } from "../navigation-config";
import { parentAdminTab } from "../admin-routing";
import { SidebarItem } from "./AdminNavigation";
import logoSolo from "@/imports/LogoSoloSemFundo.png";

type AdminSidebarProps = {
  activeTab: AdminTab;
  userName: string;
  roleName: string;
  hasPermission: (permission: string) => boolean;
  onNavigate: (tab: AdminTab) => void;
  onSignOut: () => void | Promise<void>;
  onBackToSite: () => void;
};

const operationPermissions = [
  "orders.view",
  "customers.view",
  "employees.view",
  "equipment.view",
  "service_types.view",
  "services.view",
  "general_services.view",
];

export function AdminSidebar({
  activeTab,
  userName,
  roleName,
  hasPermission,
  onNavigate,
  onSignOut,
  onBackToSite,
}: AdminSidebarProps) {
  const canAccessTab = (tab: string) => hasPermission(`${tab}.view`);
  const selectedTab = parentAdminTab(activeTab) || activeTab;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex h-20 items-center justify-center border-b border-white/8 px-3">
        <div className="flex items-center gap-2.5">
          <img src={logoSolo} alt="" aria-hidden="true" className="h-8 w-8 shrink-0 object-contain" />
          <div>
            <span className="text-[8px] font-bold tracking-[0.3em] uppercase text-[#00b4ff] block">Eletrônica</span>
            <span className="text-base font-black text-white block leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-white/8 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-[#0057e7]/30 rounded-full flex items-center justify-center flex-shrink-0">
            <Users size={14} className="text-[#00b4ff]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{userName}</p>
            <span className="text-[9px] font-bold text-[#00b4ff] bg-[#00b4ff]/10 px-1.5 py-0.5 rounded uppercase tracking-wide">{roleName}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onSignOut()}
          title="Sair"
          className="p-1.5 text-white/40 hover:text-red-400 hover:bg-white/8 rounded-lg transition-colors flex-shrink-0"
        >
          <LogOut size={16} />
        </button>
      </div>

      <nav className="px-3 py-4 space-y-0.5">
        {mainItems.filter((item) => canAccessTab(item.id)).map((item) => {
          const Icon = item.icon;
          const active = selectedTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id as AdminTab)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all text-left",
                active
                  ? "bg-[#0057e7] text-white shadow-lg shadow-[#0057e7]/25"
                  : "text-white/60 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon size={17} className="flex-shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}

        {hasPermission("site.view") && (
          <SidebarItem
            item={{ id: "site", label: "Site", icon: Globe }}
            active={selectedTab === "site"}
            onClick={() => onNavigate("site")}
          />
        )}

        {operationPermissions.some(hasPermission) && (
          <SidebarItem
            item={{ id: "operation", label: "Operação", icon: Settings }}
            active={selectedTab === "operation"}
            onClick={() => onNavigate("operation")}
          />
        )}

        <div className="pt-3 space-y-0.5">
          {utilityItems.filter((item) => canAccessTab(item.id)).map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              active={selectedTab === item.id}
              onClick={() => onNavigate(item.id as AdminTab)}
            />
          ))}
        </div>
      </nav>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onBackToSite}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={16} />
          <span>Ver site público</span>
        </button>
      </div>
    </div>
  );
}
