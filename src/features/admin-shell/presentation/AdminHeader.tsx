import { Menu, X } from "lucide-react";
import logoSolo from "@/imports/LogoSoloSemFundo.png";
import type { AdminPageState } from "../domain/admin.types";

type AdminHeaderProps = {
  page: AdminPageState;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

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

export function AdminHeader({
  page,
  sidebarOpen,
  onToggleSidebar,
}: AdminHeaderProps) {
  const parentBreadcrumb = page ? normalizeBreadcrumb(page.breadcrumb, page.title) : "";

  return (
    <>
      <header className="relative z-40 shrink-0 border-b border-[#0d1b2e]/8 bg-white pt-[env(safe-area-inset-top)] shadow-sm md:hidden">
        <div className="relative flex h-16 items-center px-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            title={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            className="relative z-10 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent bg-[#0057e7] text-white shadow-sm transition-colors hover:bg-[#0046c0] active:bg-[#003da8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2"
          >
            {sidebarOpen ? <X size={20} strokeWidth={2.4} /> : <Menu size={21} strokeWidth={2.4} />}
          </button>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <img src={logoSolo} alt="ArtVideo" className="h-9 w-9 object-contain" />
          </div>
        </div>
      </header>

      {page && (
        <header className="sticky top-0 z-50 hidden min-w-0 border-b border-[#0d1b2e]/8 bg-white px-6 py-3.5 shadow-sm md:block">
          <div className="min-w-0">
            <div className="mb-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-[#5a6a82]">
              {parentBreadcrumb && <>
                <button
                  type="button"
                  onClick={page.onBack}
                  className="min-w-0 truncate font-semibold transition-colors hover:text-[#0057e7]"
                  title={parentBreadcrumb}
                >
                  {parentBreadcrumb}
                </button>
                <span aria-hidden="true" className="shrink-0">&gt;</span>
              </>}
              <span className="max-w-[220px] truncate" title={page.title}>{page.title}</span>
            </div>

            <h2 className={page.titleVariant === "order-number"
              ? "break-words text-2xl font-black leading-tight text-[#0057e7]"
              : "break-words text-[15px] font-black text-[#0d1b2e]"
            }>{page.title}</h2>
            {page.subtitle && <p className="mt-0.5 max-w-4xl break-words text-[14px] text-[#5a6a82]">{page.subtitle}</p>}
          </div>
        </header>
      )}
    </>
  );
}
