import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { useAuth } from "@/lib/auth";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";

import { QueueIntegrationSettingsSection } from "./QueueIntegrationSettingsSection";

const UNION_QUEUE_URL = "https://fila.unionworld.com.br";

export function QueueIntegrationToolPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canUpdate = hasPermission("queue.manage");

  if (!activeOrganizationId) return <AdminWorkspaceSkeleton variant="details" rows={2} columns={4} />;

  return <div className="min-w-0 space-y-5">
    <PageHeader
      title="Union Senhas"
      subtitle="Configuração da integração entre o CRM e o sistema de fila e senhas."
    />

    <div className="min-w-0 space-y-5 p-4 sm:p-5">
      <QueueIntegrationSettingsSection
        organizationId={activeOrganizationId}
        canUpdate={canUpdate}
      />
    </div>

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar para Ferramentas</BtnSecondary>
      <BtnPrimary onClick={() => window.open(UNION_QUEUE_URL, "_blank", "noopener,noreferrer")}>
        Abrir Union Senhas
      </BtnPrimary>
    </AdminStickyToolbar>
  </div>;
}
