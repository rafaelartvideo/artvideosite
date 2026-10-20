import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AdminFeedbackHost } from "@/shared/ui/admin/AdminFeedback";
import { UniqCallOverlay } from "@/features/telephony/presentation/UniqCallOverlay";

type AdminSidebarLayoutContextValue = {
  collapsed: boolean;
  canCollapse: boolean;
  toggleCollapsed: () => void;
};

export type AdminTheme = "light" | "dark";

type AdminThemeContextValue = {
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
};

const AdminSidebarLayoutContext = createContext<AdminSidebarLayoutContextValue>({
  collapsed: false,
  canCollapse: false,
  toggleCollapsed: () => undefined,
});

const AdminThemeContext = createContext<AdminThemeContextValue>({
  theme: "light",
  setTheme: () => undefined,
});

export function useAdminSidebarLayout() {
  return useContext(AdminSidebarLayoutContext);
}

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}

type AdminLayoutProps = {
  sidebar: ReactNode;
  header: ReactNode;
  mobileSidebarOpen: boolean;
  onCloseMobileSidebar: () => void;
  children: ReactNode;
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "unionworld.admin.sidebar.collapsed";
const LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY = "artvideo.admin.sidebar.collapsed";
const ADMIN_THEME_STORAGE_KEY = "unionworld.admin.theme";

export function AdminLayout({
  sidebar,
  header,
  mobileSidebarOpen,
  onCloseMobileSidebar,
  children,
}: AdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY);
    return stored === "true";
  });
  const [theme, setTheme] = useState<AdminTheme>(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.adminTheme = theme;
    return () => {
      document.documentElement.classList.remove("dark");
      delete document.documentElement.dataset.adminTheme;
    };
  }, [theme]);

  const toggleCollapsed = () => setSidebarCollapsed(current => !current);

  return (
    <AdminThemeContext.Provider value={{ theme, setTheme }}>
      <div className={`admin-crm ${theme === "dark" ? "dark" : ""} flex h-screen min-w-0 overflow-hidden bg-background text-foreground`} data-theme={theme}>
        <AdminFeedbackHost />
        <UniqCallOverlay />

        <aside
          className={`fixed left-0 top-0 z-40 hidden h-full flex-shrink-0 flex-col bg-[#0d1b2e] transition-[width] duration-200 ease-out md:flex ${sidebarCollapsed ? "w-[72px]" : "w-60"}`}
        >
          <AdminSidebarLayoutContext.Provider value={{ collapsed: sidebarCollapsed, canCollapse: true, toggleCollapsed }}>
            {sidebar}
          </AdminSidebarLayoutContext.Provider>
        </aside>

        {mobileSidebarOpen && (
          <>
            <button
              type="button"
              aria-label="Fechar menu"
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={onCloseMobileSidebar}
            />
            <aside className="fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-[#0d1b2e] md:hidden">
              <AdminSidebarLayoutContext.Provider value={{ collapsed: false, canCollapse: false, toggleCollapsed: () => undefined }}>
                {sidebar}
              </AdminSidebarLayoutContext.Provider>
            </aside>
          </>
        )}

        <main
          className={`flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out ${sidebarCollapsed ? "md:ml-[72px]" : "md:ml-60"}`}
        >
          {header}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </main>
      </div>
    </AdminThemeContext.Provider>
  );
}
