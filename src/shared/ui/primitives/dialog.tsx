"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Maximize2, Minimize2, XIcon } from "lucide-react";

import { cn } from "./utils";

const DialogMinimizeContext = React.createContext<{
  minimized: boolean;
  setMinimized: React.Dispatch<React.SetStateAction<boolean>>;
} | null>(null);

function Dialog({
  open,
  modal,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [minimized, setMinimized] = React.useState(false);

  React.useEffect(() => {
    if (open === false) setMinimized(false);
  }, [open]);

  return <DialogMinimizeContext.Provider value={{ minimized, setMinimized }}>
    <DialogPrimitive.Root
      data-slot="dialog"
      {...props}
      open={open}
      modal={minimized ? false : modal}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setMinimized(false);
        onOpenChange?.(nextOpen);
      }}
    />
  </DialogMinimizeContext.Provider>;
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

function DialogContent({
  className,
  children,
  showClose = true,
  showOverlay = true,
  minimizable,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showClose?: boolean;
  showOverlay?: boolean;
  minimizable?: boolean;
  overlayClassName?: string;
}) {
  const isAdminDialog = typeof className === "string" && className.includes("admin-crm");
  const minimizeContext = React.useContext(DialogMinimizeContext);
  const canMinimize = minimizable ?? isAdminDialog;
  const minimized = Boolean(canMinimize && minimizeContext?.minimized);

  return (
    <DialogPortal data-slot="dialog-portal">
      {showOverlay && !minimized && <DialogOverlay className={cn(isAdminDialog && "admin-dialog-overlay z-[140]", overlayClassName)} />}
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-admin-dialog-content={isAdminDialog ? "true" : undefined}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          isAdminDialog && "z-[150]",
          minimized && "!bottom-4 !left-auto !right-4 !top-auto !flex !w-[min(360px,calc(100vw-2rem))] !max-w-none !translate-x-0 !translate-y-0 !items-center !justify-between !gap-3 !rounded-xl !p-3",
          className,
        )}
        {...props}
      >
        {minimized ? <>
          <span className="min-w-0 truncate text-sm font-bold text-foreground">Janela minimizada</span>
          <button
            type="button"
            onClick={() => minimizeContext?.setMinimized(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Restaurar modal"
            title="Restaurar"
          >
            <Maximize2 size={15} />
          </button>
        </> : <>
          {children}
          {canMinimize && minimizeContext && <button
            type="button"
            onClick={() => minimizeContext.setMinimized(true)}
            className={cn(
              "absolute top-4 inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              showClose ? "right-12" : "right-11",
            )}
            aria-label="Minimizar modal"
            title="Minimizar"
          >
            <Minimize2 size={15} />
          </button>}
          {showClose && <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>}
        </>}
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
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
