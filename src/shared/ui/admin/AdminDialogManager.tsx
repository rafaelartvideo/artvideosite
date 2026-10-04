"use client";

import * as React from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";

type AdminDialogTask = {
  id: string;
  ownerKey: string;
  title: string;
  description?: React.ReactNode;
  minimized: boolean;
  order: number;
  onClose: () => void;
};

type PinDialogInput = {
  id: string;
  ownerKey: string;
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
};

type AdminDialogManagerValue = {
  tasks: AdminDialogTask[];
  retainedOwnerKeys: Set<string>;
  pinDialog: (input: PinDialogInput) => void;
  setMinimized: (id: string, minimized: boolean) => void;
  unregisterDialog: (id: string) => void;
};

const AdminDialogManagerContext = React.createContext<AdminDialogManagerValue | null>(null);
const AdminDialogOwnerContext = React.createContext("admin-global");

export function AdminDialogOwnerProvider({
  ownerKey,
  children,
}: {
  ownerKey: string;
  children: React.ReactNode;
}) {
  return <AdminDialogOwnerContext.Provider value={ownerKey}>{children}</AdminDialogOwnerContext.Provider>;
}

export function useAdminDialogOwner() {
  return React.useContext(AdminDialogOwnerContext);
}

export function useOptionalAdminDialogManager() {
  return React.useContext(AdminDialogManagerContext);
}

export function useAdminDialogManager() {
  const value = React.useContext(AdminDialogManagerContext);
  if (!value) throw new Error("useAdminDialogManager must be used inside AdminDialogManagerProvider.");
  return value;
}

export function AdminDialogManagerProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = React.useState<AdminDialogTask[]>([]);
  const orderRef = React.useRef(0);

  const pinDialog = React.useCallback((input: PinDialogInput) => {
    setTasks(current => {
      const existing = current.find(item => item.id === input.id);
      if (existing) {
        return current.map(item => item.id === input.id
          ? { ...item, ownerKey: input.ownerKey, title: input.title, description: input.description, minimized: true, onClose: input.onClose }
          : item);
      }
      orderRef.current += 1;
      return [...current, { ...input, minimized: true, order: orderRef.current }];
    });
  }, []);

  const setMinimized = React.useCallback((id: string, minimized: boolean) => {
    setTasks(current => current.map(item => item.id === id ? { ...item, minimized } : item));
  }, []);

  const unregisterDialog = React.useCallback((id: string) => {
    setTasks(current => current.filter(item => item.id !== id));
  }, []);

  const retainedOwnerKeys = React.useMemo(
    () => new Set(tasks.map(task => task.ownerKey)),
    [tasks],
  );

  const value = React.useMemo<AdminDialogManagerValue>(() => ({
    tasks,
    retainedOwnerKeys,
    pinDialog,
    setMinimized,
    unregisterDialog,
  }), [tasks, retainedOwnerKeys, pinDialog, setMinimized, unregisterDialog]);

  return <AdminDialogManagerContext.Provider value={value}>
    {children}
    <AdminMinimizedDialogDock tasks={tasks} setMinimized={setMinimized} />
  </AdminDialogManagerContext.Provider>;
}

function AdminMinimizedDialogDock({
  tasks,
  setMinimized,
}: {
  tasks: AdminDialogTask[];
  setMinimized: (id: string, minimized: boolean) => void;
}) {
  const minimized = tasks
    .filter(task => task.minimized)
    .sort((a, b) => a.order - b.order);

  if (!minimized.length) return null;

  return <div
    className="pointer-events-none fixed bottom-4 right-4 z-[240] flex w-[calc(100vw-2rem)] flex-row-reverse flex-wrap-reverse content-end items-end gap-2"
    aria-label="Modais minimizados"
  >
    {minimized.map(task => <div
      key={task.id}
      className="admin-crm pointer-events-auto flex w-[min(360px,calc(100vw-2rem))] min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-card-foreground shadow-2xl"
    >
      <button
        type="button"
        onClick={() => setMinimized(task.id, false)}
        className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted"
        title={task.title}
      >
        <span className="block truncate text-sm font-bold text-foreground">{task.title}</span>
        {task.description ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{task.description}</span> : null}
      </button>
      <button
        type="button"
        onClick={() => setMinimized(task.id, false)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Restaurar ${task.title}`}
        title="Restaurar"
      >
        <Maximize2 size={15} />
      </button>
      <button
        type="button"
        onClick={task.onClose}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors",
          "hover:bg-red-50 hover:text-red-600",
        )}
        aria-label={`Fechar ${task.title}`}
        title="Fechar"
      >
        <X size={15} />
      </button>
    </div>)}
  </div>;
}
