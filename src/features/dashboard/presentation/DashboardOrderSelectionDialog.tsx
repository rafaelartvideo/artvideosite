import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, PanelTop, X } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingSpinner, notifyAdmin, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { adminPath } from "@/features/admin-shell/admin-routes";
import type { DashboardOrderGroupItem } from "../domain/dashboard";

type DetachedWindow = { popup: Window; host: HTMLDivElement };
type Props = {
  title: string; description: string; rows: DashboardOrderGroupItem[];
  total: number; page: number; pageSize: number; loading: boolean;
  error: string | null; canOpen: boolean; onClose: () => void;
  onRetry: () => void; onPageChange: (page: number) => void;
};

function syncTheme(target: Document) {
  target.documentElement.className = document.documentElement.className;
  target.documentElement.style.cssText = document.documentElement.style.cssText;
  target.documentElement.lang = document.documentElement.lang || "pt-BR";
  const shell = document.querySelector<HTMLElement>("[data-admin-shell]");
  const theme = shell?.dataset.theme || (document.documentElement.classList.contains("dark") ? "dark" : "light");
  target.body.className = document.body.className;
  target.body.classList.add("admin-crm");
  target.body.classList.toggle("dark", theme === "dark");
  target.body.dataset.theme = theme;
}

function openSelectionWindow(): DetachedWindow | null {
  const popup = window.open("", "_blank", "popup=yes,width=920,height=760,resizable=yes,scrollbars=yes");
  if (!popup) return null;
  try {
    const target = popup.document;
    popup.opener = null;
    for (const source of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
      const link = target.createElement("link");
      link.rel = "stylesheet"; link.href = source.href;
      if (source.crossOrigin !== null) link.crossOrigin = source.crossOrigin;
      if (source.integrity) link.integrity = source.integrity;
      if (source.media) link.media = source.media;
      target.head.appendChild(link);
    }
    for (const source of document.querySelectorAll<HTMLStyleElement>("style")) {
      const style = target.createElement("style");
      if (source.nonce) style.nonce = source.nonce;
      style.textContent = source.textContent;
      target.head.appendChild(style);
    }
    syncTheme(target);
    target.body.style.margin = "0";
    const host = target.createElement("div");
    target.body.replaceChildren(host);
    return { popup, host };
  } catch {
    popup.close();
    return null;
  }
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("pt-BR", {timeZone:"America/Sao_Paulo"}) : "—";
}

export function DashboardOrderSelectionDialog(props: Props) {
  const {title,description,rows,total,page,pageSize,loading,error,canOpen,onClose,onRetry,onPageChange} = props;
  const [detached,setDetached] = useState<DetachedWindow | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!detached) return;
    const {popup,host} = detached;
    const target = host.ownerDocument;
    const observer = new MutationObserver(() => { if (!popup.closed) syncTheme(target); });
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["class","style","lang"]});
    const shell = document.querySelector("[data-admin-shell]");
    if (shell) observer.observe(shell,{attributes:true,attributeFilter:["class","data-theme"]});
    const closePopup = () => { if (!popup.closed) popup.close(); };
    window.addEventListener("pagehide",closePopup);
    const timer = window.setInterval(() => {
      let unavailable = popup.closed;
      if (!unavailable) { try { unavailable = popup.document !== target; } catch { unavailable = true; } }
      if (unavailable) { window.clearInterval(timer); closeRef.current(); }
    },500);
    return () => { observer.disconnect(); window.clearInterval(timer); window.removeEventListener("pagehide",closePopup); closePopup(); };
  },[detached]);
  useEffect(() => {
    if (detached && !detached.popup.closed) detached.host.ownerDocument.title = title + " · Union World";
  },[detached,title]);
  const detach = () => {
    if (detached) { detached.popup.focus(); return; }
    const next = openSelectionWindow();
    if (!next) { notifyAdmin("Permita pop-ups da Union World para destacar a lista.","error"); return; }
    setDetached(next); next.popup.focus();
  };
  const reintegrate = () => { setDetached(null); window.focus(); };
  const body = <div className="flex min-h-0 flex-1 flex-col" aria-busy={loading}>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 sm:px-4">
      {loading ? <div className="flex h-full min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><LoadingSpinner size="sm"/> Carregando ordens...</div>
        : error ? <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"><p>{error}</p><AdminButton size="sm" onClick={onRetry}>Tentar novamente</AdminButton></div>
        : rows.length === 0 ? <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">Nenhuma ordem encontrada.</div>
        : <div className="divide-y divide-border">
          {rows.map(order => {
            const content = <>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-bold text-foreground">OS {order.os_number || order.id.slice(0,8)}{order.quote_version != null && <span className="ml-2 text-xs font-medium text-muted-foreground">Orçamento v{order.quote_version}</span>}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{order.customer?.full_name || order.customer?.name || "Cliente não informado"} · {dateLabel(order.event_at || order.created_at)}</p>
              </div>
              <div className="flex max-w-[50%] shrink-0 flex-wrap justify-end gap-1.5">
                {order.order_status && <StatusBadge status={order.order_status.name || "Sem status"} color={order.order_status.color}/>}
                {order.situation && <StatusBadge status={order.situation.name || "Sem situação"} color={order.situation.color}/>}
              </div>
              {canOpen && <ExternalLink size={14} className="shrink-0 text-primary"/>}
            </>;
            const key = order.row_key || order.id;
            const rowClass = "flex min-w-0 w-full items-center gap-3 px-2 py-3 text-left";
            return canOpen ? <a key={key} href={new URL(adminPath("orders",order.id),window.location.origin).href} target="_blank" rel="noopener noreferrer" className={rowClass + " cursor-pointer rounded-md hover:bg-muted/70 focus-visible:outline focus-visible:outline-primary"}>{content}</a>
              : <div key={key} className={rowClass}>{content}</div>;
          })}
        </div>}
    </div>
    <div className="shrink-0 border-t border-border">
      <PaginationBar page={page} pageSize={pageSize} totalItems={total} defaultPageSize={pageSize}
        showPageSizeSelector={false} onPageChange={onPageChange} onPageSizeChange={()=>undefined}/>
    </div>
  </div>;
  if (detached) return createPortal(
    <section data-dashboard-orders-detached="true" className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{title}</h1><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
        <div className="flex shrink-0 items-center gap-2"><AdminButton variant="secondary" size="sm" onClick={reintegrate}><PanelTop size={15}/> Reintegrar ao CRM</AdminButton><button type="button" aria-label="Fechar janela destacada" onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X size={17}/></button></div>
      </header>
      {body}
    </section>,detached.host);
  return <AdminDialog open onClose={onClose} title={title} description={description}
    draggable floating minimizable={false}
    className="!h-[min(74dvh,680px)] !max-h-[calc(100dvh-1rem)] !w-[calc(100vw-1rem)] !max-w-[820px]"
    bodyClassName="!flex !min-h-0 !flex-1 !flex-col !overflow-hidden !p-0"
    headerActions={<AdminButton variant="secondary" size="sm" aria-label="Destacar janela" onClick={detach} className="hidden md:inline-flex"><ExternalLink size={15}/> Destacar janela</AdminButton>}>
    {body}
  </AdminDialog>;
}
