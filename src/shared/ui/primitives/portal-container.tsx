import { createContext, useContext, type ReactNode } from "react";

// Scoped to a detached editor, never changes other CRM windows.
const PortalContainerContext = createContext<HTMLElement | undefined>(undefined);
export function PortalContainerProvider({ container, children }: {container?: HTMLElement; children:ReactNode}) {
  return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>;
}
export function usePortalContainer() { return useContext(PortalContainerContext); }
