import type { ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/shared/domain/formatters";

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
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all text-left",
        active
          ? "bg-[#0057e7] text-white shadow-lg shadow-[#0057e7]/25"
          : "text-white/60 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span>{item.label}</span>
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
  title: _title,
  description: _description,
  items,
  onSelect,
}: AdminHubPageProps) {
  return (
    <div className="space-y-5">
      <div />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id, item.label)}
              className="group text-left bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm p-5 hover:border-[#0057e7]/40 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#e8eef8] text-[#0057e7] flex items-center justify-center group-hover:bg-[#0057e7] group-hover:text-white transition-colors">
                  <Icon size={20} />
                </div>
                <ArrowLeft
                  size={16}
                  className="rotate-180 text-[#5a6a82] group-hover:text-[#0057e7] transition-colors"
                />
              </div>
              <h3 className="mt-5 text-base font-black text-[#0d1b2e]">{item.label}</h3>
              <p className="mt-1.5 text-sm leading-5 text-[#5a6a82]">{item.description}</p>
              <span className="mt-4 inline-block text-xs font-bold text-[#0057e7]">Acessar módulo</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
