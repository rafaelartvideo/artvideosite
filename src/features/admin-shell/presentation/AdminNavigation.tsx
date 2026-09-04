import type { ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
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
};

export function SidebarItem({ item, active, onClick }: SidebarItemProps) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-all",
        active
          ? "bg-[#0057e7] text-white shadow-lg shadow-[#0057e7]/25"
          : "text-white/60 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 truncate">{item.label}</span>
    </button>
  );
}

type AdminHubPageProps = {
  title: string;
  description: string;
  items: AdminHubItem[];
  onSelect: (id: string, label: string) => void;
};

export function AdminHubPage({
  title,
  description,
  items,
  onSelect,
}: AdminHubPageProps) {
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader title={title} subtitle={description} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <AdminCard key={item.id} className="group min-w-0 transition-all hover:border-[#0057e7]/40 hover:shadow-md">
              <AdminButton
                variant="ghost"
                type="button"
                onClick={() => onSelect(item.id, item.label)}
                className="h-auto w-full min-w-0 flex-col items-stretch whitespace-normal rounded-none p-0 text-left hover:bg-transparent"
              >
                <div className="min-w-0 px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8eef8] text-[#0057e7] transition-colors group-hover:bg-[#0057e7] group-hover:text-white">
                      <Icon size={18} />
                    </div>
                    <ArrowLeft size={15} className="shrink-0 rotate-180 text-[#5a6a82] transition-colors group-hover:text-[#0057e7]" />
                  </div>
                  <h3 className="mt-4 min-w-0 whitespace-normal break-words text-base font-black leading-tight text-[#0d1b2e]">{item.label}</h3>
                  <p className="mt-1.5 min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-sm font-normal leading-5 text-[#5a6a82]">{item.description}</p>
                  <span className="mt-4 inline-block text-xs font-bold text-[#0057e7]">Acessar módulo</span>
                </div>
              </AdminButton>
            </AdminCard>
          );
        })}
      </div>
    </div>
  );
}
