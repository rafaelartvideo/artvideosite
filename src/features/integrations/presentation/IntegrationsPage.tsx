import { useState } from "react";
import { useSearchParams } from "react-router";
import { MessageCircle, ArrowLeft, ArrowRight, QrCode } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminStickyToolbar, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { SacDigitalSettingsPage } from "@/features/sac-digital/presentation/SacDigitalSettingsPage";
import { WhatsAppChannelsPage } from "@/features/whatsapp-channels/presentation/WhatsAppChannelsPage";

export function IntegrationsPage({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState<"sac" | "channels" | null>(
    searchParams.get("channels") === "1" ? "channels" : null,
  );
  const canSac = hasPermission("sac_digital.settings.manage");
  const canChannels = hasPermission("settings.channels.view") || hasPermission("settings.channels.manage");
  if (selected === "sac" && canSac) return <SacDigitalSettingsPage onBack={() => setSelected(null)} />;
  if (selected === "channels" && canChannels) return <WhatsAppChannelsPage onBack={() => setSelected(null)} />;
  return <div className="space-y-5">
    <PageHeader title="Integrações" subtitle="Configure serviços conectados à empresa ativa. Cada provedor mantém suas credenciais separadas." />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {canChannels && <button type="button" onClick={() => setSelected("channels")}
        className="group flex min-h-[155px] items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-blue-400 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-blue-500">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><QrCode size={23}/></span>
        <span className="min-w-0 flex-1">
          <strong className="text-base font-semibold">Canais de Atendimento</strong>
          <span className="mt-2 block text-sm leading-6 text-muted-foreground">Conecte o WhatsApp Business da empresa por QR Code, com sessões isoladas e acesso controlado.</span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">Gerenciar canais <ArrowRight size={15}/></span>
        </span>
      </button>}
      {canSac && <button type="button" onClick={() => setSelected("sac")}
        className="group flex min-h-[155px] items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-blue-400 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-blue-500">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><MessageCircle size={23}/></span>
        <span className="min-w-0 flex-1">
          <strong className="text-base font-semibold">SAC Digital</strong>
          <span className="mt-2 block text-sm leading-6 text-muted-foreground">Conta e conexão, operadores, mensagens para OS e orçamentos, webhooks e menus personalizados.</span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">Configurar SAC Digital <ArrowRight size={15}/></span>
        </span>
      </button>}
    </div>
    {!canChannels && !canSac && <p className="text-sm text-muted-foreground">Você não possui permissão para gerenciar integrações.</p>}
    <AdminStickyToolbar>
      <AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</AdminButton>
    </AdminStickyToolbar>
  </div>;
}
