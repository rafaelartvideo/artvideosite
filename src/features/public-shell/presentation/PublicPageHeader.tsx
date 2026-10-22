import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function PublicBreadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return <nav aria-label="Navegação estrutural" className="art-public-breadcrumb border-y border-white/20 bg-gradient-to-r from-[#172938] via-[#1b3346] to-[#264358] text-white">
    <ol className="mx-auto flex max-w-[1344px] items-center gap-2 overflow-hidden px-5 py-3.5 text-[13px] sm:px-8 lg:px-10">
      {items.map((item, index) => <li key={`${index}-${item.label}`} className={`flex min-w-0 items-center gap-2 ${index === items.length - 1 ? "" : "shrink-0"}`}>
        {index > 0 && <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-white/45"/>}
        {item.onClick ? <button type="button" onClick={item.onClick} className="whitespace-nowrap rounded-sm text-white/75 underline-offset-4 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{item.label}</button>
          : <span aria-current={index === items.length - 1 ? "page" : undefined} className="min-w-0 truncate font-semibold text-white">{item.label}</span>}
      </li>)}
    </ol>
  </nav>;
}

export function PublicPageHeader({ title, description, children }: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return <section className="art-public-page-header relative isolate overflow-hidden bg-gradient-to-r from-[#172938] via-[#1b3346] to-[#264358] text-white">
    <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"/>
    <div className="mx-auto max-w-[1344px] px-5 py-9 sm:px-8 sm:py-11 lg:px-10">
      <h1 className="max-w-4xl text-[30px] font-semibold leading-tight tracking-[-.035em] sm:text-[40px]">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-[15px] leading-7 text-white/80">{description}</p>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  </section>;
}
