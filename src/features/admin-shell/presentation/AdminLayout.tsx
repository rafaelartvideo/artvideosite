import type { ReactNode } from "react";
import { AdminFeedbackHost } from "@/shared/ui/admin/AdminFeedback";
import { UniqCallOverlay } from "@/features/telephony/presentation/UniqCallOverlay";

type AdminLayoutProps = {
  sidebar: ReactNode;
  header: ReactNode;
  mobileSidebarOpen: boolean;
  onCloseMobileSidebar: () => void;
  children: ReactNode;
};

export function AdminLayout({
  sidebar,
  header,
  mobileSidebarOpen,
  onCloseMobileSidebar,
  children,
}: AdminLayoutProps) {
  return (
    <div className="admin-crm h-screen overflow-hidden bg-[#f8fafc] flex">
      <AdminFeedbackHost />
      <UniqCallOverlay />

      <aside className="hidden md:flex w-60 flex-shrink-0 bg-[#0d1b2e] flex-col fixed left-0 top-0 h-full z-40">
        {sidebar}
      </aside>

      {mobileSidebarOpen && (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onCloseMobileSidebar}
          />
          <aside className="fixed left-0 top-0 h-full w-64 bg-[#0d1b2e] flex flex-col z-50 md:hidden">
            {sidebar}
          </aside>
        </>
      )}

      <main className="flex-1 md:ml-60 flex flex-col h-screen min-h-0 overflow-hidden">
        {header}
        {children}
      </main>
    </div>
  );
}
