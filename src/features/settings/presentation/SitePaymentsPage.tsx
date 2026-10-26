import { useState } from "react";
import { ExternalLink, Link2, Copy, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

type HomologationInvitation = {
  id: string;
  url: string;
  expiresAt: string;
};

/**
 * Painel simplificado: somente convite privado para testar uma compra real.
 * Provedor, credenciais, configuração publicada, auditoria e histórico
 * permanecem preservados no banco/servidor e não são alterados nesta tela.
 */
export function SitePaymentsPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  const canUpdate = hasPermission("site_settings.update");
  const [invitation, setInvitation] = useState<HomologationInvitation | null>(null);
  const [loading, setLoading] = useState(false);

  const invitationAction = async (action: "homologation_create" | "homologation_revoke") => {
    if (!canUpdate || loading) return;
    if (action === "homologation_create" && !window.confirm(
      "Gerar um link privado para UMA compra real de homologação? " +
      "O convite vale por 2 horas e o pagamento pode cobrar valores reais, " +
      "gerar tarifas e movimentar o estoque. O checkout público permanecerá desativado."
    )) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("artvideo-store-payment-lab", {
        body: {
          action,
          ...(action === "homologation_revoke" && invitation
            ? { invitation_id: invitation.id }
            : {}),
        },
      });
      if (error) {
        const response = error.context;
        if (response instanceof Response) {
          const payload = await response.clone().json().catch(() => null);
          if (payload?.error) throw new Error(String(payload.error));
        }
        throw new Error("Não foi possível administrar o convite de homologação.");
      }
      if (data?.error) throw new Error(String(data.error));
      if (action === "homologation_create") {
        if (!data?.invitation?.id || !data.invitation.url || !data.invitation.expiresAt) {
          throw new Error("O servidor não retornou um link de homologação válido.");
        }
        setInvitation(data.invitation as HomologationInvitation);
      } else {
        setInvitation(null);
      }
      notifyAdmin(String(data?.message || "Convite atualizado."), "success");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível administrar o convite."), "error");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.url);
      notifyAdmin("Link de homologação copiado.", "success");
    } catch {
      notifyAdmin("Não foi possível copiar o link. Selecione o endereço para copiá-lo.", "error");
    }
  };

  if (!activeOrganization?.is_artvideo_tenant ||
      !hasPermission("site.view") || !hasPermission("site_settings.view")) return null;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Pagamentos" subtitle="Gerencie os links de homologação da loja." />

    <Section title="Link de homologação" description="Acesso privado para testar o checkout completo sem liberar as vendas ao público.">
      <div className="space-y-4">
        <p className="text-xs leading-6 text-muted-foreground">
          Cada link permite iniciar um pedido real e expira em 2 horas.
          O pagamento pode gerar cobrança, tarifas e movimentação de estoque.
          O limite é de 3 convites por hora e 12 por dia. Use uma conta compradora
          diferente da conta vendedora.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <BtnPrimary onClick={() => void invitationAction("homologation_create")}
            disabled={!canUpdate || loading} loading={loading}
            loadingText="Gerando link...">
            <Link2 size={16} /> Gerar link de homologação
          </BtnPrimary>
          {invitation && <BtnSecondary onClick={() => void invitationAction("homologation_revoke")}
            disabled={!canUpdate || loading}>
            Revogar link
          </BtnSecondary>}
        </div>

        {invitation && <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <ShieldCheck size={17} className="text-primary" />
            Convite gerado · válido até {new Date(invitation.expiresAt).toLocaleString("pt-BR")}
          </div>
          <input type="text" readOnly value={invitation.url}
            aria-label="Link privado de homologação"
            onFocus={event => event.currentTarget.select()}
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground" />
          <div className="flex flex-wrap items-center gap-2">
            <BtnSecondary onClick={() => void copyLink()}><Copy size={15} /> Copiar link</BtnSecondary>
            <a href={invitation.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold text-primary hover:bg-primary/5">
              <ExternalLink size={15} /> Abrir site de homologação
            </a>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Guarde o link: por segurança, seu endereço completo não será recuperado após recarregar a página.
          </p>
        </div>}
      </div>
    </Section>

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
    </AdminStickyToolbar>
  </div>;
}
