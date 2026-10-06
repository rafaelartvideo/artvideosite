import { useAuth } from "@/lib/auth";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { QueueIntegrationSettingsSection } from "./QueueIntegrationSettingsSection";

const UNION_QUEUE_URL = "https://fila.unionworld.com.br";

export function QueueIntegrationToolPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canUpdate = hasPermission("settings.update");

  if (!activeOrganizationId) return <LoadingState text="Carregando empresa ativa..." />;

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
