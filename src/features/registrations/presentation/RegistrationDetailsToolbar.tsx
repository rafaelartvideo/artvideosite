import { ContactRound, FileUser, History, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";

export function RegistrationDetailsToolbar({
  canViewContacts,
  canViewRecords,
  canViewPermissions,
  agendaAction,
  onOpenContacts,
  onOpenCustomerHistory,
  onOpenRecords,
  onOpenPermissions,
}: {
  canViewContacts: boolean;
  canViewRecords: boolean;
  canViewPermissions: boolean;
  agendaAction?: ReactNode;
  onOpenContacts: () => void;
  onOpenCustomerHistory?: () => void;
  onOpenRecords: () => void;
  onOpenPermissions: () => void;
}) {
  if (!canViewContacts && !onOpenCustomerHistory && !canViewRecords && !canViewPermissions && !agendaAction) return null;

  return <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
    {canViewContacts && <AdminButton
      variant="secondary"
      size="sm"
      onClick={onOpenContacts}
      aria-label="Contatos do cadastro"
      title="Contatos"
      className="h-9 px-2.5 sm:px-3"
    >
      <ContactRound size={15} />
      <span className="hidden sm:inline">Contatos</span>
    </AdminButton>}
    {onOpenCustomerHistory && <AdminButton
      variant="secondary"
      size="sm"
      onClick={onOpenCustomerHistory}
      aria-label="Ficha do cliente"
      title="Ficha do cliente"
      className="h-9 px-2.5 sm:px-3"
    >
      <FileUser size={15} />
      <span className="hidden sm:inline">Ficha do cliente</span>
    </AdminButton>}
    {canViewRecords && <AdminButton
      variant="secondary"
      size="sm"
      onClick={onOpenRecords}
      aria-label="Registros do cadastro"
      title="Registros"
      className="h-9 px-2.5 sm:px-3"
    >
      <History size={15} />
      <span className="hidden sm:inline">Registros</span>
    </AdminButton>}
    {agendaAction}
    {canViewPermissions && <AdminButton
      variant="secondary"
      size="sm"
      onClick={onOpenPermissions}
      aria-label="Acessos e permissões"
      title="Acessos e permissões"
      className="h-9 px-2.5 sm:px-3"
    >
      <ShieldCheck size={15} />
      <span className="hidden md:inline">Acessos e permissões</span>
    </AdminButton>}
  </div>;
}
