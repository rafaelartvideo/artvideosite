import { ContactRound, History, ShieldCheck } from "lucide-react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";

export function RegistrationDetailsToolbar({
  canViewContacts,
  canViewRecords,
  canViewPermissions,
  onOpenContacts,
  onOpenRecords,
  onOpenPermissions,
}: {
  canViewContacts: boolean;
  canViewRecords: boolean;
  canViewPermissions: boolean;
  onOpenContacts: () => void;
  onOpenRecords: () => void;
  onOpenPermissions: () => void;
}) {
  if (!canViewContacts && !canViewRecords && !canViewPermissions) return null;

  return <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-1">
    <div className="hidden h-7 w-px shrink-0 bg-[#0d1b2e]/12 sm:block" aria-hidden="true" />
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
