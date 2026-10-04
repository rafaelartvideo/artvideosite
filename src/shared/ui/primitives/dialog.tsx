"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Minimize2, XIcon } from "lucide-react";

import {
  useAdminDialogOwner,
  useOptionalAdminDialogManager,
} from "@/shared/ui/admin/AdminDialogManager";
import { cn } from "./utils";

type DialogRuntimeValue = {
  id: string;
  ownerKey: string;
  minimized: boolean;
  requestClose: () => void;
};

const DialogRuntimeContext = React.createContext<DialogRuntimeValue | null>(null);

function Dialog({
  open,
  defaultOpen,
  modal,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const manager = useOptionalAdminDialogManager();
  const unregisterDialog = manager?.unregisterDialog;
  const ownerKey = useAdminDialogOwner();
  const id = React.useId();
  const [internalOpen, setInternalOpen] = React.useState(Boolean(defaultOpen));
  const effectiveOpen = open ?? internalOpen;
  const minimized = Boolean(manager?.tasks.find(task => task.id === id)?.minimized);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!effectiveOpen) unregisterDialog?.(id);
  }, [effectiveOpen, id, unregisterDialog]);

  React.useEffect(() => () => {
    unregisterDialog?.(id);
  }, [id, unregisterDialog]);

  const runtime = React.useMemo<DialogRuntimeValue>(() => ({
    id,
    ownerKey,
    minimized,
    requestClose: () => handleOpenChange(false),
  }), [id, ownerKey, minimized, handleOpenChange]);

  return <DialogRuntimeContext.Provider value={runtime}>
    <DialogPrimitive.Root
      data-slot="dialog"
      {...props}
      open={effectiveOpen}
      modal={minimized ? false : modal}
      onOpenChange={handleOpenChange}
    />
  </DialogRuntimeContext.Provider>;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function useDialogMinimizeAction(title: string, description?: React.ReactNode) {
  const runtime = React.useContext(DialogRuntimeContext);
  const manager = useOptionalAdminDialogManager();

  return () => {
    if (!runtime || !manager) return;
    manager.pinDialog({
      id: runtime.id,
      ownerKey: runtime.ownerKey,
      title,
      description,
      onClose: runtime.requestClose,
    });
  };
}

function DialogMinimizeButton({
  title = "Janela minimizada",
  description,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  className?: string;
}) {
  const runtime = React.useContext(DialogRuntimeContext);
  const manager = useOptionalAdminDialogManager();
  const minimize = useDialogMinimizeAction(title, description);

  if (!runtime || !manager || runtime.minimized) return null;

  return <button
    type="button"
    onClick={minimize}
    className={cn(
      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      className,
    )}
    aria-label={`Minimizar ${title}`}
    title="Minimizar"
  >
    <Minimize2 size={15} />
  </button>;
}

function DialogContent({
  className,
  children,
  showClose = true,
  showOverlay = true,
  minimizable,
  showMinimizeControl = true,
  minimizedTitle,
  minimizedDescription,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showClose?: boolean;
  showOverlay?: boolean;
  minimizable?: boolean;
  showMinimizeControl?: boolean;
  minimizedTitle?: string;
  minimizedDescription?: React.ReactNode;
  overlayClassName?: string;
}) {
  const isAdminDialog = typeof className === "string" && className.includes("admin-crm");
  const runtime = React.useContext(DialogRuntimeContext);
  const manager = useOptionalAdminDialogManager();
  const canMinimize = Boolean((minimizable ?? isAdminDialog) && runtime && manager);
  const fallbackTitle = typeof props["aria-label"] === "string" ? props["aria-label"] : "Janela minimizada";
  const dockTitle = minimizedTitle || fallbackTitle;
  const minimize = useDialogMinimizeAction(dockTitle, minimizedDescription);

  if (canMinimize && runtime?.minimized) return null;

  return (
    <DialogPortal data-slot="dialog-portal">
      {showOverlay && <DialogOverlay className={cn(isAdminDialog && "admin-dialog-overlay z-[140]", overlayClassName)} />}
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-admin-dialog-content={isAdminDialog ? "true" : undefined}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          isAdminDialog && "z-[150]",
          className,
        )}
        {...props}
      >
        {children}
        {canMinimize && showMinimizeControl && <button
          type="button"
          onClick={minimize}
          className={cn(
            "absolute top-4 inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            "right-12",
          )}
          aria-label={`Minimizar ${dockTitle}`}
          title="Minimizar"
        >
          <Minimize2 size={15} />
        </button>}
        {showClose && <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogMinimizeButton,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
