import type { ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { prefetchAdminModule } from "../application/admin-prefetch";
import { AdminButton, AdminCard, PageHeader } from "@/shared/ui/admin/AdminLayout";

export type AdminNavigationItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

export type AdminHubItem = AdminNavigationItem & {
  description: string;
};

type SidebarItemProps = {
  item: AdminNavigationItem;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
};

export function SidebarItem({ item, active, onClick, collapsed = false }: SidebarItemProps) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => prefetchAdminModule(item.id)}
      onFocus={() => prefetchAdminModule(item.id)}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full min-w-0 cursor-default items-center border-l-[4px] rounded-none text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-light/70",
        collapsed ? "justify-center px-0 py-2.5" : "gap-2 px-6 py-2 text-left",
        active
          ? "border-[#7893ff] bg-[#1c3153] text-[#eef3ff] dark:border-[#91a5ff] dark:bg-[#223553] dark:text-[#f4f7ff]"
          : "border-transparent text-white/70 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon size={collapsed ? 18 : 16} className="shrink-0" />
      {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
    </button>
  );
}

type AdminHubPageProps = {
  title: string;
  description: string;
  items: AdminHubItem[];
  onSelect: (id: string, label: string) => void;
  centeredIcons?: boolean;
  actionLabel?: string;
};

export function AdminHubPage({
  title,
  description,
  items,
  onSelect,
  centeredIcons = false,
  actionLabel = "Acessar módulo",
}: AdminHubPageProps) {
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader title={title} subtitle={description} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <AdminCard key={item.id} className="group min-w-0 transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-md">
              <AdminButton
                variant="ghost"
                type="button"
                onClick={() => onSelect(item.id, item.label)}
                onMouseEnter={() => prefetchAdminModule(item.id)}
                onFocus={() => prefetchAdminModule(item.id)}
                className="h-auto w-full min-w-0 flex-col items-stretch whitespace-normal rounded-none p-0 text-left hover:bg-transparent"
              >
                <div className={cn("min-w-0 px-4 py-4 sm:px-5 sm:py-5", centeredIcons && "text-center")}>
                  <div className={cn("flex min-w-0 items-start gap-3", centeredIcons ? "justify-center" : "justify-between")}>
                    <div className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-white",
                      centeredIcons && "h-12 w-12",
                    )}>
                      <Icon size={centeredIcons ? 22 : 18} />
                    </div>
                    {!centeredIcons && <ArrowLeft size={15} className="shrink-0 rotate-180 text-muted-foreground transition-colors group-hover:text-primary" />}
                  </div>
                  <h3 className="mt-4 min-w-0 whitespace-normal break-words text-base font-black leading-tight text-foreground">{item.label}</h3>
                  <p className={cn("mt-1.5 min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-sm font-normal leading-5 text-muted-foreground", centeredIcons && "mx-auto")}>{item.description}</p>
                  <span className="mt-4 inline-block text-xs font-bold text-primary">{actionLabel}</span>
                </div>
              </AdminButton>
            </AdminCard>
          );
        })}
      </div>
    </div>
  );
}
