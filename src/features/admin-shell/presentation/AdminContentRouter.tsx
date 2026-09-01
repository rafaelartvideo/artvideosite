import type { ReactNode } from "react";
import type { AdminTab } from "../domain/admin.types";

export type AdminRoute = {
  element: ReactNode;
  requiresPermission?: boolean;
};

export type AdminRouteMap = Partial<Record<AdminTab, AdminRoute>>;

type AdminContentRouterProps = {
  activeTab: AdminTab;
  routes: AdminRouteMap;
  canAccessTab: (tab: AdminTab) => boolean;
};

export function AdminContentRouter({
  activeTab,
  routes,
  canAccessTab,
}: AdminContentRouterProps) {
  const route = routes[activeTab];

  if (!route) return null;
  if (route.requiresPermission !== false && !canAccessTab(activeTab)) return null;

  return <>{route.element}</>;
}
