import { useState } from "react";
import { MessageCircle, ArrowRight, QrCode } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { SacDigitalSettingsPage } from "@/features/sac-digital/presentation/SacDigitalSettingsPage";
import { UnionWhatsAppInboxPage } from "@/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage";
import { WhatsAppChannelsPage } from "@/features/whatsapp-channels/presentation/WhatsAppChannelsPage";

export function IntegrationsPage({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [selected, setSelected] = useState<"sac" | "channels" | "inbox" | null>(null);
  const canSac = hasPermission("sac_digital.settings.manage");
  const canInbox = hasPermission("whatsapp.inbox.view");
  const canChannels = hasPermission("settings.channels.view") || hasPermission("settings.channels.manage");
  if (selected === "sac" && canSac) return <SacDigitalSettingsPage onBack={() => setSelected(null)} />;
  if (selected === "channels" && canChannels) return <WhatsAppChannelsPage onBack={() => setSelected(null)} onOpenInbox={canInbox ? () => setSelected("inbox") : undefined} />;
  if (selected === "inbox" && canInbox) return <UnionWhatsAppInboxPage onBack={() => setSelected(null)} onConfigure={() => setSelected("channels")} />;
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
      {canInbox && <button type="button" onClick={() => setSelected("inbox")}
        className="group flex min-h-[155px] items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-blue-400 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-blue-500">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><MessageCircle size={23}/></span>
        <span className="min-w-0 flex-1">
          <strong className="text-base font-semibold">Atendimento WhatsApp</strong>
          <span className="mt-2 block text-sm leading-6 text-muted-foreground">Caixa de entrada própria com o visual do SAC Digital, conversas e mensagens isoladas por empresa.</span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">Abrir conversas <ArrowRight size={15}/></span>
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
    {!canChannels && !canSac && !canInbox && <p className="text-sm text-muted-foreground">Você não possui permissão para gerenciar integrações.</p>}
  </div>;
}
